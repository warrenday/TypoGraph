"use client";

import { useQuery } from "@/lib/urql-client";
import type { BoardView } from "../types";

export function useBoardQuery(boardId: string) {
  const [result] = useQuery(
    {
      board: {
        id: true,
        name: true,
        lists: {
          id: true,
          boardId: true,
          title: true,
          position: true,
          cards: {
            id: true,
            listId: true,
            title: true,
            description: true,
            position: true,
          },
        },
      },
    },
    { variables: { id: boardId } },
  );

  return {
    fetching: result.fetching,
    error: result.error,
    board: (result.data?.board ?? null) as BoardView | null,
  };
}
