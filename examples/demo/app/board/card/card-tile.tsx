"use client";

import { forwardRef, type HTMLAttributes } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import type { CardView } from "../types";

export const CardTileView = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & {
    card: CardView;
    dragging?: boolean;
  }
>(({ card, dragging, className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      {...props}
      className={cn(
        "rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3 shadow-sm hover:border-[color:var(--color-accent)]/40 hover:shadow cursor-grab active:cursor-grabbing",
        dragging && "shadow-lg ring-1 ring-[color:var(--color-accent)]/20",
        className,
      )}
    >
      <div className="text-sm font-medium leading-snug">{card.title}</div>
      {card.description ? (
        <div className="mt-1 line-clamp-2 text-xs text-[color:var(--color-muted)]">
          {card.description}
        </div>
      ) : null}
    </div>
  );
});
CardTileView.displayName = "CardTileView";

type Props = {
  card: CardView;
  onOpen: () => void;
};

export function CardTile({ card, onOpen }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    data: { type: "card", listId: card.listId },
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  return (
    <CardTileView
      ref={setNodeRef}
      style={style}
      card={card}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        if (!isDragging) onOpen();
        e.stopPropagation();
      }}
    />
  );
}
