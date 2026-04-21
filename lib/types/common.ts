// Expand a type to its base shape so hover tooltips/error messages stay
// readable even after a chain of mapped types and intersections.
export type Prettify<T> = T extends object
  ? {
      [K in keyof T]: Prettify<T[K]>;
    } & {}
  : T;

// Convert a union into an intersection. Used by `Merge` to combine all
// element types of an array into a single object type, and by the client
// to merge per-operation variable shapes when several root fields are
// selected at once.
export type UnionToIntersection<U> =
  // First convert union to union of functions and set the argument type
  // to the type of the union. We need this to combine the types correctly.
  (
    U extends any ? (k: U) => void : never
  ) extends // Now we have the arguments, we can infer and return them.
  // Typescript combines arguments of all functions into a single object
  // rather than creating a union of objects, it's a trick to get a single object.
  (k: infer I) => void
    ? I
    : never;

// Deep-merge an array of object types into a single object type.
export type Merge<T extends Array<Record<string, any>>> = Prettify<
  UnionToIntersection<T[number]>
>;

// Unwrap function-valued fields by replacing them with their return type.
// Used to resolve thunks like `() => t.type<User>("User")` at the type level.
export type ExtractValue<T> = {
  [K in keyof T]: T[K] extends () => any ? ReturnType<T[K]> : T[K];
};

// Recursive partial. Resolvers may legally return only the fields they own
// (other fields are filled in by their own resolvers).
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

// Minimum shape of an evaluated `typeDefs.types` object: a required `Query`
// map plus optional `Mutation` and `Subscription` maps, alongside arbitrary
// named object types. Only `Query` is required — a GraphQL schema must
// define at least a Query root, but mutations and subscriptions are
// genuinely optional. The SDL pipeline already skips empty operation maps,
// and the client / resolver types `NonNullable`-strip Mutation/Subscription
// before indexing, so callers can simply omit the key instead of writing
// `Mutation: {}` boilerplate.
//
// The index signature accepts `undefined` so the two optional operation
// fields are structurally compatible.
export type BaseTypeDefs = {
  Query: Record<string, { input: unknown; output: unknown }>;
  Mutation?: Record<string, { input: unknown; output: unknown }>;
  Subscription?: Record<string, { input: unknown; output: unknown }>;
  [key: string]: Record<string, unknown> | undefined;
};

// Phantom symbol used to brand fields declared via `builder.field({ input,
// output })`. Carrying a `unique symbol` key means the brand can only be
// produced by code that imports this module — `builder.field` is the sole
// constructor — and any structural type that *also* declares the same key is
// statically equivalent. The brand is invisible at runtime (the symbol is
// `declare`-only and never assigned to the wrapper object).
declare const FIELD_WITH_ARGS_BRAND: unique symbol;

// Brand for a type field that takes its own GraphQL arguments. Surfaces
// both the field's input map (`TInput`) and its output type (`TOutput`)
// at the type level so the resolver type can model `(parent, args) => O`
// and the client's `MergedVariables` machinery can discover nested arg
// contributions while walking a selection tree.
//
// At runtime the value is still the plain `{ __kind: "field", input,
// output }` wrapper produced by `builder.field` — `as unknown as` is
// used at the construction site to attach the brand statically. Consumers
// peel the brand via `PeelFieldArgs<T>` everywhere they would otherwise
// dereference the field's value type.
export type FieldWithArgs<TInput, TOutput> = {
  readonly [FIELD_WITH_ARGS_BRAND]: { input: TInput; output: TOutput };
};

// Strip a `FieldWithArgs<I, O>` brand to its declared output type so the
// rest of the type machinery (selection sets, projected return shapes,
// resolver field iteration) can treat a branded field exactly like a
// plain field of type `O`. Returns `T` unchanged when there is no brand,
// so it's safe to apply universally.
export type PeelFieldArgs<T> = T extends FieldWithArgs<any, infer Output>
  ? Output
  : T;
