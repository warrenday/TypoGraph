# WORK IN PROGRESS

# A pure TypeScript GraphQL typeDef builder

A collection of utilities to build GraphQL typeDefs with full type safety using TypeScript. Types can be used to generate a fully typed client and server.

This library is unopinionated and does not include any code for executing queries or mutations. Continue to use your favorite GraphQL client and server frameworks, but you no longer need to run code generators.

## Usage

```ts
import { createTypeDefBuilder } from "graphql-type-def-builder";

const t = createTypeDefBuilder();

// Define a user type
const user = t.type({
  id: t.string(),
  name: t.string(),
});

// Define a post type
const post = t.type({
  id: t.string(),
  title: t.string(),
  author: t.type<typeof user>("User"),
});

// Define a query
const query = t.typeDefs({
  User: user,
  Post: post,
  Query: {
    getUser: builder.query({
      input: t.type({ id: t.string() }),
      output: t.type<typeof user>("User"),
    }),
  },
});

const typeDefs = t.combineTypeDefs([user, post, query]);

export type TypeDefs = typeof typeDefs;
```

## Client

```ts
import { createClient } from "graphql-type-def-builder/client";

const client = createClient<TypeDefs>();

const user = await client.query("getUser", {
  input: { id: "1" },
  select: {
    id: true,
    name: true,
  },
});
```

## Server

```ts
const resolvers: Resolvers<TypeDefs> = {
  Post: {
    id: () => "2",
  },
  Query: {
    getUser: (args) => {
      return {
        id: "1",
      };
    },
  },
};
```
