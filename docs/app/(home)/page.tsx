import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col justify-center text-center px-4">
      <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
        Typograph
      </h1>
      <p className="mx-auto mb-8 max-w-2xl text-fd-muted-foreground">
        Write GraphQL in plain TypeScript. Typograph turns ordinary JavaScript
        objects into standard GraphQL strings — fully typed end-to-end, with
        no codegen, no build step, and zero lock-in to any framework or
        client.
      </p>
      <div className="flex flex-row items-center justify-center gap-3">
        <Link
          href="/docs"
          className="rounded-lg bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground hover:bg-fd-primary/90"
        >
          Read the docs
        </Link>
        <Link
          href="/docs/basic-usage"
          className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-fd-accent"
        >
          Quick start
        </Link>
      </div>
    </main>
  );
}
