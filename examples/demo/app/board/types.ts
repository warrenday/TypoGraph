export type CardView = {
  id: string;
  listId: string;
  title: string;
  description: string | null;
  position: number;
};

export type ListView = {
  id: string;
  boardId: string;
  title: string;
  position: number;
  cards: CardView[];
};

export type BoardView = {
  id: string;
  name: string;
  lists: ListView[];
};
