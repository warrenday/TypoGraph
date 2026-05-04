# Typograph

[![npm version](https://img.shields.io/npm/v/@overstacked/typograph)](https://www.npmjs.com/package/@overstacked/typograph)
[![license](https://img.shields.io/npm/l/@overstacked/typograph)](./LICENCE)

**A lightweight GraphQL toolkit for full-stack TypeScript projects.**

If your server and client live in the same codebase — a Next.js app, a monorepo, a full-stack TypeScript project — Typograph lets you define your schema once in plain TypeScript and share it across both sides. Fully typed end-to-end, no codegen, no build step, no `.graphql` files to keep in sync.

It's not trying to replace Apollo, Pothos, or any other GraphQL stack. It's the minimal option for when you own both ends and just want types to flow through.

## Demo

https://www.youtube.com/watch?v=oCRgS9mvTAo

## When to use it

- ✅ You have a Next.js / Remix / full-stack TS app and want GraphQL without the ceremony
- ✅ You're in a monorepo where server and client can import from each other
- ✅ You want schema + resolver + client types derived from a single source
- ❌ Your server and client are separate codebases owned by different teams (use codegen)
- ❌ You only need a backend GraphQL API (use an SDL-first setup)
- ❌ You want to hide parts of your schema or your schema is extremely large (Codegen is a better option)

## Example

Define your schema once and share it:

```ts
// schema.ts — imported by both server and client
import {
  createTypeDefBuilder,
  t,
  type Resolvers,
} from "@overstacked/typograph";

const builder = createTypeDefBuilder();

const post = builder.type({
  id: t.id().notNull(),
  title: t.string().notNull(),
});

type Post = typeof post;

export const typeDefs = builder.combineTypeDefs([
  builder.typeDef({
    Post: post,
    Query: {
      getPost: builder.query({
        input: { id: t.id().notNull() },
        output: t.type<Post>("Post"),
      }),
    },
    Mutation: {},
  }),
]);

export const resolvers: Resolvers<typeof typeDefs> = {
  Query: {
    getPost: ({ id }) => ({ id, title: "Hello World" }),
  },
};
```

Wire up the server (Next.js route handler shown — works with Yoga, Apollo, or any executor):

```ts
// app/api/graphql/route.ts
import { createYoga, createSchema } from "graphql-yoga";
import { typeDefs, resolvers } from "@/schema";

const { handleRequest } = createYoga({
  schema: createSchema({ typeDefs: typeDefs.toSDL(), resolvers }),
  graphqlEndpoint: "/api/graphql",
  fetchAPI: { Response },
});

export { handleRequest as GET, handleRequest as POST };
```

Query it from the client with full inference — no codegen:

```tsx
// app/post/page.tsx
"use client";
import { createUrqlIntegration } from "@overstacked/typograph/integrations/urql";
import { typeDefs } from "@/schema";

const { useQuery } = createUrqlIntegration(typeDefs);

export default function Post() {
  const [result] = useQuery(
    {
      getPost: { id: true, title: true },
      //                      ^? boolean — only real fields are selectable
    },
    { variables: { id: "1" } },
  );

  const data = result.data;
  //    ^? { getPost: { id: string; title: string } } | undefined
  return <h1>{data?.getPost.title}</h1>;
}
```

## Install

```bash
npm install @overstacked/typograph graphql
```

Integrations available for [urql](https://typographdocs.netlify.app/docs/urql), [Apollo](https://typographdocs.netlify.app/docs/apollo), [React Query](https://typographdocs.netlify.app/docs/react-query), or [any GraphQL client](https://typographdocs.netlify.app/docs/any-client).

## Documentation

Full docs at [typographdocs.netlify.app](https://typographdocs.netlify.app/). Run locally with `npm --prefix docs run dev`.

## License

MIT
