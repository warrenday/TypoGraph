# Typograph

Write GraphQL in plain TypeScript. Typograph turns ordinary JavaScript objects into standard GraphQL strings — fully typed end-to-end, with no codegen, no build step, and zero lock-in to any framework or client.

```ts
import { createTypeDefBuilder, t, createClient } from "typograph";

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
npm install typograph graphql
```

## Documentation

Full docs live in [`docs/`](./docs/content/docs). Start with the [introduction](./docs/content/docs/introduction.mdx), or run `npm --prefix docs run dev` to browse them locally.

## License

MIT
