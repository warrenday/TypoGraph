import { t } from "@overstacked/typograph";
import { builder } from "../builder";
import type { List } from "../list";

const board = builder.type({
  id: t.string().notNull(),
  name: t.string().notNull(),
  lists: () => t.type<List[]>("[List!]!"),
});

export type Board = typeof board;

export const boardTypeDefs = builder.typeDef({
  Board: board,
  Query: {
    board: builder.query({
      input: t.type({ id: t.string().notNull() }),
      output: t.type<Board>("Board"),
    }),
  },
});
