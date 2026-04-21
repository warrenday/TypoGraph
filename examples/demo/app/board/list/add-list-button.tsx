"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = { onCreate: (title: string) => void };

export function AddListButton({ onCreate }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed) onCreate(trimmed);
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
        className="h-10 w-72 shrink-0 justify-start border border-dashed border-[color:var(--color-border)] text-[color:var(--color-muted)]"
        onClick={() => setEditing(true)}
      >
        <Plus className="h-4 w-4" />
        Add another list
      </Button>
    );
  }

  return (
    <div className="flex w-72 shrink-0 flex-col gap-2 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-2">
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") cancel();
        }}
        placeholder="Enter list title…"
      />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={commit}>
          Add list
        </Button>
        <Button size="sm" variant="ghost" onClick={cancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
