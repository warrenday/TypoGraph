import { print } from "graphql";
import { ExtractValue, Merge } from "./common";
import builderToAst from "./utils/builderToAst";
import evaluate from "./utils/evaluate";
import merge from "./utils/merge";

type TypeDef = Record<any, any>; // TODO Define possible value types

type Builder = {
  typeDef: <T>(typeDef: T) => T;
  combineTypeDefs: <T extends TypeDef>(
    typeDefs: T[]
  ) => { types: Merge<T[]>; toSDL: () => string };
  type: <T>(type: T) => ExtractValue<T>;
  query: <T>(query: T) => T;
  mutation: <T>(mutation: T) => T;
};

export const createTypeDefBuilder = (): Builder => {
  const builder: Builder = {
    typeDef: (typeDef) => typeDef,
    combineTypeDefs: (typeDefs) => {
      const toSDL = () => {
        // Deep merge the typeDefs
        const combined = merge(...typeDefs);
        // Evaluate the any lazy types
        const types = evaluate(combined as any);
        // Convert to AST
        const ast = builderToAst(types);
        // Convert to SDL
        const sdl = print(ast);
        return sdl;
      };

      return { types: typeDefs as any, toSDL };
    },
    type: (type) => type as ExtractValue<typeof type>,
    query: (query) => query,
    mutation: (mutation) => mutation,
  };

  return builder;
};

type TypeFunction = {
  <T>(type: string): T;
  <T extends Record<string, any>>(fields: T): ExtractValue<T>;
};

export const t = {
  id: () => "ID!",
  string: () => "String!",
  int: () => "Int!",
  boolean: () => "Boolean!",
  type: ((type: any) => type) as TypeFunction,
};
