import { Board } from "./board/board";

export default function HomePage() {
  const boardId = process.env.NEXT_PUBLIC_BOARD_ID;

  if (!boardId) {
    return (
      <div className="flex h-dvh items-center justify-center p-8 text-center">
        <div className="max-w-md space-y-2">
          <h1 className="text-lg font-semibold">No board seeded yet</h1>
          <p className="text-sm text-[color:var(--color-muted)]">
            Run <code className="rounded bg-[color:var(--color-surface-muted)] px-1">npm run db:seed</code> and
            copy the printed id into <code className="rounded bg-[color:var(--color-surface-muted)] px-1">NEXT_PUBLIC_BOARD_ID</code>.
          </p>
        </div>
      </div>
    );
  }

  return <Board boardId={boardId} />;
}
