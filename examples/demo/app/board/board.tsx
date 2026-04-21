"use client";

import { useState } from "react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";

import { useClientId } from "@/lib/client-id";

import { BoardChrome } from "./chrome";
import { useBoardQuery } from "./hooks/use-board-query";
import { useBoardState } from "./hooks/use-board-state";
import { useBoardMutations } from "./hooks/use-board-mutations";
import { useBoardSubscriptions } from "./hooks/use-board-subscriptions";
import { useBoardDnd } from "./hooks/use-board-dnd";

import { ListColumn } from "./list/list-column";
import { AddListButton } from "./list/add-list-button";
import { CardTileView } from "./card/card-tile";
import { CardDialog } from "./card/card-dialog";

import type { CardView } from "./types";

type Props = { boardId: string };

export function Board({ boardId }: Props) {
  const clientId = useClientId();
  const { fetching, error, board: initial } = useBoardQuery(boardId);
  const [board, dispatch] = useBoardState(initial);

  const mutations = useBoardMutations({ boardId, clientId, dispatch });
  useBoardSubscriptions({ boardId, clientId, dispatch });
  const dnd = useBoardDnd({
    board,
    dispatch,
    moveList: mutations.moveList,
    moveCard: mutations.moveCard,
  });

  const [openCard, setOpenCard] = useState<CardView | null>(null);

  if (fetching && !board) return <BoardChrome>Loading board…</BoardChrome>;
  if (error) {
    return (
      <BoardChrome>
        <span className="text-red-600">
          Error loading board: {error.message}
        </span>
      </BoardChrome>
    );
  }
  if (!board) return <BoardChrome>No board found.</BoardChrome>;

  return (
    <BoardChrome title={board.name}>
      <DndContext
        sensors={dnd.sensors}
        collisionDetection={dnd.collisionStrategy}
        onDragStart={dnd.onDragStart}
        onDragOver={dnd.onDragOver}
        onDragEnd={dnd.onDragEnd}
        onDragCancel={dnd.onDragCancel}
      >
        <div className="flex h-full gap-3 overflow-x-auto p-4">
          <SortableContext
            items={board.lists.map((l) => l.id)}
            strategy={horizontalListSortingStrategy}
          >
            {board.lists.map((list) => (
              <ListColumn
                key={list.id}
                list={list}
                onCardOpen={setOpenCard}
                onAddCard={(title) => mutations.addCard(list.id, title)}
                onRename={(title) => mutations.renameList(list.id, title)}
                onDelete={() => mutations.deleteList(list.id)}
              />
            ))}
          </SortableContext>
          <AddListButton onCreate={mutations.addList} />
        </div>

        <DragOverlay dropAnimation={null}>
          {dnd.draggingCard ? (
            <CardTileView card={dnd.draggingCard} dragging />
          ) : null}
        </DragOverlay>
      </DndContext>

      <CardDialog
        card={openCard}
        onClose={() => setOpenCard(null)}
        onSave={(patch) => openCard && mutations.updateCard(openCard.id, patch)}
        onDelete={() =>
          openCard && mutations.deleteCard(openCard.id, openCard.listId)
        }
      />
    </BoardChrome>
  );
}
