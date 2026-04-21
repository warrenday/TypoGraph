import { t } from "typograph";
import { builder } from "../builder";
import type { Card } from "../card";

const list = builder.type({
  id: t.string().notNull(),
  boardId: t.string().notNull(),
  title: t.string().notNull(),
  position: t.type<number>("Float!"),
  cards: () => t.type<Card[]>("[Card!]!"),
});

export type List = typeof list;

const boardChange = builder.type({
  type: t.string().notNull(),
  listId: t.string(),
  list: () => t.type<List>("List"),
  originClientId: t.string(),
});

export type BoardChange = typeof boardChange;

export const listTypeDefs = builder.typeDef({
  List: list,
  BoardChange: boardChange,

  Mutation: {
    createList: builder.mutation({
      input: t.type({
        boardId: t.string().notNull(),
        title: t.string().notNull(),
        clientId: t.string().notNull(),
      }),
      output: t.type<List>("List!"),
    }),
    renameList: builder.mutation({
      input: t.type({
        id: t.string().notNull(),
        title: t.string().notNull(),
        clientId: t.string().notNull(),
      }),
      output: t.type<List>("List!"),
    }),
    moveList: builder.mutation({
      input: t.type({
        id: t.string().notNull(),
        position: t.type<number>("Float!"),
        clientId: t.string().notNull(),
      }),
      output: t.type<List>("List!"),
    }),
    deleteList: builder.mutation({
      input: t.type({
        id: t.string().notNull(),
        clientId: t.string().notNull(),
      }),
      output: t.type<string>("String!"),
    }),
  },

  Subscription: {
    boardChanged: builder.subscription({
      input: t.type({ boardId: t.string().notNull() }),
      output: t.type<BoardChange>("BoardChange!"),
    }),
  },
});
