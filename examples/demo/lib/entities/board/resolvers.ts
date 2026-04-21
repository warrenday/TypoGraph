import { prisma } from "../../db";

export const boardResolvers = {
  Query: {
    board: async (_source: unknown, { id }: { id: string }) =>
      prisma.board.findUnique({ where: { id } }),
  },

  Board: {
    lists: (parent: { id: string }) =>
      prisma.list.findMany({
        where: { boardId: parent.id },
        orderBy: { position: "asc" },
      }),
  },
};
