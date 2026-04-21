import capitalize from "./capitalize";
import { type InputArgValue, isArgsWrapper } from "./runtime-types";

type Fields = {
  [key: string]: boolean | Fields | { __args: Record<string, string>; selection: Fields };
};

// Per-operation selection. Either a map of selected fields (the normal
// object-returning case) or a bare `true` when the operation returns a
// scalar — in which case we emit `opName(args)` with no sub-selection.
type SelectionsByOperation = Record<string, Fields | true>;
type InputDefByOperation = Record<string, Record<string, InputArgValue>>;
// Extra header vars contributed by nested `args(...)` wrappers, keyed by the
// (already de-`$`-stripped) variable name. The shape mirrors `InputArgValue`
// so defaulted nested args participate in the header in the same way as
// defaulted top-level vars.
type ExtraHeaderVarsByOperation = Record<string, Record<string, InputArgValue>>;

// Detect the richer `{ type, default }` shape without tripping the type
// guard on plain string values. Used in two places below: deciding whether a
// variable is "always active" and rendering its header default.
const hasDefault = (
  value: InputArgValue
): value is { type: string; default: unknown } =>
  typeof value === "object" && value !== null && "default" in value;

// Render a JS value as a GraphQL value literal for the operation header.
// We only need scalar coverage here (string / number / boolean / null);
// list and object defaults aren't reachable yet because the only way to
// declare a default is via a scalar factory (`t.string({ default: ... })`).
const formatGraphQLLiteral = (value: unknown): string => {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  // Fallback: JSON encoding. Close enough to a GraphQL literal for the
  // simple cases; we can revisit if/when we add input-object defaults.
  return JSON.stringify(value);
};

// One "effective" variable binding for an operation's field args. This is
// the resolved view after applying any `args(...)` rename map: `argName` is
// the on-the-wire field arg name, `varName` is the (possibly renamed) header
// variable name. Defaulted vars carry their default for the header.
type ActiveVar = {
  argName: string;
  varName: string;
  type: string;
  default?: { value: unknown };
};

/**
 * Builds a GraphQL query/mutation/subscription string for one or more
 * top-level operations sharing a single variables map.
 *
 * @param operationType        - "query" | "mutation" | "subscription"
 * @param selectionsByOperation - Map of operation field name → selection set.
 *                                Multiple keys produce a multi-root document
 *                                (`query GetPostAndGetComment { ... }`).
 * @param inputDefByOperation  - Map of operation field name → (variable name
 *                                → GraphQL type string). Used to declare
 *                                `$varName` in the operation header.
 * @param variables            - The actual variable values supplied at call
 *                                time. Only variables present here are
 *                                declared in the header, so omitting an
 *                                optional variable yields a clean query.
 * @param argRenameByOperation - Optional map of operation field name →
 *                                (original arg name → renamed variable name).
 *                                Populated by the runtime when an operation's
 *                                selection is wrapped in `args(...)`. The
 *                                header carries the renamed names; the field
 *                                call still uses the original arg names.
 */
function buildGraphQLQuery(
  operationType: "query" | "mutation" | "subscription",
  selectionsByOperation: SelectionsByOperation,
  inputDefByOperation: InputDefByOperation,
  variables: Record<string, unknown>,
  argRenameByOperation: Record<string, Record<string, string>> = {},
  extraHeaderVarsByOperation: ExtraHeaderVarsByOperation = {}
): string {
  const processFields = (fields: Fields): string => {
    return Object.entries(fields)
      .map(([key, value]) => {
        if (value === true) {
          return key;
        }
        // Nested args wrapper: render `field(arg: $var) { ...inner }`. The
        // wrapper's `__args` already carries `$`-prefixed variable references
        // (Q8) so we can drop them straight into the field call.
        if (isArgsWrapper(value)) {
          const argParts = Object.entries(value.__args)
            .map(([argName, varRef]) => `${argName}: ${varRef}`)
            .join(", ");
          const inner = processFields(value.selection);
          return `${key}(${argParts}) { ${inner} }`;
        }
        if (value && typeof value === "object") {
          return `${key} { ${processFields(value as Fields)} }`;
        }
        throw new Error(`Invalid value for field "${key}": ${value}`);
      })
      .join(" ");
  };

  const operationNames = Object.keys(selectionsByOperation);

  // For each operation, build the list of effective variable bindings.
  // Optional vars the caller didn't pass are dropped entirely. Defaulted
  // vars (`{ type, default }`) are *always* active — even without a
  // call-site value — so the header carries the default and graphql-js
  // substitutes it server-side. The rename map (from `args(...)`) maps
  // each on-the-wire arg name to a custom header variable name; without
  // a rename, the header variable name equals the arg name.
  const activeVarsByOperation: Record<string, ActiveVar[]> = {};
  for (const opName of operationNames) {
    const inputDef = inputDefByOperation[opName] ?? {};
    const renames = argRenameByOperation[opName] ?? {};
    const active: ActiveVar[] = [];
    for (const argName of Object.keys(inputDef)) {
      const varName = renames[argName] ?? argName;
      const def = inputDef[argName];
      const isDefaulted = hasDefault(def);
      if (isDefaulted || varName in variables) {
        active.push({
          argName,
          varName,
          type: isDefaulted ? def.type : (def as string),
          default: isDefaulted ? { value: def.default } : undefined,
        });
      }
    }
    activeVarsByOperation[opName] = active;
  }

  // Collect every unique header variable across all operations along with
  // its declared GraphQL type (and optional default). Two operations sharing
  // a variable name (e.g. both ops bind `id` to `$postId`) declare it once
  // in the header. If they declare conflicting types or defaults, the first
  // one wins — that's a misuse we don't try to detect.
  const headerVarTypes: Record<string, string> = {};
  const headerVarDefaults: Record<string, unknown> = {};
  for (const opName of operationNames) {
    for (const v of activeVarsByOperation[opName]) {
      if (!(v.varName in headerVarTypes)) {
        headerVarTypes[v.varName] = v.type;
      }
      if (v.default !== undefined && !(v.varName in headerVarDefaults)) {
        headerVarDefaults[v.varName] = v.default.value;
      }
    }
  }

  // Merge in nested-field arg vars (Q8). These come from `args(...)`
  // wrappers placed on a sub-selection — the runtime walked the tree,
  // looked up each field's declared input def from the schema, and
  // produced this map. They're keyed by header var name (already
  // dollar-stripped) and carry either a plain GraphQL type string or the
  // richer `{ type, default }` shape, exactly like top-level inputs.
  for (const opName of operationNames) {
    const extras = extraHeaderVarsByOperation[opName] ?? {};
    for (const [varName, def] of Object.entries(extras)) {
      if (!(varName in headerVarTypes)) {
        headerVarTypes[varName] = hasDefault(def) ? def.type : (def as string);
      }
      if (
        hasDefault(def) &&
        !(varName in headerVarDefaults)
      ) {
        headerVarDefaults[varName] = def.default;
      }
    }
  }

  const headerArgs = Object.entries(headerVarTypes)
    .map(([name, type]) => {
      if (name in headerVarDefaults) {
        return `$${name}: ${type} = ${formatGraphQLLiteral(
          headerVarDefaults[name]
        )}`;
      }
      return `$${name}: ${type}`;
    })
    .join(", ");
  const headerString = headerArgs ? `(${headerArgs})` : "";

  // Operation name: capitalized concatenation of every selected root field,
  // joined with "And". Single-op queries keep their old name (e.g.
  // `query GetPost`); multi-op becomes `query GetPostAndGetComment`.
  const operationName = operationNames.map(capitalize).join("And");

  const opBlocks = operationNames
    .map((opName) => {
      // Field args: the on-the-wire arg name maps to the (possibly
      // renamed) header variable. With no rename, this collapses to the
      // familiar `id: $id` form.
      const fieldArgs = activeVarsByOperation[opName]
        .map((v) => `${v.argName}: $${v.varName}`)
        .join(", ");
      const fieldArgsString = fieldArgs ? `(${fieldArgs})` : "";
      const selection = selectionsByOperation[opName];
      // Scalar-returning operations: emit `opName(args)` with no
      // sub-selection braces. Object-returning: render the selection
      // set as usual.
      if (selection === true) {
        return `${opName}${fieldArgsString}`;
      }
      const fieldString = processFields(selection);
      return `${opName}${fieldArgsString} { ${fieldString} }`;
    })
    .join("\n      ");

  return `
    ${operationType} ${operationName}${headerString} {
      ${opBlocks}
    }
  `;
}

export default buildGraphQLQuery;
