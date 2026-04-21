import { boardResolvers } from "./board/resolvers";
import { listResolvers } from "./list/resolvers";
import { cardResolvers } from "./card/resolvers";
import { mergeResolvers } from "./merge-resolvers";

export const resolvers = mergeResolvers([
  boardResolvers,
  listResolvers,
  cardResolvers,
]);
