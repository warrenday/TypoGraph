import { builder } from "./builder";
import * as board from "./board";
import * as list from "./list";
import * as card from "./card";

export const typeDefs = builder.combineTypeDefs([
  board.typeDefs,
  list.typeDefs,
  card.typeDefs,
]);

export type TypeDefs = typeof typeDefs;

export type { Board } from "./board";
export type { List, BoardChange } from "./list";
export type { Card, CardChange } from "./card";
