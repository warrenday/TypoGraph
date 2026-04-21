"use client";

import { useEffect } from "react";
import { useSubscription } from "@/lib/urql-client";
import type { CardView, ListView } from "../types";
import type { BoardDispatch } from "./use-board-state";

type Deps = {
  boardId: string;
  clientId: string;
  dispatch: BoardDispatch;
};

export function useBoardSubscriptions({ boardId, clientId, dispatch }: Deps) {
  const [boardSub] = useSubscription(
    {
      boardChanged: {
        type: true,
        listId: true,
        originClientId: true,
        list: {
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
    { variables: { boardId } },
  );

  const [cardSub] = useSubscription(
    {
      cardChanged: {
        type: true,
        cardId: true,
        fromListId: true,
        toListId: true,
        originClientId: true,
        card: {
          id: true,
          listId: true,
          title: true,
          description: true,
          position: true,
        },
      },
    },
    { variables: { boardId } },
  );

  useEffect(() => {
    const event = boardSub.data?.boardChanged;
    if (!event) return;
    if (event.originClientId === clientId) return;

    if (event.type === "created" && event.list) {
      const list = event.list as ListView;
      dispatch({
        kind: "listCreated",
        list: { ...list, cards: list.cards ?? [] },
      });
    } else if (event.type === "updated" && event.list) {
      dispatch({
        kind: "listUpdated",
        list: event.list as Partial<ListView> & { id: string },
      });
    } else if (event.type === "moved" && event.list) {
      dispatch({
        kind: "listMoved",
        id: event.list.id,
        position: event.list.position,
      });
    } else if (event.type === "deleted" && event.listId) {
      dispatch({ kind: "listDeleted", id: event.listId });
    }
  }, [boardSub.data, clientId, dispatch]);

  useEffect(() => {
    const event = cardSub.data?.cardChanged;
    if (!event) return;
    if (event.originClientId === clientId) return;

    if (event.type === "created" && event.card) {
      dispatch({ kind: "cardCreated", card: event.card as CardView });
    } else if (event.type === "updated" && event.card) {
      dispatch({
        kind: "cardUpdated",
        card: event.card as Partial<CardView> & { id: string },
      });
    } else if (event.type === "moved" && event.card && event.toListId) {
      dispatch({
        kind: "cardMoved",
        id: event.card.id,
        fromListId: event.fromListId ?? event.card.listId,
        toListId: event.toListId,
        position: event.card.position,
      });
    } else if (event.type === "deleted" && event.cardId) {
      dispatch({
        kind: "cardDeleted",
        id: event.cardId,
        fromListId: event.fromListId ?? "",
      });
    }
  }, [cardSub.data, clientId, dispatch]);
}
