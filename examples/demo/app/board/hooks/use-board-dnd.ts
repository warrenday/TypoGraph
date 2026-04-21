"use client";

import { useCallback, useState } from "react";
import {
  CollisionDetection,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { positionBetween } from "../position";
import type { BoardView, CardView } from "../types";
import type { BoardDispatch } from "./use-board-state";

type Deps = {
  board: BoardView | null;
  dispatch: BoardDispatch;
  moveList: (id: string, position: number) => void;
  moveCard: (
    id: string,
    fromListId: string,
    toListId: string,
    position: number,
  ) => void;
};

export function useBoardDnd({ board, dispatch, moveList, moveCard }: Deps) {
  const [draggingCard, setDraggingCard] = useState<CardView | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // `pointerWithin` resolves to whichever droppable the cursor is
  // literally inside, which is what lets empty columns win cleanly as
  // drop targets. `closestCorners` silently preferred cards in
  // adjacent non-empty columns. `rectIntersection` is the fallback for
  // pointer-in-gap edges.
  const collisionStrategy: CollisionDetection = useCallback((args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) {
      const card = pointerCollisions.find(
        (c) =>
          (c.data?.droppableContainer?.data?.current as { type?: string })
            ?.type === "card",
      );
      if (card) return [card];
      return pointerCollisions;
    }
    const rectCollisions = rectIntersection(args);
    const firstId = getFirstCollision(rectCollisions, "id");
    return firstId != null ? rectCollisions : [];
  }, []);

  const clearDragState = useCallback(() => setDraggingCard(null), []);

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      const type = (event.active.data.current as { type?: string } | undefined)
        ?.type;
      if (type === "card" && board) {
        const id = String(event.active.id);
        const card = board.lists
          .flatMap((l) => l.cards)
          .find((c) => c.id === id);
        if (card) setDraggingCard(card);
      }
    },
    [board],
  );

  const onDragOver = useCallback(
    (event: DragOverEvent) => {
      if (!board) return;
      const { active, over } = event;
      if (!over) return;

      const activeData = active.data.current as
        | { type: "card"; listId: string }
        | { type: "list"; listId: string }
        | undefined;
      if (activeData?.type !== "card") return;

      const overData = over.data.current as
        | { type: "card"; listId: string }
        | { type: "list"; listId: string }
        | undefined;

      const targetListId =
        overData?.type === "card"
          ? overData.listId
          : overData?.type === "list"
          ? overData.listId
          : undefined;
      if (!targetListId) return;
      if (targetListId === activeData.listId) return;

      const target = board.lists.find((l) => l.id === targetListId);
      const last = target?.cards[target.cards.length - 1];
      const nextPosition = (last?.position ?? 0) + 1000;
      dispatch({
        kind: "cardMoved",
        id: String(active.id),
        fromListId: activeData.listId,
        toListId: targetListId,
        position: nextPosition,
      });
      activeData.listId = targetListId;
    },
    [board, dispatch],
  );

  // Authoritative: doesn't rely on `onDragOver` having moved the card
  // into the target list first. Computes the final move from the
  // current state + `over` so empty columns and dead-space drops
  // behave correctly.
  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      clearDragState();
      if (!board) return;
      const { active, over } = event;
      if (!over) return;

      const activeType = (
        active.data.current as { type?: string } | undefined
      )?.type;

      if (activeType === "list") {
        const overType = (over.data.current as { type?: string } | undefined)
          ?.type;
        if (overType !== "list") return;
        const oldIndex = board.lists.findIndex((l) => l.id === active.id);
        const newIndex = board.lists.findIndex((l) => l.id === over.id);
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
        const reordered = arrayMove(board.lists, oldIndex, newIndex);
        const prev = reordered[newIndex - 1]?.position;
        const next = reordered[newIndex + 1]?.position;
        const position = positionBetween(prev, next);
        moveList(String(active.id), position);
        return;
      }

      if (activeType !== "card") return;

      const overData = over.data.current as
        | { type: "card"; listId: string }
        | { type: "list"; listId: string }
        | undefined;

      const targetListId =
        overData?.type === "card"
          ? overData.listId
          : overData?.type === "list"
          ? overData.listId
          : undefined;
      if (!targetListId) return;

      const currentCard = board.lists
        .flatMap((l) => l.cards)
        .find((c) => c.id === active.id);
      if (!currentCard) return;
      const currentListId = currentCard.listId;

      const targetList = board.lists.find((l) => l.id === targetListId);
      if (!targetList) return;

      const destCards = targetList.cards.filter((c) => c.id !== active.id);

      let insertAt: number;
      if (overData?.type === "card" && String(over.id) !== String(active.id)) {
        const overIdx = destCards.findIndex((c) => c.id === String(over.id));
        insertAt = overIdx >= 0 ? overIdx : destCards.length;
      } else {
        insertAt = destCards.length;
      }

      const projected = [
        ...destCards.slice(0, insertAt),
        currentCard,
        ...destCards.slice(insertAt),
      ];
      const newIdx = projected.findIndex((c) => c.id === active.id);
      const prev = projected[newIdx - 1]?.position;
      const next = projected[newIdx + 1]?.position;
      const position = positionBetween(prev, next);

      if (
        targetListId === currentListId &&
        Math.abs(position - currentCard.position) < 0.0001
      ) {
        return;
      }

      moveCard(String(active.id), currentListId, targetListId, position);
    },
    [board, clearDragState, moveCard, moveList],
  );

  return {
    draggingCard,
    sensors,
    collisionStrategy,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel: clearDragState,
  };
}
