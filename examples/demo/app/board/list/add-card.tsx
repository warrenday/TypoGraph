"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  onAdd: (title: string) => void;
};

export function AddCard({ onAdd }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed) onAdd(trimmed);
    setDraft("");
    setEditing(false);
  };

  const cancel = () => {
    setDraft("");
    setEditing(false);
  };

  if (!editing) {
    return (
      <Button
        variant="ghost"
        className="w-full justify-start text-[color:var(--color-muted)]"
        size="sm"
        onClick={() => setEditing(true)}
      >
        <Plus className="h-4 w-4" />
        Add a card
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") cancel();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        placeholder="Enter a title…"
      />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={commit}>
          Add card
        </Button>
        <Button size="sm" variant="ghost" onClick={cancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
