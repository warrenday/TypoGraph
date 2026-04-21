"use client";

import {
  useSortable,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CardTile } from "../card/card-tile";
import { ListHeader } from "./list-header";
import { AddCard } from "./add-card";
import type { CardView, ListView } from "../types";

type Props = {
  list: ListView;
  onCardOpen: (card: CardView) => void;
  onAddCard: (title: string) => void;
  onRename: (title: string) => void;
  onDelete: () => void;
};

export function ListColumn({
  list,
  onCardOpen,
  onAddCard,
  onRename,
  onDelete,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: list.id,
    data: { type: "list", listId: list.id },
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex w-72 shrink-0 flex-col rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)]"
    >
      <ListHeader
        title={list.title}
        onRename={onRename}
        onDelete={onDelete}
        dragAttributes={attributes}
        dragListeners={listeners}
      />

      <div className="flex-1 space-y-2 px-2 pb-2 min-h-8">
        <SortableContext
          items={list.cards.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {list.cards.map((card) => (
            <CardTile
              key={card.id}
              card={card}
              onOpen={() => onCardOpen(card)}
            />
          ))}
        </SortableContext>
      </div>

      <div className="p-2">
        <AddCard onAdd={onAddCard} />
      </div>
    </div>
  );
}
