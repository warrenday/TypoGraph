import {
  DocumentNode,
  DefinitionNode,
  InputObjectTypeDefinitionNode,
  ObjectTypeDefinitionNode,
  Kind,
  TypeNode,
} from "graphql";
import {
  type InputArgValue,
  type FieldWithArgsWrapper,
  isFieldWithArgsWrapper,
} from "./runtime-types";

// A field map for an object type: each field is either a plain GraphQL type
// string (e.g. `"String!"`) or a `builder.field(...)` wrapper carrying its
// own arg map. Input types only ever carry plain type strings, so they use
// `InputObjectFields` instead.
type ObjectTypeFields = Record<string, string | FieldWithArgsWrapper>;
type InputObjectFields = Record<string, string>;

// Tagged wrapper produced by `builder.inputType(...)`. The `__kind` marker
// lets us distinguish input types from object types at the top level of the
// merged typeDefs object.
type InputTypeWrapper = {
  __kind: "input";
  fields: InputObjectFields;
};

// A single Query/Mutation/Subscription operation definition.
type OperationDef = {
  input: Record<string, InputArgValue>;
  output: string;
};

// A Query or Mutation map: operation name -> input/output def.
type OperationMap = Record<string, OperationDef>;

export type BuilderOutput = {
  Query?: OperationMap;
  Mutation?: OperationMap;
  Subscription?: OperationMap;
} & {
  [key: string]: OperationMap | ObjectTypeFields | InputTypeWrapper | undefined;
};

const isInputTypeWrapper = (value: unknown): value is InputTypeWrapper =>
  typeof value === "object" &&
  value !== null &&
  (value as { __kind?: unknown }).__kind === "input";

// Validate a typograph runtime type string. Typograph stores these
// verbatim (they're whatever the user wrote in `t.type<T>("...")` or
// returned from a thunk) and passes the inner portion through as a
// NamedType, so we only need a coarse check that the string is a legal
// GraphQL type reference: an optional chain of N `[` wrappers around a
// named type, closed by N `]` wrappers with `!` markers allowed at the
// item level and at every closing `]` and at the very end.
//
// We can't express "exactly N opening brackets matched by N closing
// brackets" in a single regex, so we do it in two passes: a shape regex
// plus a bracket-balance check.
const TYPE_STRING_SHAPE =
  /^(\[*)[A-Za-z_][A-Za-z0-9_]*!?((?:\]!?)*)$/;

const isValidTypeString = (typeString: string): boolean => {
  const match = TYPE_STRING_SHAPE.exec(typeString);
  if (!match) return false;
  const opens = match[1].length;
  // Each `]` in the closing segment, with or without a `!`.
  const closes = (match[2].match(/\]/g) ?? []).length;
  return opens === closes;
};

// Convert a GraphQL type string ("String", "User!", "[Post]", "[String!]!")
// into an AST TypeNode. We detect the trailing `!` (non-null) and otherwise
// pass the inner type through as a NamedType — `graphql.print` is happy to
// emit the bracketed string verbatim, so we don't need to recursively parse
// list types into their proper LIST_TYPE/NON_NULL_TYPE shape.
//
// The string is validated against a coarse shape + bracket-balance check
// before being handed off. A typo like `"[String"` or `"Post User"` would
// otherwise silently produce invalid SDL that only fails at server-startup
// time. Validating here moves the error to `combineTypeDefs()` / `toSDL()`
// where the stack trace still points at the schema file.
const mapType = (typeString: string): TypeNode => {
  if (!isValidTypeString(typeString)) {
    throw new Error(
      `[typograph] invalid GraphQL type string: ${JSON.stringify(typeString)}. Expected a named type, optionally wrapped in \`[]\` and/or suffixed with \`!\` (e.g. \"String\", \"Post!\", \"[Post!]!\").`
    );
  }

  if (typeString.endsWith("!")) {
    // Strip *only* the trailing `!` so nested non-null markers (e.g.
    // `[String!]!` → inner `[String!]`) are preserved inside the NamedType
    // value. Using `replace("!", "")` here would strip the first `!`, which
    // for `[String!]!` would yield the bogus `[String]!!`.
    return {
      kind: Kind.NON_NULL_TYPE,
      type: {
        kind: Kind.NAMED_TYPE,
        name: { kind: Kind.NAME, value: typeString.slice(0, -1) },
      },
    };
  }

  return {
    kind: Kind.NAMED_TYPE,
    name: { kind: Kind.NAME, value: typeString },
  };
};

const operationMapToAst = (
  operations: OperationMap,
  key: "Query" | "Mutation" | "Subscription"
): ObjectTypeDefinitionNode => {
  return {
    kind: Kind.OBJECT_TYPE_DEFINITION,
    name: { kind: Kind.NAME, value: key },
    fields: Object.entries(operations).map(([fieldName, fieldDetails]) => ({
      kind: Kind.FIELD_DEFINITION,
      name: { kind: Kind.NAME, value: fieldName },
      arguments: fieldDetails.input
        ? Object.entries(fieldDetails.input).map(([argName, argValue]) => {
            // The runtime shape is `string | { type, default }`. Defaults
            // live on the operation header (per the DEVELOPMENT.md example),
            // so we only need the type string here — drop the default.
            const argType =
              typeof argValue === "string" ? argValue : argValue.type;
            return {
              kind: Kind.INPUT_VALUE_DEFINITION,
              name: { kind: Kind.NAME, value: argName },
              type: mapType(argType),
            };
          })
        : [],
      type: mapType(fieldDetails.output),
    })),
  };
};

const objectTypeToAst = (
  fields: ObjectTypeFields,
  key: string
): ObjectTypeDefinitionNode => {
  return {
    kind: Kind.OBJECT_TYPE_DEFINITION,
    name: { kind: Kind.NAME, value: key },
    fields: Object.entries(fields).map(([fieldName, fieldValue]) => {
      // Field-with-args wrapper: emit `fieldName(arg: Type, ...): Output`.
      // The arg map is shaped exactly like an operation's input map, so we
      // unwrap defaulted args by reading their `.type` (defaults live on the
      // operation header in the rendered query, not on the SDL field arg).
      if (isFieldWithArgsWrapper(fieldValue)) {
        return {
          kind: Kind.FIELD_DEFINITION,
          name: { kind: Kind.NAME, value: fieldName },
          arguments: Object.entries(fieldValue.input).map(
            ([argName, argValue]) => {
              const argType =
                typeof argValue === "string" ? argValue : argValue.type;
              return {
                kind: Kind.INPUT_VALUE_DEFINITION,
                name: { kind: Kind.NAME, value: argName },
                type: mapType(argType),
              };
            }
          ),
          type: mapType(fieldValue.output),
        };
      }
      return {
        kind: Kind.FIELD_DEFINITION,
        name: { kind: Kind.NAME, value: fieldName },
        type: mapType(fieldValue),
      };
    }),
  };
};

const inputObjectToAst = (
  wrapper: InputTypeWrapper,
  key: string
): InputObjectTypeDefinitionNode => {
  return {
    kind: Kind.INPUT_OBJECT_TYPE_DEFINITION,
    name: { kind: Kind.NAME, value: key },
    fields: Object.entries(wrapper.fields).map(([fieldName, fieldType]) => ({
      kind: Kind.INPUT_VALUE_DEFINITION,
      name: { kind: Kind.NAME, value: fieldName },
      type: mapType(fieldType),
    })),
  };
};

const builderToAst = (builderOutput: BuilderOutput): DocumentNode => {
  const definitions: DefinitionNode[] = [];

  for (const key in builderOutput) {
    const value = builderOutput[key];
    if (!value) {
      continue;
    }

    if (key === "Query" || key === "Mutation" || key === "Subscription") {
      // Skip empty operation maps. graphql-js rejects an SDL document that
      // contains `type Query {}` / `type Mutation {}` / `type Subscription {}`
      // ("must define one or more fields"), so emitting an empty block
      // would always produce invalid SDL. The type-system shape
      // (`BaseTypeDefs`) still requires a `Mutation` key on the merged
      // typeDef object, so callers can write `Mutation: {}` to satisfy
      // types without polluting the SDL. `Subscription` is optional on
      // `BaseTypeDefs`, so callers can simply omit it if they don't have
      // any subscriptions.
      const operations = value as OperationMap;
      if (Object.keys(operations).length === 0) continue;
      definitions.push(operationMapToAst(operations, key));
    } else if (isInputTypeWrapper(value)) {
      // Tagged by `builder.inputType(...)`. Emit as
      // `input Foo { ... }` instead of `type Foo { ... }`.
      definitions.push(inputObjectToAst(value, key));
    } else {
      definitions.push(objectTypeToAst(value as ObjectTypeFields, key));
    }
  }

  return {
    kind: Kind.DOCUMENT,
    definitions,
  };
};

export default builderToAst;
