import { BaseTypeDefs } from "./common";

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

type PartialResolver<T extends Record<string, { input: any; output: any }>> = {
  [K in keyof T]?: (args: T[K]["input"]) => DeepPartial<T[K]["output"]>;
};

type PartialTypeResolver<T extends Record<string, any>> = {
  [K in keyof T]?: () => T[K];
};

type Resolvers<T extends { types: BaseTypeDefs }> = {
  Query?: PartialResolver<T["types"]["Query"]>;
  Mutation?: PartialResolver<T["types"]["Mutation"]>;
} & Omit<
  {
    [K in keyof T["types"]]?: PartialTypeResolver<T["types"][K]>;
  },
  "Query" | "Mutation"
>;

export type { Resolvers };
