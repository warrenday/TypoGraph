import { prisma } from "../../db";
import { publish, subscribe } from "../../pubsub";

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

export const cardResolvers = {
  Card: {
    list: (parent: { listId: string }) =>
      prisma.list.findUnique({ where: { id: parent.listId } }),
  },

  Mutation: {
    createCard: async (
      _source: unknown,
      args: { listId: string; title: string; clientId: string },
    ) => {
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

    updateCard: async (
      _source: unknown,
      args: {
        id: string;
        title?: string | null;
        description?: string | null;
        clientId: string;
      },
    ) => {
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

    moveCard: async (
      _source: unknown,
      args: {
        id: string;
        toListId: string;
        position: number;
        clientId: string;
      },
    ) => {
      // Capture the source list *before* the move so the published
      // event can carry both endpoints — the UI uses them to splice the
      // card out of the old column and into the new one.
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

    deleteCard: async (
      _source: unknown,
      args: { id: string; clientId: string },
    ) => {
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
      subscribe: (_source: unknown, args: { boardId: string }) =>
        subscribe(`board:${args.boardId}:card`),
      resolve: (payload: unknown) => payload,
    },
  },
};
