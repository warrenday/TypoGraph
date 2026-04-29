import type { Resolvers } from "@overstacked/typograph";
import { prisma } from "../../db";
import { publish, subscribe } from "../../pubsub";
import { cardTypeDefs } from "./schema";

const boardIdForCard = async (cardId: string): Promise<string> => {
  const row = await prisma.card.findUniqueOrThrow({
    where: { id: cardId },
    select: { list: { select: { boardId: true } } },
  });
  return row.list.boardId;
};

const boardIdForList = async (listId: string): Promise<string> => {
  const row = await prisma.list.findUniqueOrThrow({
    where: { id: listId },
    select: { boardId: true },
  });
  return row.boardId;
};

const nextCardPosition = async (listId: string): Promise<number> => {
  const last = await prisma.card.findFirst({
    where: { listId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return (last?.position ?? 0) + 1000;
};

export const cardResolvers: Resolvers<typeof cardTypeDefs> = {
  Card: {
    list: (parent) =>
      prisma.list.findUnique({ where: { id: parent.listId } }),
  },

  Mutation: {
    createCard: async (_source, args) => {
      const card = await prisma.card.create({
        data: {
          listId: args.listId,
          title: args.title,
          position: await nextCardPosition(args.listId),
        },
      });
      const boardId = await boardIdForList(args.listId);
      publish(`board:${boardId}:card`, {
        type: "created",
        cardId: card.id,
        toListId: args.listId,
        card,
        originClientId: args.clientId,
      });
      return card;
    },

    updateCard: async (_source, args) => {
      const card = await prisma.card.update({
        where: { id: args.id },
        data: {
          ...(args.title !== undefined && args.title !== null
            ? { title: args.title }
            : {}),
          ...(args.description !== undefined
            ? { description: args.description }
            : {}),
        },
      });
      const boardId = await boardIdForCard(card.id);
      publish(`board:${boardId}:card`, {
        type: "updated",
        cardId: card.id,
        card,
        originClientId: args.clientId,
      });
      return card;
    },

    moveCard: async (_source, args) => {
      const before = await prisma.card.findUniqueOrThrow({
        where: { id: args.id },
        select: { listId: true },
      });
      const card = await prisma.card.update({
        where: { id: args.id },
        data: { listId: args.toListId, position: args.position },
      });
      const boardId = await boardIdForList(args.toListId);
      publish(`board:${boardId}:card`, {
        type: "moved",
        cardId: card.id,
        fromListId: before.listId,
        toListId: args.toListId,
        card,
        originClientId: args.clientId,
      });
      return card;
    },

    deleteCard: async (_source, args) => {
      const boardId = await boardIdForCard(args.id);
      await prisma.card.delete({ where: { id: args.id } });
      publish(`board:${boardId}:card`, {
        type: "deleted",
        cardId: args.id,
        originClientId: args.clientId,
      });
      return args.id;
    },
  },

  Subscription: {
    cardChanged: {
      subscribe: (_source, args) =>
        subscribe(`board:${args.boardId}:card`),
      resolve: (payload) => payload,
    },
  },
};
