import type { ReactNode } from "react";

type Props = {
  title?: string;
  children: ReactNode;
};

export function BoardChrome({ title, children }: Props) {
  return (
    <div className="flex h-dvh flex-col">
      <header className="border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-6 py-3">
        <h1 className="text-base font-semibold">
          {title ?? "Typograph Kanban"}
        </h1>
      </header>
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
