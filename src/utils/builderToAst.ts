import {
  DocumentNode,
  DefinitionNode,
  ObjectTypeDefinitionNode,
  Kind,
  TypeNode,
} from "graphql";

type BuilderValue = Record<string, unknown>;

interface BuilderOutput extends Record<string, any> {
  Query?: {
    [key: string]: {
      input: BuilderValue | string;
      output: BuilderValue | string;
    };
  };
  Mutation?: {
    [key: string]: {
      input: BuilderValue | string;
      output: BuilderValue | string;
    };
  };
}

// Utility to convert scalar types
const mapType = (typeString: string): TypeNode => {
  if (typeString.endsWith("!")) {
    return {
      kind: Kind.NON_NULL_TYPE,
      type: {
        kind: Kind.NAMED_TYPE,
        name: { kind: Kind.NAME, value: typeString.replace("!", "") },
      },
    };
  }

  return {
    kind: Kind.NAMED_TYPE,
    name: { kind: Kind.NAME, value: typeString },
  };
};

const queryToAst = (
  types: BuilderOutput["Query"],
  key: "Query" | "Mutation"
): ObjectTypeDefinitionNode => {
  if (!types) {
    throw new Error(`No ${key} found`);
  }

  return {
    kind: Kind.OBJECT_TYPE_DEFINITION,
    name: { kind: Kind.NAME, value: key },
    fields: Object.entries(types).map(([fieldName, fieldDetails]: any) => ({
      kind: Kind.FIELD_DEFINITION,
      name: { kind: Kind.NAME, value: fieldName },
      arguments: fieldDetails.input
        ? Object.entries(fieldDetails.input).map(([argName, argType]: any) => ({
            kind: Kind.INPUT_VALUE_DEFINITION,
            name: { kind: Kind.NAME, value: argName },
            type: mapType(argType),
          }))
        : [],
      type: mapType(fieldDetails.output),
    })),
  };
};

const typeToAst = (
  types: BuilderValue,
  key: string
): ObjectTypeDefinitionNode => {
  // Handle object types
  return {
    kind: Kind.OBJECT_TYPE_DEFINITION,
    name: { kind: Kind.NAME, value: key },
    fields: Object.entries(types).map(([fieldName, fieldType]: any) => ({
      kind: Kind.FIELD_DEFINITION,
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

    if (key === "Query" || key === "Mutation") {
      definitions.push(queryToAst(value, key));
    } else {
      definitions.push(typeToAst(value, key));
    }
  }

  return {
    kind: Kind.DOCUMENT,
    definitions,
  };
};

export default builderToAst;
