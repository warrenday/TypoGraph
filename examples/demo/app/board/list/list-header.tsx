"use client";

import { useState } from "react";
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

type Props = {
  title: string;
  onRename: (title: string) => void;
  onDelete: () => void;
  dragAttributes: DraggableAttributes;
  dragListeners: DraggableSyntheticListeners;
};

export function ListHeader({
  title,
  onRename,
  onDelete,
  dragAttributes,
  dragListeners,
}: Props) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(title);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== title) onRename(trimmed);
    setRenaming(false);
  };

  const cancel = () => {
    setDraft(title);
    setRenaming(false);
  };

  return (
    <div
      className="flex items-center gap-1 px-3 py-2 cursor-grab active:cursor-grabbing"
      {...dragAttributes}
      {...dragListeners}
    >
      {renaming ? (
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") cancel();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="h-7 text-sm font-semibold"
        />
      ) : (
        <div
          className="flex-1 px-1 text-sm font-semibold"
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={() => setRenaming(true)}
        >
          {title}
        </div>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem destructive onSelect={onDelete}>
            Delete list
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
