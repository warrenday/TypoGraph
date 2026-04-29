import type { Resolvers } from "@overstacked/typograph";
import { prisma } from "../../db";
import { publish, subscribe } from "../../pubsub";
import { listTypeDefs } from "./schema";

const nextListPosition = async (boardId: string): Promise<number> => {
  const last = await prisma.list.findFirst({
    where: { boardId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return (last?.position ?? 0) + 1000;
};

export const listResolvers: Resolvers<typeof listTypeDefs> = {
  List: {
    cards: (parent) =>
      prisma.card.findMany({
        where: { listId: parent.id },
        orderBy: { position: "asc" },
      }),
  },

  Mutation: {
    createList: async (_source, args) => {
      const list = await prisma.list.create({
        data: {
          boardId: args.boardId,
          title: args.title,
          position: await nextListPosition(args.boardId),
        },
      });
      publish(`board:${args.boardId}:list`, {
        type: "created",
        listId: list.id,
        list,
        originClientId: args.clientId,
      });
      return list;
    },

    renameList: async (_source, args) => {
      const list = await prisma.list.update({
        where: { id: args.id },
        data: { title: args.title },
      });
      publish(`board:${list.boardId}:list`, {
        type: "updated",
        listId: list.id,
        list,
        originClientId: args.clientId,
      });
      return list;
    },

    moveList: async (_source, args) => {
      const list = await prisma.list.update({
        where: { id: args.id },
        data: { position: args.position },
      });
      publish(`board:${list.boardId}:list`, {
        type: "moved",
        listId: list.id,
        list,
        originClientId: args.clientId,
      });
      return list;
    },

    deleteList: async (_source, args) => {
      const list = await prisma.list.findUniqueOrThrow({
        where: { id: args.id },
        select: { boardId: true },
      });
      await prisma.list.delete({ where: { id: args.id } });
      publish(`board:${list.boardId}:list`, {
        type: "deleted",
        listId: args.id,
        originClientId: args.clientId,
      });
      return args.id;
    },
  },

  Subscription: {
    boardChanged: {
      subscribe: (_source, args) =>
        subscribe(`board:${args.boardId}:list`),
      resolve: (payload) => payload,
    },
  },
};
