"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { useMutation } from "@/lib/urql-client";
import type { CardView, ListView } from "../types";
import type { BoardDispatch } from "./use-board-state";

type Deps = {
  boardId: string;
  clientId: string;
  dispatch: BoardDispatch;
};

export function useBoardMutations({ boardId, clientId, dispatch }: Deps) {
  const [, createListMutation] = useMutation({
    createList: { id: true, boardId: true, title: true, position: true },
  });
  const [, renameListMutation] = useMutation({
    renameList: { id: true, title: true },
  });
  const [, moveListMutation] = useMutation({
    moveList: { id: true, position: true },
  });
  const [, deleteListMutation] = useMutation({ deleteList: true });

  const addList = useCallback(
    async (title: string) => {
      const result = await createListMutation({ boardId, title, clientId });
      if (result.error) {
        toast.error("Couldn't add list", { description: result.error.message });
        return;
      }
      if (result.data?.createList) {
        dispatch({
          kind: "listCreated",
          list: { ...result.data.createList, cards: [] } as ListView,
        });
      }
    },
    [boardId, clientId, createListMutation, dispatch],
  );

  const renameList = useCallback(
    async (id: string, title: string) => {
      dispatch({ kind: "listUpdated", list: { id, title } });
      const result = await renameListMutation({ id, title, clientId });
      if (result.error) {
        toast.error("Couldn't rename list", {
          description: result.error.message,
        });
      }
    },
    [clientId, dispatch, renameListMutation],
  );

  const moveList = useCallback(
    async (id: string, position: number) => {
      dispatch({ kind: "listMoved", id, position });
      const result = await moveListMutation({ id, position, clientId });
      if (result.error) {
        toast.error("Couldn't move list", {
          description: result.error.message,
        });
      }
    },
    [clientId, dispatch, moveListMutation],
  );

  const deleteList = useCallback(
    async (id: string) => {
      dispatch({ kind: "listDeleted", id });
      const result = await deleteListMutation({ id, clientId });
      if (result.error) {
        toast.error("Couldn't delete list", {
          description: result.error.message,
        });
      }
    },
    [clientId, deleteListMutation, dispatch],
  );

  const [, createCardMutation] = useMutation({
    createCard: {
      id: true,
      listId: true,
      title: true,
      description: true,
      position: true,
    },
  });
  const [, updateCardMutation] = useMutation({
    updateCard: { id: true, title: true, description: true },
  });
  const [, moveCardMutation] = useMutation({
    moveCard: { id: true, listId: true, position: true },
  });
  const [, deleteCardMutation] = useMutation({ deleteCard: true });

  const addCard = useCallback(
    async (listId: string, title: string) => {
      const result = await createCardMutation({ listId, title, clientId });
      if (result.error) {
        toast.error("Couldn't add card", { description: result.error.message });
        return;
      }
      if (result.data?.createCard) {
        dispatch({
          kind: "cardCreated",
          card: result.data.createCard as CardView,
        });
      }
    },
    [clientId, createCardMutation, dispatch],
  );

  const updateCard = useCallback(
    async (
      id: string,
      patch: { title?: string; description?: string },
    ) => {
      dispatch({ kind: "cardUpdated", card: { id, ...patch } });
      const result = await updateCardMutation({
        id,
        clientId,
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.description !== undefined
          ? { description: patch.description }
          : {}),
      });
      if (result.error) {
        toast.error("Couldn't update card", {
          description: result.error.message,
        });
      }
    },
    [clientId, dispatch, updateCardMutation],
  );

  const moveCard = useCallback(
    async (
      id: string,
      fromListId: string,
      toListId: string,
      position: number,
    ) => {
      dispatch({
        kind: "cardMoved",
        id,
        fromListId,
        toListId,
        position,
      });
      const result = await moveCardMutation({
        id,
        toListId,
        position,
        clientId,
      });
      if (result.error) {
        toast.error("Couldn't move card", {
          description: result.error.message,
        });
      }
    },
    [clientId, dispatch, moveCardMutation],
  );

  const deleteCard = useCallback(
    async (id: string, fromListId: string) => {
      dispatch({ kind: "cardDeleted", id, fromListId });
      const result = await deleteCardMutation({ id, clientId });
      if (result.error) {
        toast.error("Couldn't delete card", {
          description: result.error.message,
        });
      }
    },
    [clientId, deleteCardMutation, dispatch],
  );

  return {
    addList,
    renameList,
    moveList,
    deleteList,
    addCard,
    updateCard,
    moveCard,
    deleteCard,
  };
}

export type BoardMutations = ReturnType<typeof useBoardMutations>;
