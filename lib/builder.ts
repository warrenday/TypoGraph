import { print } from "graphql";
import { ExtractValue, FieldWithArgs, Merge } from "./types/common";
import builderToAst from "./utils/builderToAst";
import detectConflicts from "./utils/detectConflicts";
import evaluate from "./utils/evaluate";
import merge from "./utils/merge";

type TypeDef = Record<string, unknown>;

// Unwraps a TypeBuilder<U, NN> at the field level, lifting the nullability
// flag (`NonNull extends boolean`) into the TS type: non-null builders
// unwrap to `U`, nullable builders unwrap to `U | undefined` so the
// `MakeOptional` step downstream can turn the key into an optional
// property. Used by both `t.type({...})` and the public builder methods so
// we have a single canonical helper.
type UnwrapTypeBuilder<T> = T extends Record<string, any>
  ? {
      [K in keyof T]: T[K] extends TypeBuilder<infer U, infer NN>
        ? NN extends true
          ? U
          : U | undefined
        : T[K];
    }
  : T;

// Same lift as `UnwrapTypeBuilder`, but for the `builder.field` input map
// where the value might be a raw TypeBuilder rather than the already
// unwrapped shape `t.type({...})` produces. Anything that *isn't* a
// TypeBuilder passes through verbatim so users can pass already-unwrapped
// TS types if they prefer.
type UnwrapFieldInput<I> = {
  [K in keyof I]: I[K] extends TypeBuilder<infer U, infer NN>
    ? NN extends true
      ? U
      : U | undefined
    : I[K];
};

// Recursively unwrap a `builder.field` output type to its underlying TS
// shape. The user typically writes one of:
//   - `output: t.type<Comment[]>("[Comment]")`               — TypeBuilder
//   - `output: () => t.type<Comment[]>("[Comment]")`         — thunk
// so we have to peel both layers to land on `Comment[]`. Without the thunk
// branch the inferred output stays as `() => TypeBuilder<...>` and the
// brand carries a function-shaped output that downstream consumers can't
// dereference.
type UnwrapFieldOutput<T> = T extends () => infer R
  ? UnwrapFieldOutput<R>
  : T extends TypeBuilder<infer U>
  ? U
  : T;

type Builder = {
  /**
   * Declare a typograph typeDef block — the top-level object literal that
   * maps GraphQL type names to their field definitions and that carries
   * `Query` / `Mutation` / `Subscription` operation maps.
   *
   * At runtime this is a pure identity function: it returns its argument
   * unchanged. All the work is at the type level — the generic `T`
   * captures the literal shape so `combineTypeDefs` can later merge and
   * evaluate it, and so consumers can derive `type TypeDefs = typeof
   * typeDefs;` as the single source of truth for both client and
   * resolver types.
   */
  typeDef: <T>(typeDef: T) => { types: UnwrapTypeBuilder<T>; toSDL: () => string };
  combineTypeDefs: <T extends { types: TypeDef }>(
    typeDefs: T[]
  ) => { types: Merge<T["types"][]>; toSDL: () => string };
  /**
   * Declare a reusable object type. At runtime a pass-through identity
   * function; at the type level, `ExtractValue` unwraps any thunk-valued
   * fields (used for circular refs) and `UnwrapTypeBuilder` coerces each
   * `TypeBuilder<U>` into its underlying TS value type.
   */
  type: <T>(type: T) => UnwrapTypeBuilder<ExtractValue<T>>;
  /**
   * Declare a Query operation. Runtime identity; the generic captures
   * `input` / `output` so `Resolvers<T>` and the client's selection-set
   * inference can project the operation's shape end-to-end.
   */
  query: <T>(query: T) => UnwrapTypeBuilder<T>;
  /**
   * Declare a Mutation operation. Runtime identity; see `query` for the
   * type-level role.
   */
  mutation: <T>(mutation: T) => UnwrapTypeBuilder<T>;
  /**
   * Declare a Subscription operation. Runtime identity; see `query` for
   * the type-level role. The resolver type gains a `subscribe`/`resolve`
   * pair for each subscription field via `Resolvers<T>`.
   */
  subscription: <T>(subscription: T) => UnwrapTypeBuilder<T>;
  // Declare an `input` GraphQL type. The runtime value is a tagged wrapper
  // (`{ __kind: "input", fields }`) so the SDL pipeline can emit
  // `input Foo { ... }` instead of `type Foo { ... }`. The static type is
  // the unwrapped field shape, so consumers see the input fields directly
  // when they reference the type via `t.type<T>("Foo!")`.
  inputType: <T extends Record<string, any>>(fields: T) => UnwrapTypeBuilder<T>;
  // Declare a type field that takes its own arguments (Q8 — used to bind
  // a per-field arg map onto a nested selection via `args(...)`). The
  // runtime value is a tagged wrapper that the SDL pipeline picks up to
  // emit `fieldName(arg: Type): Output` inside an object type.
  //
  // Statically the field returns a `FieldWithArgs<I, O>` brand carrying
  // both the unwrapped input map and the unwrapped output type. The brand
  // survives `builder.type` / `combineTypeDefs` so:
  //   - the resolver type (`Resolvers<T>`) can model the field as
  //     `(parent: T, args: I) => O` instead of falling back to a
  //     parent-only signature, and
  //   - `MergedVariables` (in `client.ts`) can walk the selection tree,
  //     spot a nested `args(...)` wrapper bound to this field, and
  //     contribute the renamed arg keys to the operation's variables shape.
  //
  // Selection-set inference (`SelectionSet` / `SelectFields`) peels the
  // brand transparently via `PeelFieldArgs`, so a branded field is still
  // a regular field as far as the query API is concerned.
  field: <
    TInput extends Record<string, any>,
    TOutput
  >(opts: {
    input: TInput;
    output: TOutput;
  }) => FieldWithArgs<UnwrapFieldInput<TInput>, UnwrapFieldOutput<TOutput>>;
};

export const createTypeDefBuilder = (): Builder => {
  const builder: Builder = {
    typeDef: (typeDef) => {
      const evaluated = evaluate(typeDef as object);
      const toSDL = () => {
        const ast = builderToAst(evaluated as any);
        return print(ast);
      };
      return { types: evaluated, toSDL } as any;
    },
    combineTypeDefs: (typeDefs) => {
      // Extract the already-evaluated `.types` from each wrapped typeDef.
      const rawTypes = typeDefs.map((td: any) => td.types);

      // Dev-only: surface structural conflicts between typeDefs before the
      // deep-merge silently later-wins. The most common footgun is two
      // schema files both declaring e.g. `Query.getPost` with different
      // inputs/outputs — deep-merge merges the objects but any leaf-level
      // value (a type string, a default, a nested wrapper) is dropped in
      // favor of whichever came last. Warning gives the user a chance to
      // notice before the wrong resolver shape hits production.
      if (
        typeof process !== "undefined" &&
        process.env?.NODE_ENV !== "production"
      ) {
        const conflicts = detectConflicts(rawTypes as readonly unknown[]);
        if (conflicts.length > 0) {
          // eslint-disable-next-line no-console
          console.warn(
            `[typograph] combineTypeDefs: ${conflicts.length} conflicting definition(s) detected. Later typeDefs silently override earlier ones at:\n  - ${conflicts.join("\n  - ")}`
          );
        }
      }

      // Deep-merge the pre-evaluated types from each typeDef.
      const merged = merge(...rawTypes);

      const toSDL = () => {
        const ast = builderToAst(merged as any);
        return print(ast);
      };

      return { types: merged as any, toSDL };
    },
    type: (type) => type as any,
    query: (query) => query as any,
    mutation: (mutation) => mutation as any,
    subscription: (subscription) => subscription as any,
    // The wrapper carries `__kind: "input"` so `builderToAst` can detect
    // it among the top-level type definitions and emit
    // `INPUT_OBJECT_TYPE_DEFINITION`. The cast to `any` lies to TS so the
    // wrapper appears as the unwrapped field shape, which is what users
    // see when they reference the input type elsewhere.
    inputType: (fields) =>
      ({ __kind: "input", fields } as unknown as any),
    // Tagged wrapper for a field that takes its own arguments. The runtime
    // pipeline (`evaluate` + `builderToAst`) detects `__kind: "field"` and
    // emits `fieldName(arg: Type): Output` inside the surrounding object
    // type. The static type collapses to the unwrapped output so existing
    // selection-set inference walks through it transparently.
    field: (opts) =>
      ({
        __kind: "field",
        input: opts.input,
        output: opts.output,
      } as unknown as any),
  };

  return builder;
};

// Sentinel used to distinguish "no default supplied" from "default is
// undefined". We never want to treat the latter as a real default — passing
// `t.string({ default: undefined })` shouldn't change anything.
const NO_DEFAULT = Symbol("NO_DEFAULT");

export class TypeBuilder<T = any, NonNull extends boolean = false> {
  private typeString: string;
  private _isNonNull: boolean;
  private _default: unknown;

  // The second generic parameter carries nullability into the type system
  // so `UnwrapTypeBuilder` / `UnwrapFieldInput` can decide whether to lift
  // the value type to `T | undefined` (nullable) or keep it as `T`
  // (non-null, declared via `.notNull()`). It's a phantom — the actual
  // runtime non-null flag lives on `_isNonNull`.
  declare private __nullBrand: NonNull;

  constructor(
    typeString: string,
    isNonNull: boolean = false,
    defaultValue: unknown = NO_DEFAULT
  ) {
    this.typeString = typeString;
    this._isNonNull = isNonNull;
    this._default = defaultValue;
  }

  notNull(): TypeBuilder<NonNullable<T>, true> {
    return new TypeBuilder<NonNullable<T>, true>(
      this.typeString,
      true,
      this._default
    );
  }

  hasDefault(): boolean {
    return this._default !== NO_DEFAULT;
  }

  getDefault(): unknown {
    return this._default;
  }

  toString(): string {
    return this._isNonNull ? `${this.typeString}!` : this.typeString;
  }

  valueOf(): string {
    return this.toString();
  }

  [Symbol.toPrimitive](): string {
    return this.toString();
  }

  toJSON(): string {
    return this.toString();
  }
}

// Type function overloads
interface TypeFunction {
  <T>(type: string): T;
  <T extends Record<string, any>>(type: T): UnwrapTypeBuilder<T>;
}

// Scalar factory: callable with no args (returns required builder) or with
// `{ default }` (returns a builder whose static type is `T | undefined`,
// because the variable is now optional from the caller's perspective —
// graphql-js will substitute the default if the caller omits it).
interface ScalarFactory<T> {
  (): TypeBuilder<T>;
  (opts: { default: T }): TypeBuilder<T | undefined>;
}

const makeScalar = <T>(typeString: string): ScalarFactory<T> =>
  ((opts?: { default: T }) =>
    opts && "default" in opts
      ? new TypeBuilder<T | undefined>(typeString, false, opts.default)
      : new TypeBuilder<T>(typeString)) as ScalarFactory<T>;

export const t = {
  id: makeScalar<string>("ID"),
  string: makeScalar<string>("String"),
  int: makeScalar<number>("Int"),
  boolean: makeScalar<boolean>("Boolean"),
  type: ((type: any) => type) as TypeFunction,
};
