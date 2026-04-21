# Typograph

[![npm version](https://img.shields.io/npm/v/@overstacked/typograph)](https://www.npmjs.com/package/@overstacked/typograph)
[![license](https://img.shields.io/npm/l/@overstacked/typograph)](./LICENCE)

Write GraphQL in plain TypeScript. Typograph turns ordinary JavaScript objects into standard GraphQL strings — fully typed end-to-end, with no codegen, no build step, and zero lock-in to any framework or client.

```ts
import { createTypeDefBuilder, t, createClient } from "@overstacked/typograph";

const builder = createTypeDefBuilder();

const post = builder.type({
  id: t.string(),
  title: t.string(),
});

const typeDefs = builder.combineTypeDefs([
  builder.typeDef({
    Post: post,
    Query: {
      getPost: builder.query({
        input: t.type({ id: t.string().notNull() }),
        output: t.type<Post>("Post"),
      }),
    },
  }),
]);

type Post = typeof post;

const client = createClient(typeDefs);

const res = client.query(
  { getPost: { id: true, title: true } },
  { variables: { id: "p1" } },
);

type Result = typeof res.returnType;
//   ^? { getPost: { id: string; title: string } }
```

## Install

```bash
npm install @overstacked/typograph graphql
```

## Documentation

Full docs are available at [typographdocs.netlify.app](https://typographdocs.netlify.app/). You can also run them locally with `npm --prefix docs run dev`.

## License

MIT
