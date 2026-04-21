import { t } from "@overstacked/typograph";
import { builder } from "../builder";
import type { List } from "../list";

const card = builder.type({
  id: t.string().notNull(),
  listId: t.string().notNull(),
  title: t.string().notNull(),
  description: t.string(),
  position: t.type<number>("Float!"),
  list: () => t.type<List>("List!"),
});

export type Card = typeof card;

const cardChange = builder.type({
  type: t.string().notNull(),
  cardId: t.string(),
  fromListId: t.string(),
  toListId: t.string(),
  card: () => t.type<Card>("Card"),
  originClientId: t.string(),
});

export type CardChange = typeof cardChange;

export const cardTypeDefs = builder.typeDef({
  Card: card,
  CardChange: cardChange,

  Mutation: {
    createCard: builder.mutation({
      input: t.type({
        listId: t.string().notNull(),
        title: t.string().notNull(),
        clientId: t.string().notNull(),
      }),
      output: t.type<Card>("Card!"),
    }),
    updateCard: builder.mutation({
      input: t.type({
        id: t.string().notNull(),
        title: t.string(),
        description: t.string(),
        clientId: t.string().notNull(),
      }),
      output: t.type<Card>("Card!"),
    }),
    moveCard: builder.mutation({
      input: t.type({
        id: t.string().notNull(),
        toListId: t.string().notNull(),
        position: t.type<number>("Float!"),
        clientId: t.string().notNull(),
      }),
      output: t.type<Card>("Card!"),
    }),
    deleteCard: builder.mutation({
      input: t.type({
        id: t.string().notNull(),
        clientId: t.string().notNull(),
      }),
      output: t.type<string>("String!"),
    }),
  },

  Subscription: {
    cardChanged: builder.subscription({
      input: t.type({ boardId: t.string().notNull() }),
      output: t.type<CardChange>("CardChange!"),
    }),
  },
});
