import {
  BaseTypeDefs,
  FieldWithArgs,
  PeelFieldArgs,
  Prettify,
  UnionToIntersection,
} from "./types/common";
import buildGraphQLQuery from "./utils/buildGraphQLQuery";
import { isArgsWrapper, isFieldWithArgsWrapper } from "./utils/runtime-types";

type BaseType = "Query" | "Mutation" | "Subscription";

// Resolve the operation map for a given operation kind on a Schema.
//
// Query/Mutation are required by `BaseTypeDefs`, so they index directly. But
// `Subscription` is optional — `Schema["Subscription"]` could be `undefined`,
// which would collapse `keyof` to `never` and make every selection field
// invalid even when the user did declare a Subscription map. Filtering
// through `NonNullable` strips the `undefined` branch and lets the rest of
// the client treat all three operation kinds uniformly. If a Schema doesn't
// declare a Subscription at all, `NonNullable<undefined>` is `never`, so the
// subscribe handler accepts no fields — which is exactly what we want.
type GetOperationMap<
  Schema extends BaseTypeDefs,
  Operation extends BaseType,
> = NonNullable<Schema[Operation]>;

// A variable reference in an `args(...)` map. Must start with `$` to
// mirror the on-the-wire GraphQL syntax — the runtime strips exactly one
// leading `$` to derive the bare variables-object key. Extracting this
// as a named alias gives TypeScript a handle to display in the error
// message when a user forgets the prefix (e.g. `Type 'string' is not
// assignable to type 'VariableReference'`) instead of the opaque
// `${string}` template literal.
export type VariableReference = `$${string}`;

// Tagged wrapper produced by `args(...)` — explicit field arguments bound
// to caller-supplied variable names. Used by both top-level operations
// (Q9, M5) and nested fields (Q8). The runtime detects this wrapper via
// the `__args` property; the type level uses it to rename variables in
// `MergedVariables` and to extract the inner selection in `ReturnShape`.
//
// The second type parameter (`A`) carries the literal arg-map shape so
// the call-site mapping (e.g. `{ id: "$postId" }`) survives through the
// `Selections` inference and reaches `RenameInputArgs`. Without it, the
// constraint would widen to `Record<string, VariableReference>` and every
// renamed variable would collapse to `never` in the merged variables type.
export type ArgsWrapper<
  S,
  A extends Record<string, VariableReference> = Record<
    string,
    VariableReference
  >,
> = {
  __args: A;
  selection: S;
};

// Bind one or more field arguments to caller-supplied variable names. Use
// at any selection-set level to:
//   1. Rename a top-level operation's variables (e.g. give `getPost(id:)`
//      a `$postId` so two `getPost` calls don't collide).
//   2. Pass a variable to a nested field arg declared via
//      `builder.field({ input, output })`.
//
// The wrapper is detected at runtime by `buildGraphQLQuery` (which emits
// `field(arg: $var) { ... }`) and at the type level by `MergedVariables`
// and `ReturnShape`. Both `ArgMap` and `Selection` use the `const`
// inference modifier so the literal `{ id: "$postId" }` shape is
// preserved end-to-end.
export const args = <
  const ArgMap extends Record<string, VariableReference>,
  const Selection,
>(
  argMap: ArgMap,
  selection: Selection,
): ArgsWrapper<Selection, ArgMap> => ({ __args: argMap, selection });

// Extract the inner selection from a wrapped or unwrapped selection.
// Used by `ReturnShape` so that the projected response shape only sees the
// fields the caller actually selected, not the args wrapper around them.
type ExtractSelection<S> = S extends ArgsWrapper<infer Inner> ? Inner : S;

// Strip the leading `$` off a variable reference (`"$postId"` -> `"postId"`).
// `args(...)` always emits the dollar (mirroring the on-the-wire syntax),
// but we use the bare name as the actual TS property key on the variables
// object the caller passes in.
type StripDollar<S> = S extends `$${infer Name}` ? Name : never;

// Given an operation's original input shape and an arg-rename map, produce
// the renamed input shape. Args present in the rename map adopt the renamed
// key (with `$` stripped); args not in the map keep their original key.
//
// Used by `MergedVariables` so that wrapping a top-level operation in
// `args({ id: "$postId" }, ...)` requires the caller to pass `postId`
// instead of `id` (and lets two operations sharing an arg name disambiguate
// without colliding in the merged variables object).
type RenameInputArgs<
  Input,
  ArgMap extends Record<string, VariableReference>,
> = {
  [K in keyof ArgMap as StripDollar<ArgMap[K]>]: K extends keyof Input
    ? Input[K]
    : never;
} & {
  [K in keyof Input as K extends keyof ArgMap ? never : K]: Input[K];
};

// Primitive leaf check. An operation or nested field whose TS type is one
// of these needs no sub-selection — it's selected with a bare `true`
// (matching GraphQL's "no braces after a scalar field" rule). Wrapping in
// `[T]` prevents the conditional from distributing over union types, so
// `string | null` stays a leaf rather than being split into an object
// branch.
type Primitive = string | number | boolean | bigint | null | undefined;

// Define selection set structure - allows selecting fields from the response type.
// If the response is itself an array (e.g. `listPosts: Post[]`), the selection
// applies to the item type, mirroring how GraphQL list selections work.
//
// `__typename` is the GraphQL meta-field that returns the runtime type name.
// It isn't declared on any user type but is always selectable on object/list
// types, so we add it to every SelectionSet alongside the schema-declared
// fields. Selecting it produces a `string` in the projected return type.
//
// At each level a field can be either a plain selection or wrapped via
// `args(...)` to bind field arguments. The wrapper unwraps via
// `ArgsWrapper<...>` so the inner shape is still constrained the same way.
//
// Fields branded by `builder.field` carry a `FieldWithArgs<I, O>` brand on
// their value. `PeelFieldArgs<T[K]>` strips it before the array/object/leaf
// check so a branded field is selectable exactly the same as its underlying
// `O` would be — branded `comments: FieldWithArgs<{limit: number}, Comment[]>`
// behaves like a plain `comments: Comment[]` for the purposes of building a
// selection set.
//
// An operation whose output is a bare scalar (e.g. `deleteCard: String!`)
// short-circuits the object branch — the selection is just `true`.
export type SelectionSet<T> = [T] extends [Primitive]
  ? true
  : T extends Array<infer Item>
    ? SelectionSet<Item>
    : {
        [K in keyof T]?: PeelFieldArgs<T[K]> extends Array<infer U>
          ? SelectionSet<U> | ArgsWrapper<SelectionSet<U>> // For arrays, apply selection to the item type
          : PeelFieldArgs<T[K]> extends object
            ?
                | SelectionSet<PeelFieldArgs<T[K]>>
                | ArgsWrapper<SelectionSet<PeelFieldArgs<T[K]>>> // For objects, allow nested selection
            : true; // For primitives, use boolean flag
      } & {
        __typename?: true;
      };

// Map selection set to actual response type based on selected fields. As with
// SelectionSet, a top-level array T means "apply the selection to each item".
//
// `__typename` is treated as a string field that exists on every object type.
//
// Nested fields wrapped in `args(...)` (Q8) carry their selection inside an
// `ArgsWrapper`. `ExtractSelection` peels the wrapper off so the projection
// only sees the inner field shape — without it the consumer's return type
// would surface `{ __args, selection }` for any field with nested args.
//
// `PeelFieldArgs` strips any `FieldWithArgs<I, O>` brand on the schema field
// before projection, so a branded field projects through to its declared
// output type (`O`) exactly like an unbranded field would.
//
// When the output is a bare scalar, the selection is `true` and the projected
// shape is the scalar itself.
type SelectFields<T, Selection> = [T] extends [Primitive]
  ? T
  : T extends Array<infer Item>
    ? Array<SelectFields<Item, Selection>>
    : {
        [K in keyof Selection]: K extends "__typename"
          ? string
          : K extends keyof T
            ? Selection[K] extends true
              ? PeelFieldArgs<T[K]> // Include primitive field as-is
              : ExtractSelection<Selection[K]> extends object
                ? PeelFieldArgs<T[K]> extends Array<infer Item>
                  ? Array<SelectFields<Item, ExtractSelection<Selection[K]>>> // Apply selection to array items
                  : SelectFields<
                      PeelFieldArgs<T[K]>,
                      ExtractSelection<Selection[K]>
                    > // Apply selection to nested object
                : never
            : never;
      };

// Map of operation name → selection set, constrained to keys that actually
// exist on the schema's Query/Mutation/Subscription map. This is the public
// shape that `client.query` / `client.mutate` / `client.subscribe` accept as
// their first argument.
//
// A top-level operation may also be wrapped via `args(...)` to bind its
// field arguments to caller-supplied variable names — this is what powers
// Q9 (multi-field queries with disambiguated args) and M5 (multi-mutation
// operations). The wrapper carries the original `SelectionSet<Output>`
// inside so the rest of the type machinery can still walk it.
export type SelectionsByOperation<
  Schema extends BaseTypeDefs,
  Operation extends BaseType,
> = {
  [K in keyof GetOperationMap<Schema, Operation>]?:
    | SelectionSet<GetOperationMap<Schema, Operation>[K]["output"]>
    | ArgsWrapper<
        SelectionSet<GetOperationMap<Schema, Operation>[K]["output"]>
      >;
};

// Recursively validate a selection against the schema type. Keys in `S`
// that don't exist in `T` map to `never`. When intersected with the actual
// selection (`selections: S & ValidateSelectionsByOperation<...>`), any
// invalid key becomes `true & never = never`, forcing a compile error at
// the call site instead of silently producing `never` in the return type.
type ValidateSelectionSet<T, S> = [T] extends [Primitive]
  ? S
  : T extends Array<infer Item>
    ? ValidateSelectionSet<Item, S>
    : S extends ArgsWrapper<infer Inner, infer A>
      ? ArgsWrapper<ValidateSelectionSet<T, Inner>, A>
      : {
          [K in keyof S]: K extends "__typename"
            ? S[K]
            : K extends keyof T
              ? S[K] extends true
                ? true
                : S[K] extends ArgsWrapper<infer Inner, infer A>
                  ? ArgsWrapper<
                      ValidateSelectionSet<
                        PeelFieldArgs<T[K]> extends Array<infer U>
                          ? U
                          : PeelFieldArgs<T[K]>,
                        Inner
                      >,
                      A
                    >
                  : ExtractSelection<S[K]> extends object
                    ? ValidateSelectionSet<
                        PeelFieldArgs<T[K]> extends Array<infer U>
                          ? U
                          : PeelFieldArgs<T[K]>,
                        ExtractSelection<S[K]>
                      >
                    : S[K]
              : never;
        };

// Per-operation wrapper around `ValidateSelectionSet`. Maps each selected
// operation key through the validation, leaving unknown operation keys
// (already caught by the `extends SelectionsByOperation` constraint) as-is.
export type ValidateSelectionsByOperation<
  Schema extends BaseTypeDefs,
  Operation extends BaseType,
  Selections,
> = {
  [K in keyof Selections]: K extends keyof GetOperationMap<Schema, Operation>
    ? Selections[K] extends ArgsWrapper<infer Inner, infer A>
      ? ArgsWrapper<
          ValidateSelectionSet<
            GetOperationMap<Schema, Operation>[K]["output"],
            Inner
          >,
          A
        >
      : ValidateSelectionSet<
          GetOperationMap<Schema, Operation>[K]["output"],
          Selections[K]
        >
    : Selections[K];
};

// Convert keys whose value type includes `undefined` into optional `?`
// fields. This is what makes a defaulted variable callable without an
// explicit `variables` entry: a `t.string({ default: "newest" })` declares
// the input as `{ order: string | undefined }`, which `MakeOptional` lifts
// to `{ order?: string }` so the caller can omit it. Required keys (no
// `undefined` in their type) pass through unchanged.
type MakeOptional<T> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K];
} & {
  [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<
    T[K],
    undefined
  >;
};

// Strip the `readonly` modifier off an object type. Used as a building
// block for `MergedVariables` so the merged variables shape isn't deeply
// readonly (the public handler's `const` inference modifier infects the
// inputs as well as the selections).
type MutableInput<I> = { -readonly [P in keyof I]: I[P] };

// Resolve a single operation's contribution to the merged variables shape.
// If the operation's selection is wrapped in `args(...)`, the input is
// renamed via `RenameInputArgs`; otherwise the input shape is used as-is.
//
// We `infer ArgMap` from `ArgsWrapper`'s second type parameter so the
// literal `{ id: "$postId" }` shape from the call site survives the merge
// — without the explicit infer the `__args` lookup would yield the wide
// `Record<string, VariableReference>` constraint and collapse to `never`.
type OperationVariables<Selection, Input> =
  Selection extends ArgsWrapper<any, infer ArgMap>
    ? ArgMap extends Record<string, VariableReference>
      ? RenameInputArgs<MutableInput<Input>, ArgMap>
      : MutableInput<Input>
    : MutableInput<Input>;

// Compute one field's contribution to the merged variables when its
// selection is wrapped in `args(...)`. Two conditions must hold:
//   1. the *value* in the parent type is a `FieldWithArgs<I, …>` brand
//      (otherwise the field has no declared input map and the wrapper is
//      just a no-op rename target), and
//   2. the *selection* slot is an `ArgsWrapper<…, A>` carrying a literal
//      arg-name → variable-name map.
// When both hold, the contribution mirrors `OperationVariables` but uses
// the field's input map (made `Partial` because GraphQL field args default
// to nullable, mirroring how `t.int()` emits `Int` rather than `Int!`).
// Anything else collapses to `{}`, which intersects to a no-op inside
// `UnionToIntersection`.
type NestedArgContribution<TField, SField> =
  SField extends ArgsWrapper<any, infer ArgMap>
    ? TField extends FieldWithArgs<infer FieldInput, any>
      ? ArgMap extends Record<string, VariableReference>
        ? RenameInputArgs<MutableInput<Partial<FieldInput>>, ArgMap>
        : MutableInput<Partial<FieldInput>>
      : {}
    : {};

// Walk a selection tree against the parent type it projects from to find
// every nested `args(...)` wrapper bound to a `builder.field`-declared
// field. Each level yields a union of partial-variable contributions which
// `UnionToIntersection` collapses into a single object. The walk is
// purely structural — it follows the user-supplied selection, so the
// recursion bottoms out wherever the selection has no more nested objects.
//
//   - Arrays: drop to the item type before iterating fields. The selection
//     applies to the item, mirroring how SelectionSet handles lists.
//   - Each field: contribute the current field's args (if any) AND recurse
//     into the inner selection with the field's *peeled, un-arrayed* output
//     type as the new parent. Peeling makes the walk transparent to the
//     `FieldWithArgs` brand, exactly like `SelectFields` does for the
//     projected return type.
//   - Empty selections / primitive leaves: bottom out at `{}`, which is the
//     identity element for `UnionToIntersection`.
//
// The `Depth` tuple caps recursion — TypeScript otherwise flags "property
// X circularly references itself in mapped type" when the schema itself
// is cyclic (e.g. `Card.list: List` and `List.cards: [Card]`), even when
// the user's selection doesn't touch the cycle. Eight levels is more
// than enough for any realistic selection; beyond that we collapse to
// `{}` and any nested `args(...)` below the cap is silently ignored
// (they'd already be deep into the tree, where forgetting the rename
// isn't a realistic concern).
type WalkDepthInit = [1, 1, 1, 1, 1, 1, 1, 1];
type WalkDepthTail<D extends unknown[]> = D extends [unknown, ...infer R]
  ? R
  : [];

type WalkSelectionForArgs<
  T,
  S,
  Depth extends unknown[] = WalkDepthInit,
> = Depth extends []
  ? {}
  : T extends Array<infer Item>
    ? WalkSelectionForArgs<Item, S, Depth>
    : T extends Record<string, any>
      ? S extends Record<string, any>
        ? {
            [K in keyof S & keyof T]:
              | NestedArgContribution<T[K], S[K]>
              | WalkSelectionForArgs<
                  PeelFieldArgs<T[K]> extends Array<infer Inner>
                    ? Inner
                    : PeelFieldArgs<T[K]>,
                  ExtractSelection<S[K]>,
                  WalkDepthTail<Depth>
                >;
          }[keyof S & keyof T]
        : {}
      : {};

// Merge the input shapes of every operation that the caller selected into a
// single variables object. Two operations sharing a variable name (e.g. both
// taking `id: string`) collapse to a single field. Two operations using the
// same name with incompatible types collapse to `never`, which is correct.
//
// When a per-operation selection is wrapped in `args(...)`, that operation's
// input is renamed via `RenameInputArgs` first, so two operations sharing
// an arg name (e.g. both `getPost(id:)` and `getComment(id:)`) can pass
// different values by binding to disjoint variable names (`$postId`,
// `$commentId`). The merge then sees disjoint keys and the resulting
// variables shape carries both.
//
// In addition to the top-level operation inputs, `WalkSelectionForArgs`
// walks each operation's selection sub-tree to discover nested `args(...)`
// wrappers bound to `builder.field`-declared fields and contributes their
// renamed input maps to the merge. This is what gives Q8 (a top-level
// query that passes `args({ limit: "$limit" }, …)` on a nested field)
// real type safety on `$limit` instead of falling through to a weakly
// typed `any` slot.
//
// `MakeOptional` runs after the merge so any variable whose type includes
// `undefined` (the marker we use for defaulted vars and for nested field
// args, which `NestedArgContribution` makes `Partial`) becomes an
// optional field instead of a required one carrying `| undefined`.
//
// Exported so that downstream wrappers (e.g. the demo's URQL bridge) can
// constrain their own variables parameter exactly the way the lib does.
export type MergedVariables<
  Schema extends BaseTypeDefs,
  Operation extends BaseType,
  Selections,
> = Prettify<
  MakeOptional<
    UnionToIntersection<
      {
        [K in keyof Selections & keyof GetOperationMap<Schema, Operation>]:
          | OperationVariables<
              Selections[K],
              GetOperationMap<Schema, Operation>[K]["input"]
            >
          | WalkSelectionForArgs<
              GetOperationMap<Schema, Operation>[K]["output"],
              ExtractSelection<Selections[K]>
            >;
      }[keyof Selections & keyof GetOperationMap<Schema, Operation>]
    >
  >
>;

// Strip the `readonly` modifier the public handler's `const` inference adds
// to selection trees, then project the output type through the selection.
// Without this the resulting `returnType` would be deeply readonly, which
// would make every consumer assertion (`toEqualTypeOf<{...}>`) fail.
type Mutable<T> =
  T extends Array<infer U>
    ? Array<Mutable<U>>
    : T extends object
      ? { -readonly [K in keyof T]: Mutable<T[K]> }
      : T;

// The typed return shape: one key per selected operation, each carrying the
// projection of its output type through the user-supplied selection set.
// `-readonly` strips the `const` inference modifier the public handler adds
// so consumer assertions don't have to mirror it. `ExtractSelection` peels
// off any `args(...)` wrapper so the projection sees the inner selection
// rather than the wrapper's `{ __args, selection }` shape.
//
// Exported so downstream integrations (e.g. `lib/integrations/urql.ts`)
// can use it as the data type on wrapped hook signatures, preserving
// end-to-end type safety through the urql bridge.
export type ReturnShape<
  Schema extends BaseTypeDefs,
  Operation extends BaseType,
  Selections,
> = Prettify<{
  -readonly [K in keyof Selections]: K extends keyof GetOperationMap<
    Schema,
    Operation
  >
    ? Mutable<
        SelectFields<
          GetOperationMap<Schema, Operation>[K]["output"],
          ExtractSelection<Selections[K]>
        >
      >
    : never;
}>;

// Generic operation handler type for both query and mutation.
type OperationHandler<
  Schema extends BaseTypeDefs,
  Operation extends BaseType,
> = <
  const Selections extends SelectionsByOperation<Schema, Operation>,
  Variables extends MergedVariables<Schema, Operation, Selections>,
>(
  selections: Selections &
    ValidateSelectionsByOperation<Schema, Operation, Selections>,
  options?: { variables: Variables },
) => {
  // Phantom value: only the *type* matters here. Consumers do
  // `typeof res.returnType` to recover the typed response shape.
  returnType: ReturnShape<Schema, Operation, Selections>;
  // Actual runtime variables passed by the caller, typed as the merged
  // input shape across every selected operation.
  variables: Variables;
  toGraphQL: () => string;
};

// Strip GraphQL non-null and list wrappers from a type string so we can use
// the inner named type as a lookup key. Mirrors what the SDL pipeline does
// implicitly — typograph stores type strings verbatim, so the runtime walk
// has to peel them itself when chasing nested args through the schema.
const stripTypeWrappers = (typeStr: string): string => {
  let s = typeStr.trim();
  if (s.endsWith("!")) s = s.slice(0, -1);
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  if (s.endsWith("!")) s = s.slice(0, -1);
  return s.trim();
};

// Read a field's output type and (optional) input map out of a parent type's
// fields. Plain fields stored as a string carry no input; field-with-args
// wrappers carry both. Returns `undefined` for unknown fields so the walk
// degrades gracefully (e.g. for `__typename`, which has no schema entry).
const getFieldInfo = (
  parentTypeFields: Record<string, unknown> | undefined,
  fieldName: string,
):
  | {
      output: string;
      input: Record<string, string | { type: string; default: unknown }>;
    }
  | undefined => {
  if (!parentTypeFields) return undefined;
  const def = parentTypeFields[fieldName];
  if (def === undefined) return undefined;
  if (isFieldWithArgsWrapper(def)) {
    return { output: def.output, input: def.input };
  }
  if (typeof def === "string") {
    return { output: def, input: {} };
  }
  return undefined;
};

// Create operation handler implementation.
const createOperationHandler = <
  Schema extends BaseTypeDefs,
  Operation extends BaseType,
>(
  typeDefs: { types: Schema },
  operationKind: Operation,
  operationType: Lowercase<Operation>,
): OperationHandler<Schema, Operation> => {
  return (selections, options) => {
    const variables = (options?.variables ?? {}) as Record<string, unknown>;

    // Walk the top-level selections once to:
    //   1. unwrap any `args(...)` wrapper into a clean field-only selection,
    //      since `buildGraphQLQuery` only knows how to print plain selection
    //      maps;
    //   2. record any per-operation arg renames (e.g. `id -> postId`) so
    //      `buildGraphQLQuery` can rewrite the header and field-arg
    //      references downstream.
    //
    // Operations not wrapped in `args(...)` get an empty rename map, which
    // makes the variable name match the original arg name (the existing
    // behavior for every other example).
    const cleanSelections: Record<string, any> = {};
    const argRenameByOperation: Record<string, Record<string, string>> = {};
    for (const opName of Object.keys(selections as object)) {
      const sel = (selections as Record<string, any>)[opName];
      if (isArgsWrapper(sel)) {
        const renames: Record<string, string> = {};
        for (const [argName, varRef] of Object.entries(sel.__args)) {
          // The `args(...)` helper requires references to start with `$` to
          // mirror the on-the-wire syntax, but the actual variables map uses
          // bare names. Strip exactly one leading `$`.
          renames[argName] = varRef.startsWith("$") ? varRef.slice(1) : varRef;
        }
        argRenameByOperation[opName] = renames;
        cleanSelections[opName] = sel.selection;
      } else {
        cleanSelections[opName] = sel;
      }
    }

    // Look up each selected operation's input map (variable name → GraphQL
    // type string) from the eagerly-evaluated typeDefs. Operations that
    // genuinely have no variables collapse to {}.
    const inputDefByOperation: Record<string, Record<string, string>> = {};
    for (const opName of Object.keys(cleanSelections)) {
      const operationDef = typeDefs.types[operationKind]?.[opName] as
        | { input?: Record<string, string> }
        | undefined;
      inputDefByOperation[opName] = operationDef?.input ?? {};
    }

    // Q8 — walk each operation's selection sub-tree to discover nested
    // `args(...)` wrappers, look up their declared field arg types from
    // the schema, and rewrite the cleaned selection so the wrappers are
    // preserved (so `processFields` can render `field(arg: $var) { ... }`)
    // while also collecting an extras-by-operation map that contributes
    // additional vars to the operation header.
    //
    // The walk is recursive but only descends into plain object selections
    // and into the `selection` payload of args wrappers — primitive `true`
    // leaves are passed through verbatim. Field types are resolved by
    // looking up the parent type's fields entry; the next walk frame uses
    // the (stripped) output type as the new parent type name.
    const extraHeaderVarsByOperation: Record<
      string,
      Record<string, string | { type: string; default: unknown }>
    > = {};
    const walkedSelections: Record<string, any> = {};

    const walk = (
      selection: any,
      parentTypeFields: Record<string, unknown> | undefined,
      extras: Record<string, string | { type: string; default: unknown }>,
    ): any => {
      if (selection === true || selection === false) return selection;
      if (typeof selection !== "object" || selection === null) return selection;

      const out: Record<string, any> = {};
      for (const fieldName of Object.keys(selection)) {
        const value = (selection as Record<string, any>)[fieldName];
        const info = getFieldInfo(parentTypeFields, fieldName);
        const innerTypeName = info ? stripTypeWrappers(info.output) : undefined;
        const innerTypeFields = innerTypeName
          ? (typeDefs.types as Record<string, any>)[innerTypeName]
          : undefined;

        if (isArgsWrapper(value)) {
          // Nested args wrapper — collect each arg's header var binding
          // from the field's declared input map, then recurse into the
          // inner selection with the field's output type as the new
          // parent.
          const fieldInput = info?.input ?? {};
          for (const [argName, varRef] of Object.entries(value.__args)) {
            const varName = (varRef as string).startsWith("$")
              ? (varRef as string).slice(1)
              : (varRef as string);
            const argDef = fieldInput[argName];
            if (argDef !== undefined && !(varName in extras)) {
              extras[varName] = argDef;
            }
          }
          const innerWalked = walk(value.selection, innerTypeFields, extras);
          out[fieldName] = { __args: value.__args, selection: innerWalked };
          continue;
        }

        if (typeof value === "object" && value !== null) {
          out[fieldName] = walk(value, innerTypeFields, extras);
          continue;
        }

        out[fieldName] = value;
      }
      return out;
    };

    for (const opName of Object.keys(cleanSelections)) {
      // Top of the walk for an operation: parent type is the operation's
      // own selectable fields (i.e. the schema's Query/Mutation/Subscription
      // map keyed by field name). We pass that map down so the first level
      // of the walk can recognize each top-level field's output type.
      // Selections at this level are the *result* of an operation, so the
      // "parent type fields" the walk needs are the operation's output
      // type's fields. Look that up via the operation's own def.
      const operationDef = (
        typeDefs.types[operationKind] as Record<string, any> | undefined
      )?.[opName] as { output?: string } | undefined;
      const outputTypeName = operationDef?.output
        ? stripTypeWrappers(operationDef.output)
        : undefined;
      const outputTypeFields = outputTypeName
        ? (typeDefs.types as Record<string, any>)[outputTypeName]
        : undefined;

      const extras: Record<
        string,
        string | { type: string; default: unknown }
      > = {};
      walkedSelections[opName] = walk(
        cleanSelections[opName],
        outputTypeFields,
        extras,
      );
      if (Object.keys(extras).length > 0) {
        extraHeaderVarsByOperation[opName] = extras;
      }
    }

    return {
      returnType: {} as any,
      variables: variables as any,
      toGraphQL: () =>
        buildGraphQLQuery(
          operationType as "query" | "mutation" | "subscription",
          walkedSelections,
          inputDefByOperation,
          variables,
          argRenameByOperation,
          extraHeaderVarsByOperation,
        ),
    };
  };
};

// Main client factory.
const createClient = <T extends { types: BaseTypeDefs }>(typeDefs: T) => {
  type Schema = T["types"];

  return {
    query: createOperationHandler<Schema, "Query">(typeDefs, "Query", "query"),
    mutate: createOperationHandler<Schema, "Mutation">(
      typeDefs,
      "Mutation",
      "mutation",
    ),
    subscribe: createOperationHandler<Schema, "Subscription">(
      typeDefs,
      "Subscription",
      "subscription",
    ),
  };
};

export default createClient;
