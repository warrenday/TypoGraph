// Shared runtime type definitions and guards used by the SDL pipeline,
// the client walk, and the query builder. Centralised here so the three
// consumers stay in sync.

// An input arg's evaluated runtime shape: either a plain GraphQL type string
// (for required args without defaults) or a richer `{ type, default }` object
// (for args declared with `t.string({ default: ... })`).
export type InputArgValue = string | { type: string; default: unknown };

// Tagged wrapper produced by `builder.field(...)`. Lives inside an object
// type's field map and lets a single field declare its own arguments —
// emitted as `fieldName(arg: Type): Output` in SDL.
export type FieldWithArgsWrapper = {
  __kind: "field";
  input: Record<string, InputArgValue>;
  output: string;
};

// Detect a `builder.field(...)` wrapper inside the evaluated typeDefs.
export const isFieldWithArgsWrapper = (
  value: unknown
): value is FieldWithArgsWrapper =>
  typeof value === "object" &&
  value !== null &&
  (value as { __kind?: unknown }).__kind === "field";

// Nested-args wrapper carried inside a selection sub-tree, produced by the
// `args(...)` helper. The `__args` map holds `$`-prefixed variable references.
export type ArgsWrapperRuntime = {
  __args: Record<string, string>;
  selection: unknown;
};

// Detect an `args(...)` wrapper at runtime. Both `__args` and `selection`
// are required — `__args` is the cheap fingerprint to check first.
export const isArgsWrapper = (
  value: unknown
): value is ArgsWrapperRuntime =>
  typeof value === "object" &&
  value !== null &&
  "__args" in value &&
  "selection" in value;
