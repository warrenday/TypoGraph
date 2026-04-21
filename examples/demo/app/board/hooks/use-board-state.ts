"use client";

import { useReducer, useEffect, useRef } from "react";
import type { BoardView, CardView, ListView } from "../types";

type Action =
  | { kind: "hydrate"; board: BoardView }
  | { kind: "listCreated"; list: ListView }
  | { kind: "listUpdated"; list: Partial<ListView> & { id: string } }
  | { kind: "listMoved"; id: string; position: number }
  | { kind: "listDeleted"; id: string }
  | { kind: "cardCreated"; card: CardView }
  | { kind: "cardUpdated"; card: Partial<CardView> & { id: string } }
  | {
      kind: "cardMoved";
      id: string;
      fromListId: string;
      toListId: string;
      position: number;
    }
  | { kind: "cardDeleted"; id: string; fromListId: string };

export type BoardAction = Action;
export type BoardDispatch = (action: BoardAction) => void;

const sortByPosition = <T extends { position: number }>(items: T[]): T[] =>
  [...items].sort((a, b) => a.position - b.position);

const reducer = (state: BoardView | null, action: Action): BoardView | null => {
  if (action.kind === "hydrate") return action.board;
  if (!state) return null;

  switch (action.kind) {
    case "listCreated": {
      if (state.lists.some((l) => l.id === action.list.id)) return state;
      return {
        ...state,
        lists: sortByPosition([
          ...state.lists,
          { ...action.list, cards: action.list.cards ?? [] },
        ]),
      };
    }

    case "listUpdated": {
      return {
        ...state,
        lists: state.lists.map((l) =>
          l.id === action.list.id ? { ...l, ...action.list } : l,
        ),
      };
    }

    case "listMoved": {
      return {
        ...state,
        lists: sortByPosition(
          state.lists.map((l) =>
            l.id === action.id ? { ...l, position: action.position } : l,
          ),
        ),
      };
    }

    case "listDeleted": {
      return {
        ...state,
        lists: state.lists.filter((l) => l.id !== action.id),
      };
    }

    case "cardCreated": {
      return {
        ...state,
        lists: state.lists.map((l) =>
          l.id === action.card.listId
            ? {
                ...l,
                cards: sortByPosition([
                  ...l.cards.filter((c) => c.id !== action.card.id),
                  action.card,
                ]),
              }
            : l,
        ),
      };
    }

    case "cardUpdated": {
      return {
        ...state,
        lists: state.lists.map((l) => ({
          ...l,
          cards: l.cards.map((c) =>
            c.id === action.card.id ? { ...c, ...action.card } : c,
          ),
        })),
      };
    }

    case "cardMoved": {
      let card: CardView | undefined;
      const lists = state.lists.map((l) => ({
        ...l,
        cards: l.cards.filter((c) => {
          if (c.id === action.id) {
            card = c;
            return false;
          }
          return true;
        }),
      }));
      if (!card) return state;
      const moved: CardView = {
        ...card,
        listId: action.toListId,
        position: action.position,
      };
      return {
        ...state,
        lists: lists.map((l) =>
          l.id === action.toListId
            ? { ...l, cards: sortByPosition([...l.cards, moved]) }
            : l,
        ),
      };
    }

    case "cardDeleted": {
      return {
        ...state,
        lists: state.lists.map((l) => ({
          ...l,
          cards: l.cards.filter((c) => c.id !== action.id),
        })),
      };
    }

    default: {
      const _exhaust: never = action;
      void _exhaust;
      return state;
    }
  }
};

export function useBoardState(initial: BoardView | null) {
  const [state, dispatch] = useReducer(reducer, initial);
  const hydratedId = useRef<string | null>(initial?.id ?? null);

  useEffect(() => {
    if (initial && initial.id !== hydratedId.current) {
      hydratedId.current = initial.id;
      dispatch({ kind: "hydrate", board: initial });
    }
  }, [initial]);

  return [state, dispatch] as const;
}
