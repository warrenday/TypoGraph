"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CardView } from "../types";

type Props = {
  card: CardView | null;
  onClose: () => void;
  onSave: (patch: { title?: string; description?: string }) => void;
  onDelete: () => void;
};

export function CardDialog({ card, onClose, onSave, onDelete }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (card) {
      setTitle(card.title);
      setDescription(card.description ?? "");
    }
  }, [card]);

  if (!card) return null;

  const commit = () => {
    const patch: { title?: string; description?: string } = {};
    if (title.trim() && title !== card.title) patch.title = title.trim();
    if (description !== (card.description ?? "")) {
      patch.description = description;
    }
    if (Object.keys(patch).length > 0) onSave(patch);
    onClose();
  };

  return (
    <Dialog
      open={card !== null}
      onOpenChange={(open) => {
        if (!open) commit();
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="sr-only">Edit card</DialogTitle>
        </DialogHeader>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Card title"
          className="text-base font-semibold"
        />
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add a more detailed description…"
          rows={6}
        />
        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              onDelete();
              onClose();
            }}
          >
            <Trash2 className="h-4 w-4" />
            Delete card
          </Button>
          <Button size="sm" onClick={commit}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
