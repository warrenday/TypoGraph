import type { Resolvers } from "@overstacked/typograph";
import { prisma } from "../../db";
import { boardTypeDefs } from "./schema";

export const boardResolvers: Resolvers<typeof boardTypeDefs> = {
  Query: {
    board: async (_source, { id }) =>
      prisma.board.findUnique({ where: { id } }),
  },

  Board: {
    lists: (parent) =>
      prisma.list.findMany({
        where: { boardId: parent.id },
        orderBy: { position: "asc" },
      }),
  },
};
