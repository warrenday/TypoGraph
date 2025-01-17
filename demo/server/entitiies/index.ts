import { builder } from "../builder";
import { userTypeDefs } from "../entitiies/user";
import { postTypeDefs } from "../entitiies/article";

// Combine Types
export const typeDefs = builder.combineTypeDefs([userTypeDefs, postTypeDefs]);
export type TypeDefs = typeof typeDefs;
