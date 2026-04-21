// End-to-end coverage for every example documented in DEVELOPMENT.md.
//
// Each `describe` block corresponds to one example. The goal is to prove
// that the typograph client + the typograph SDL + a real GraphQL execution
// engine (graphql.execute, the same machinery graphql-yoga runs on) all
// agree on the example. If a regression breaks any example, exactly one
// block will fail and point at the responsible piece.
//
// We deliberately avoid `@graphql-tools/schema` here: it transitively imports
// `graphql` in a way that, under Vitest's SSR loader, can produce two
// instances of the `graphql` package and crash with "Duplicate graphql
// modules". Instead we use `buildSchema` from `graphql` itself plus a tiny
// `attachResolvers` helper. This routes through the exact same
// `graphql.execute` engine graphql-yoga uses, so there's no loss of fidelity.

import { describe, expect, it } from "vitest";
import {
  graphql,
  buildSchema,
  GraphQLObjectType,
  parse,
  subscribe,
  type GraphQLSchema,
  type ExecutionResult,
} from "graphql";
import { createTypeDefBuilder, t } from "./builder";
import createClient, { args } from "./client";
import type { Resolvers } from "./types/resolvers";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

// Walk a parsed schema and assign resolver functions to fields. This mirrors
// what `@graphql-tools/schema`'s `addResolversToSchema` does, but without
// pulling in a separate copy of the `graphql` package.
//
// typograph's resolver signatures now match graphql-js's `(source, args,
// context, info)` calling convention verbatim, so we can wire resolvers
// straight onto the field without any argument shuffling.
const attachResolvers = (
  schema: GraphQLSchema,
  resolvers: Record<string, Record<string, unknown>>
): GraphQLSchema => {
  for (const [typeName, fields] of Object.entries(resolvers)) {
    const type = schema.getType(typeName);
    if (!(type instanceof GraphQLObjectType)) continue;
    const typeFields = type.getFields();
    for (const [fieldName, value] of Object.entries(fields)) {
      const field = typeFields[fieldName];
      if (!field) continue;
      if (typeName === "Subscription" && value && typeof value === "object") {
        const sub = value as {
          subscribe?: (...a: unknown[]) => unknown;
          resolve?: (...a: unknown[]) => unknown;
        };
        if (typeof sub.subscribe === "function") {
          (field as { subscribe?: unknown }).subscribe = sub.subscribe;
        }
        // graphql-js defaults an absent `resolve` to echoing the payload,
        // which is what our subscription tests rely on.
        field.resolve = (sub.resolve ?? ((payload) => payload)) as typeof field.resolve;
        continue;
      }
      if (typeof value === "function") {
        field.resolve = value as typeof field.resolve;
      }
    }
  }
  return schema;
};

// Build an executable schema from a typograph typeDefs result.
const buildExecutableSchema = (
  sdl: string,
  resolvers: Record<string, Record<string, unknown>>
) => attachResolvers(buildSchema(sdl), resolvers);

// Run a typograph result against an executable schema. Accepts the typograph
// handler return shape directly so each test stays a single line.
const exec = async <R extends { toGraphQL: () => string; variables: any }>(
  schema: GraphQLSchema,
  res: R
) =>
  graphql({
    schema,
    source: res.toGraphQL(),
    variableValues: res.variables,
  });

// Subscribe a typograph result against an executable schema and drain every
// emitted payload into an array. graphql-js's `subscribe` returns either an
// AsyncIterableIterator<ExecutionResult> or a single ExecutionResult (when
// validation fails synchronously); we normalize both to an array of results.
const drainSubscription = async <
  R extends { toGraphQL: () => string; variables: any }
>(
  schema: GraphQLSchema,
  res: R
): Promise<ExecutionResult[]> => {
  const result = await subscribe({
    schema,
    document: parse(res.toGraphQL()),
    variableValues: res.variables,
  });

  // Sync error path: graphql-js returned a single result instead of an
  // iterable.
  if (!(Symbol.asyncIterator in result)) {
    return [result as ExecutionResult];
  }

  const out: ExecutionResult[] = [];
  for await (const value of result as AsyncIterable<ExecutionResult>) {
    out.push(value);
  }
  return out;
};

// ---------------------------------------------------------------------------
// Shared fixture schema
// ---------------------------------------------------------------------------
//
// A single small typograph schema that covers as many of the DEVELOPMENT.md
// examples as can coexist in one document. Examples that need a *different*
// signature for the same operation name (e.g. mutation #4 takes an input
// object) build their own small schema inline inside the relevant block.

const builder = createTypeDefBuilder();

// Forward declarations to break the circular Comment <-> Post reference. The
// actual back-reference field on Comment is added below using a thunk so the
// runtime can defer evaluation until both types exist.
type Comment = {
  id: string;
  body: string;
  post: Post;
};
type Post = {
  id: string;
  title: string;
  body: string;
  comments: Comment[];
};

const comment = builder.type({
  id: t.string(),
  body: t.string(),
  // Used by Example 6 — back-reference to the parent post.
  post: () => t.type<Post>("Post"),
});

const post = builder.type({
  id: t.string(),
  title: t.string(),
  body: t.string(),
  // Used by Q8 — `Post.comments` takes an optional `limit: Int` so a
  // call site can `args({ limit: "$limit" }, { … })` to slice the list
  // server-side. The arg is *optional* (`Int`, not `Int!`) so the
  // existing examples (4–7) that select `comments` without args
  // continue to work — graphql-js doesn't require optional args. The
  // resolver below applies the limit when present.
  comments: builder.field({
    input: { limit: t.int() },
    output: () => t.type<Comment[]>("[Comment]"),
  }),
});

// Result type for Mutation example 1 (`mutation Ping { ping { ok } }`).
const pingResult = builder.type({
  ok: t.boolean(),
});

// `Mutation: {}` is required to satisfy `BaseTypeDefs`. The SDL pipeline
// skips empty operation maps so this won't produce invalid SDL.
const fixtureTypeDefs = builder.combineTypeDefs([
  builder.typeDef({
    Comment: comment,
    Post: post,
    PingResult: pingResult,
    Query: {
      listPosts: builder.query({
        input: t.type({}),
        output: t.type<Post[]>("[Post]"),
      }),
      getPost: builder.query({
        // `notNull()` produces `String!`, matching the DEVELOPMENT.md
        // example signatures for `getPost($id: String!)`.
        input: t.type({ id: t.string().notNull() }),
        output: t.type<Post>("Post"),
      }),
      // Used by Example 3 — multiple variables.
      searchPosts: builder.query({
        input: t.type({
          query: t.string().notNull(),
          limit: t.int().notNull(),
        }),
        output: t.type<Post[]>("[Post]"),
      }),
      // Used by Example 4 — nested fields without variables. We need a
      // single-record query that takes no args; `getPost` requires `id`.
      getFeaturedPost: builder.query({
        input: t.type({}),
        output: t.type<Post>("Post"),
      }),
      // Used by Example 13 — list variable. Demonstrates that
      // `[String!]!` round-trips through the SDL pipeline and the runtime
      // forwards an array variable to graphql.execute unchanged.
      postsByIds: builder.query({
        input: t.type({ ids: t.type<string[]>("[String!]!") }),
        output: t.type<Post[]>("[Post]"),
      }),
      // Used by Example 11 — schema-side default value. The `order`
      // variable is declared with `t.string({ default: "newest" })`, which
      // makes the variable optional at the call site and emits
      // `$order: String = "newest"` in the operation header.
      feed: builder.query({
        input: t.type({ order: t.string({ default: "newest" }) }),
        output: t.type<Post[]>("[Post]"),
      }),
      // Used by Example 9 — multi-field query with `args(...)` rename. We
      // need a second query whose field arg name (`id`) collides with
      // `getPost`'s, so the test can prove that wrapping each call in
      // `args(...)` disambiguates them in the merged variables map and the
      // emitted operation header.
      getComment: builder.query({
        input: t.type({ id: t.string().notNull() }),
        output: t.type<Comment>("Comment"),
      }),
    },
    Mutation: {
      // Mutation Example 1 — simple no-variable mutation.
      ping: builder.mutation({
        input: t.type({}),
        output: t.type<{ ok: boolean }>("PingResult"),
      }),
      // Mutation Example 2 + 3 — variables, plain & nested response.
      createPost: builder.mutation({
        input: t.type({
          title: t.string().notNull(),
          body: t.string().notNull(),
        }),
        output: t.type<Post>("Post"),
      }),
      // Scalar-returning operation. Proves the client selection can be a
      // bare `true` (no sub-selection braces in the emitted GraphQL) and
      // that the projected `returnType` is the scalar itself.
      deletePost: builder.mutation({
        input: t.type({ id: t.string().notNull() }),
        output: t.type<string>("String!"),
      }),
    },
    Subscription: {
      // Subscription Example 1 — no-variable subscription. Yields a fixed
      // sequence of posts when iterated.
      postCreated: builder.subscription({
        input: t.type({}),
        output: t.type<Post>("Post"),
      }),
      // Subscription Example 2 + 3 — variable subscription with optional
      // nested back-reference.
      commentAdded: builder.subscription({
        input: t.type({ postId: t.string().notNull() }),
        output: t.type<Comment>("Comment"),
      }),
    },
  }),
]);

type FixtureTypeDefs = typeof fixtureTypeDefs;

const fixtureClient = createClient(fixtureTypeDefs);

const seedPosts: Array<{
  id: string;
  title: string;
  body: string;
}> = [
  { id: "p1", title: "First post", body: "Body of the first post" },
  { id: "p2", title: "Second post", body: "Body of the second post" },
];

const seedComments: Array<{ id: string; body: string; postId: string }> = [
  { id: "c1", body: "First comment", postId: "p1" },
  { id: "c2", body: "Second comment", postId: "p1" },
  { id: "c3", body: "Third comment", postId: "p2" },
];

const fixtureResolvers: Resolvers<FixtureTypeDefs> = {
  Query: {
    listPosts: () => seedPosts,
    getPost: (_source, { id }) => seedPosts.find((p) => p.id === id) ?? seedPosts[0],
    getFeaturedPost: () => seedPosts[0],
    searchPosts: (_source, { query, limit }) =>
      seedPosts
        .filter((p) => p.title.toLowerCase().includes(query.toLowerCase()))
        .slice(0, limit),
    postsByIds: (_source, { ids }) => seedPosts.filter((p) => ids.includes(p.id)),
    // Server-side, graphql-js substitutes the operation header default for
    // missing args, so `order` is always defined at runtime even though
    // the static type still reflects the optional shape. The `??` is
    // belt-and-braces — it lets the resolver compile against either
    // typings without leaning on a runtime guarantee.
    feed: (_source, { order }) =>
      (order ?? "newest") === "oldest"
        ? [...seedPosts].reverse()
        : seedPosts,
    // Used by Example 9 — single-record comment lookup. The seed shape
    // carries `postId`, and `Comment.post` (declared below) resolves the
    // back-reference. The cast to `unknown as Comment` is the same shape
    // gymnastics every other comment-returning resolver in this file uses.
    getComment: (_source, { id }) =>
      (seedComments.find((c) => c.id === id) ??
        seedComments[0]) as unknown as Comment,
  },
  Mutation: {
    ping: () => ({ ok: true }),
    createPost: (_source, { title, body }) => ({ id: "p3", title, body }),
    deletePost: (_source, { id }) => id,
  },
  Subscription: {
    // Yield each seeded post once. Real subscription resolvers wire into a
    // pubsub layer, but for testing we just emit a fixed sequence.
    postCreated: {
      subscribe: async function* () {
        for (const p of seedPosts) {
          yield p;
        }
      },
    },
    // Filter the fixed comment stream by `postId`. The resolver receives
    // the typograph-typed args and emits comments matching that post.
    commentAdded: {
      subscribe: async function* (_source, { postId }) {
        for (const c of seedComments) {
          if (c.postId === postId) yield c;
        }
      },
    },
  },
  Post: {
    // Q8: `Post.comments(limit: Int)` — slice the filtered comments by
    // the field arg when the caller supplied one. With the `FieldWithArgs`
    // brand emitted by `builder.field`, the resolver type now exposes
    // both the containing parent (`Post`) and the typed field args
    // (`Partial<{ limit: number }>` since GraphQL field args default to
    // nullable), so this resolver no longer needs an `any` cast to read
    // either of them. Note: at runtime the seed `parent` shape still has
    // `id` (the join key), which the typograph `Post` type also exposes —
    // so we can read it directly off `parent`.
    comments: (parent, args) => {
      const filtered = seedComments.filter((c) => c.postId === parent.id);
      return args.limit != null ? filtered.slice(0, args.limit) : filtered;
    },
  },
  Comment: {
    // Used by Example 6 — back-reference from comment → post. The typograph
    // `Comment` type doesn't expose the join key (`postId`), so we narrow
    // through a structural assertion to read it off the seed shape. The
    // double-`unknown` chain isn't needed any more now that `parent` has
    // the correct containing type (`Comment`) instead of the field's
    // own value type.
    post: (parent) =>
      seedPosts.find(
        (p) => p.id === (parent as Comment & { postId: string }).postId
      ) ?? seedPosts[0],
  },
};

const fixtureSchema = buildExecutableSchema(
  fixtureTypeDefs.toSDL(),
  fixtureResolvers as any
);

// ---------------------------------------------------------------------------
// Example 1 — Simple query (no variables, no nesting)
// ---------------------------------------------------------------------------

describe("Example 1: Simple query (no variables, no nesting)", () => {
  it("emits the documented GraphQL string", () => {
    const res = fixtureClient.query({
      listPosts: { id: true, title: true },
    });

    const normalized = res.toGraphQL().replace(/\s+/g, " ").trim();
    expect(normalized).toBe("query ListPosts { listPosts { id title } }");
  });

  it("executes against an in-process executable schema and returns typed data", async () => {
    const res = fixtureClient.query({
      listPosts: { id: true, title: true },
    });

    const result = await exec(fixtureSchema, res);

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      listPosts: [
        { id: "p1", title: "First post" },
        { id: "p2", title: "Second post" },
      ],
    });
  });

  it("infers a typed returnType the demo can rely on", () => {
    const res = fixtureClient.query({
      listPosts: { id: true, title: true },
    });

    // returnType is a phantom value but the *type* must be the projection.
    // We assert the shape by assigning a value of the expected type to it
    // and reading the result back — if the inference regresses this line
    // becomes a type error.
    const typed: { listPosts: { id: string; title: string }[] } =
      res.returnType;
    expect(typed).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Example 2 — Query with a single variable
// ---------------------------------------------------------------------------

describe("Example 2: Query with a single variable", () => {
  it("emits the documented GraphQL string", () => {
    const res = fixtureClient.query(
      {
        getPost: { id: true, title: true },
      },
      { variables: { id: "p1" } }
    );

    const normalized = res.toGraphQL().replace(/\s+/g, " ").trim();
    expect(normalized).toBe(
      "query GetPost($id: String!) { getPost(id: $id) { id title } }"
    );
  });

  it("forwards the variable to the resolver and returns the right post", async () => {
    const res = fixtureClient.query(
      {
        getPost: { id: true, title: true },
      },
      { variables: { id: "p2" } }
    );

    const result = await exec(fixtureSchema, res);

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      getPost: { id: "p2", title: "Second post" },
    });
  });

  it("infers a typed returnType the demo can rely on", () => {
    const res = fixtureClient.query(
      {
        getPost: { id: true, title: true },
      },
      { variables: { id: "p1" } }
    );

    const typed: { getPost: { id: string; title: string } } = res.returnType;
    // The variables object must be typed as `{ id: string }`, not `{}`.
    const vars: { id: string } = res.variables;
    expect(typed).toBeDefined();
    expect(vars.id).toBe("p1");
  });
});

// ---------------------------------------------------------------------------
// Example 3 — Query with multiple variables
// ---------------------------------------------------------------------------

describe("Example 3: Query with multiple variables", () => {
  it("declares both variables in the operation header", () => {
    const res = fixtureClient.query(
      {
        searchPosts: { id: true, title: true },
      },
      { variables: { query: "first", limit: 10 } }
    );

    const normalized = res.toGraphQL().replace(/\s+/g, " ").trim();
    expect(normalized).toBe(
      "query SearchPosts($query: String!, $limit: Int!) { searchPosts(query: $query, limit: $limit) { id title } }"
    );
  });

  it("forwards both variables to the resolver and respects the limit", async () => {
    const res = fixtureClient.query(
      {
        searchPosts: { id: true, title: true },
      },
      { variables: { query: "post", limit: 1 } }
    );

    const result = await exec(fixtureSchema, res);

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      searchPosts: [{ id: "p1", title: "First post" }],
    });
  });

  it("infers a typed variables shape with both fields", () => {
    const res = fixtureClient.query(
      {
        searchPosts: { id: true, title: true },
      },
      { variables: { query: "x", limit: 5 } }
    );

    const typed: { searchPosts: { id: string; title: string }[] } =
      res.returnType;
    const vars: { query: string; limit: number } = res.variables;
    expect(typed).toBeDefined();
    expect(vars).toEqual({ query: "x", limit: 5 });
  });
});

// ---------------------------------------------------------------------------
// Example 4 — Query with nested fields (no variables)
// ---------------------------------------------------------------------------

describe("Example 4: Query with nested fields", () => {
  it("emits a nested selection without variables", () => {
    const res = fixtureClient.query({
      getFeaturedPost: {
        id: true,
        title: true,
        comments: { id: true, body: true },
      },
    });

    const normalized = res.toGraphQL().replace(/\s+/g, " ").trim();
    expect(normalized).toBe(
      "query GetFeaturedPost { getFeaturedPost { id title comments { id body } } }"
    );
  });

  it("executes the nested selection and resolves comments via Post.comments", async () => {
    const res = fixtureClient.query({
      getFeaturedPost: {
        id: true,
        title: true,
        comments: { id: true, body: true },
      },
    });

    const result = await exec(fixtureSchema, res);

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      getFeaturedPost: {
        id: "p1",
        title: "First post",
        comments: [
          { id: "c1", body: "First comment" },
          { id: "c2", body: "Second comment" },
        ],
      },
    });
  });

  it("infers the nested return type", () => {
    const res = fixtureClient.query({
      getFeaturedPost: {
        id: true,
        title: true,
        comments: { id: true, body: true },
      },
    });

    const typed: {
      getFeaturedPost: {
        id: string;
        title: string;
        comments: { id: string; body: string }[];
      };
    } = res.returnType;
    expect(typed).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Example 5 — Query with variables AND nested fields
// ---------------------------------------------------------------------------

describe("Example 5: Query with variables and nested fields", () => {
  it("emits the documented GraphQL string", () => {
    const res = fixtureClient.query(
      {
        getPost: {
          id: true,
          title: true,
          comments: { id: true, body: true },
        },
      },
      { variables: { id: "p1" } }
    );

    const normalized = res.toGraphQL().replace(/\s+/g, " ").trim();
    expect(normalized).toBe(
      "query GetPost($id: String!) { getPost(id: $id) { id title comments { id body } } }"
    );
  });

  it("executes and returns the post plus its comments", async () => {
    const res = fixtureClient.query(
      {
        getPost: {
          id: true,
          title: true,
          comments: { id: true, body: true },
        },
      },
      { variables: { id: "p2" } }
    );

    const result = await exec(fixtureSchema, res);

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      getPost: {
        id: "p2",
        title: "Second post",
        comments: [{ id: "c3", body: "Third comment" }],
      },
    });
  });

  it("infers a typed returnType combining variables and nested fields", () => {
    const res = fixtureClient.query(
      {
        getPost: {
          id: true,
          title: true,
          comments: { id: true, body: true },
        },
      },
      { variables: { id: "p1" } }
    );

    const typed: {
      getPost: {
        id: string;
        title: string;
        comments: { id: string; body: string }[];
      };
    } = res.returnType;
    const vars: { id: string } = res.variables;
    expect(typed).toBeDefined();
    expect(vars.id).toBe("p1");
  });
});

// ---------------------------------------------------------------------------
// Example 6 — Query with deeply nested fields (back-reference)
// ---------------------------------------------------------------------------

describe("Example 6: Query with deeply nested fields", () => {
  it("emits a three-level nested selection", () => {
    const res = fixtureClient.query(
      {
        getPost: {
          id: true,
          comments: {
            id: true,
            body: true,
            post: { id: true, title: true },
          },
        },
      },
      { variables: { id: "p1" } }
    );

    const normalized = res.toGraphQL().replace(/\s+/g, " ").trim();
    expect(normalized).toBe(
      "query GetPost($id: String!) { getPost(id: $id) { id comments { id body post { id title } } } }"
    );
  });

  it("walks Post → comments → post and resolves the back-reference", async () => {
    const res = fixtureClient.query(
      {
        getPost: {
          id: true,
          comments: {
            id: true,
            body: true,
            post: { id: true, title: true },
          },
        },
      },
      { variables: { id: "p1" } }
    );

    const result = await exec(fixtureSchema, res);

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      getPost: {
        id: "p1",
        comments: [
          {
            id: "c1",
            body: "First comment",
            post: { id: "p1", title: "First post" },
          },
          {
            id: "c2",
            body: "Second comment",
            post: { id: "p1", title: "First post" },
          },
        ],
      },
    });
  });

  it("infers the deeply nested return type", () => {
    const res = fixtureClient.query(
      {
        getPost: {
          id: true,
          comments: {
            id: true,
            body: true,
            post: { id: true, title: true },
          },
        },
      },
      { variables: { id: "p1" } }
    );

    const typed: {
      getPost: {
        id: string;
        comments: {
          id: string;
          body: string;
          post: { id: string; title: string };
        }[];
      };
    } = res.returnType;
    expect(typed).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Example 7 — Query returning a list with nested fields
// ---------------------------------------------------------------------------

describe("Example 7: Query returning a list", () => {
  it("emits the documented GraphQL string", () => {
    const res = fixtureClient.query({
      listPosts: {
        id: true,
        title: true,
        comments: { id: true, body: true },
      },
    });

    const normalized = res.toGraphQL().replace(/\s+/g, " ").trim();
    expect(normalized).toBe(
      "query ListPosts { listPosts { id title comments { id body } } }"
    );
  });

  it("returns each post with its own comments array", async () => {
    const res = fixtureClient.query({
      listPosts: {
        id: true,
        title: true,
        comments: { id: true, body: true },
      },
    });

    const result = await exec(fixtureSchema, res);

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      listPosts: [
        {
          id: "p1",
          title: "First post",
          comments: [
            { id: "c1", body: "First comment" },
            { id: "c2", body: "Second comment" },
          ],
        },
        {
          id: "p2",
          title: "Second post",
          comments: [{ id: "c3", body: "Third comment" }],
        },
      ],
    });
  });

  it("infers the list-of-objects return type", () => {
    const res = fixtureClient.query({
      listPosts: {
        id: true,
        title: true,
        comments: { id: true, body: true },
      },
    });

    const typed: {
      listPosts: {
        id: string;
        title: string;
        comments: { id: string; body: string }[];
      }[];
    } = res.returnType;
    expect(typed).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Example 10 — Query with __typename
// ---------------------------------------------------------------------------
//
// Examples 8 and 9 require the imagined `args` helper and are deferred.
// Example 10 is the next one whose surface is implementable today.

describe("Example 10: Query with __typename", () => {
  it("emits __typename in the selection body", () => {
    const res = fixtureClient.query(
      {
        getPost: {
          __typename: true,
          id: true,
          title: true,
        },
      },
      { variables: { id: "p1" } }
    );

    const normalized = res.toGraphQL().replace(/\s+/g, " ").trim();
    expect(normalized).toBe(
      "query GetPost($id: String!) { getPost(id: $id) { __typename id title } }"
    );
  });

  it("graphql.execute resolves __typename to the GraphQL type name", async () => {
    const res = fixtureClient.query(
      {
        getPost: {
          __typename: true,
          id: true,
          title: true,
        },
      },
      { variables: { id: "p1" } }
    );

    const result = await exec(fixtureSchema, res);

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      getPost: { __typename: "Post", id: "p1", title: "First post" },
    });
  });

  it("infers __typename as a string field on the projected type", () => {
    const res = fixtureClient.query(
      {
        getPost: {
          __typename: true,
          id: true,
          title: true,
        },
      },
      { variables: { id: "p1" } }
    );

    const typed: {
      getPost: { __typename: string; id: string; title: string };
    } = res.returnType;
    expect(typed).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Example 13 — Query with a list variable
// ---------------------------------------------------------------------------

describe("Example 13: Query with a list variable", () => {
  it("emits a list-typed variable in the operation header", () => {
    const res = fixtureClient.query(
      {
        postsByIds: { id: true, title: true },
      },
      { variables: { ids: ["p1", "p2"] } }
    );

    const normalized = res.toGraphQL().replace(/\s+/g, " ").trim();
    expect(normalized).toBe(
      "query PostsByIds($ids: [String!]!) { postsByIds(ids: $ids) { id title } }"
    );
  });

  it("forwards the array variable to graphql.execute and returns the matching posts", async () => {
    const res = fixtureClient.query(
      {
        postsByIds: { id: true, title: true },
      },
      { variables: { ids: ["p1", "p2"] } }
    );

    const result = await exec(fixtureSchema, res);

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      postsByIds: [
        { id: "p1", title: "First post" },
        { id: "p2", title: "Second post" },
      ],
    });
  });

  it("infers the list variable as string[] in the variables shape", () => {
    const res = fixtureClient.query(
      {
        postsByIds: { id: true, title: true },
      },
      { variables: { ids: ["p1"] } }
    );

    const typed: { postsByIds: { id: string; title: string }[] } =
      res.returnType;
    const vars: { ids: string[] } = res.variables;
    expect(typed).toBeDefined();
    expect(vars.ids).toEqual(["p1"]);
  });
});

// ---------------------------------------------------------------------------
// Example 11 — Query with a default variable value
// ---------------------------------------------------------------------------

describe("Example 11: Query with a default variable value", () => {
  it("emits the default in the operation header even when no override is provided", () => {
    const res = fixtureClient.query({
      feed: { id: true, title: true },
    });

    const normalized = res.toGraphQL().replace(/\s+/g, " ").trim();
    expect(normalized).toBe(
      'query Feed($order: String = "newest") { feed(order: $order) { id title } }'
    );
  });

  it("uses the default when no variable is provided", async () => {
    const res = fixtureClient.query({
      feed: { id: true, title: true },
    });

    const result = await exec(fixtureSchema, res);

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      feed: [
        { id: "p1", title: "First post" },
        { id: "p2", title: "Second post" },
      ],
    });
  });

  it("overrides the default when an explicit value is supplied", async () => {
    const res = fixtureClient.query(
      {
        feed: { id: true, title: true },
      },
      { variables: { order: "oldest" } }
    );

    // The header still carries the default — graphql-js will substitute the
    // explicit `$order` variable and ignore the default.
    const normalized = res.toGraphQL().replace(/\s+/g, " ").trim();
    expect(normalized).toBe(
      'query Feed($order: String = "newest") { feed(order: $order) { id title } }'
    );

    const result = await exec(fixtureSchema, res);

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      feed: [
        { id: "p2", title: "Second post" },
        { id: "p1", title: "First post" },
      ],
    });
  });

  it("infers a typed variables shape with order as optional", () => {
    const res = fixtureClient.query(
      {
        feed: { id: true, title: true },
      },
      { variables: { order: "oldest" } }
    );

    const typed: { feed: { id: string; title: string }[] } = res.returnType;
    // `order` must be optional in the variables shape — the whole point of
    // the default. Assigning to `{ order?: string }` would fail if
    // MergedVariables regressed and made it required.
    const vars: { order?: string } = res.variables;
    expect(typed).toBeDefined();
    expect(vars.order).toBe("oldest");
  });
});

// ---------------------------------------------------------------------------
// Example 8 — Query with arguments on a nested field
// ---------------------------------------------------------------------------
//
// `Post.comments` declares an optional `limit: Int` field arg via
// `builder.field`. Wrapping the nested `comments` selection in
// `args({ limit: "$limit" }, ...)` binds the field arg to a top-level
// variable, the SDL pipeline emits `comments(limit: Int)` on `Post`, and
// the runtime walks the selection tree to declare `$limit` in the
// operation header and forward it to graphql.execute.
//
// Note: DEVELOPMENT.md uses `Int!` for the documented snippet, but the
// shared fixture deliberately uses optional `Int` so the existing examples
// 4–7 (which select `comments` without args) keep working. The
// implementation notes capture the deviation explicitly.

describe("Example 8: Query with arguments on a nested field", () => {
  it("emits the documented nested-args query string", () => {
    const res = fixtureClient.query(
      {
        getPost: {
          id: true,
          title: true,
          comments: args(
            { limit: "$limit" },
            { id: true, body: true }
          ),
        },
      },
      { variables: { id: "p1", limit: 10 } }
    );

    const normalized = res.toGraphQL().replace(/\s+/g, " ").trim();
    expect(normalized).toBe(
      "query GetPost($id: String!, $limit: Int) { getPost(id: $id) { id title comments(limit: $limit) { id body } } }"
    );
  });

  it("forwards the nested arg to the field resolver and slices the comments", async () => {
    const res = fixtureClient.query(
      {
        getPost: {
          id: true,
          title: true,
          comments: args(
            { limit: "$limit" },
            { id: true, body: true }
          ),
        },
      },
      { variables: { id: "p1", limit: 1 } }
    );

    const result = await exec(fixtureSchema, res);

    expect(result.errors).toBeUndefined();
    // Post p1 has two seed comments; the limit slices it down to one.
    expect(result.data).toEqual({
      getPost: {
        id: "p1",
        title: "First post",
        comments: [{ id: "c1", body: "First comment" }],
      },
    });
  });

  it("returns the unsliced list when the limit is omitted", async () => {
    // Sanity check that the field arg really is optional. Without
    // `limit` in the variables, the resolver receives `args.limit ===
    // undefined` and falls through to the unfiltered comment list. This
    // is what guarantees Examples 4–7 (which never pass `limit`) keep
    // working alongside Q8.
    const res = fixtureClient.query(
      {
        getPost: {
          id: true,
          title: true,
          comments: { id: true, body: true },
        },
      },
      { variables: { id: "p1" } }
    );

    const result = await exec(fixtureSchema, res);

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      getPost: {
        id: "p1",
        title: "First post",
        comments: [
          { id: "c1", body: "First comment" },
          { id: "c2", body: "Second comment" },
        ],
      },
    });
  });

  it("infers a typed returnType through the nested args wrapper", () => {
    const res = fixtureClient.query(
      {
        getPost: {
          id: true,
          title: true,
          comments: args(
            { limit: "$limit" },
            { id: true, body: true }
          ),
        },
      },
      { variables: { id: "p1", limit: 5 } }
    );

    // The args wrapper around `comments` must not leak into the
    // projected return type — the consumer should still see
    // `comments: { id: string; body: string }[]`.
    const typed: {
      getPost: {
        id: string;
        title: string;
        comments: { id: string; body: string }[];
      };
    } = res.returnType;
    expect(typed).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Example 9 — Multi-field query with `args(...)` for disambiguation
// ---------------------------------------------------------------------------
//
// Two operations (`getPost` and `getComment`) both declare an `id` field
// arg. Wrapping each call in `args(...)` lets the caller bind them to
// disjoint header variables (`$postId` / `$commentId`) so the merged
// variables map carries both keys instead of collapsing them.

describe("Example 9: Multi-field query with args() for disambiguation", () => {
  it("emits the documented dashboard query string", () => {
    const res = fixtureClient.query(
      {
        getPost: args({ id: "$postId" }, { id: true, title: true }),
        getComment: args({ id: "$commentId" }, { id: true, body: true }),
      },
      { variables: { postId: "p1", commentId: "c1" } }
    );

    const normalized = res.toGraphQL().replace(/\s+/g, " ").trim();
    expect(normalized).toBe(
      "query GetPostAndGetComment($postId: String!, $commentId: String!) { getPost(id: $postId) { id title } getComment(id: $commentId) { id body } }"
    );
  });

  it("forwards each renamed variable to the right resolver", async () => {
    const res = fixtureClient.query(
      {
        getPost: args({ id: "$postId" }, { id: true, title: true }),
        getComment: args({ id: "$commentId" }, { id: true, body: true }),
      },
      { variables: { postId: "p2", commentId: "c2" } }
    );

    const result = await exec(fixtureSchema, res);

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      getPost: { id: "p2", title: "Second post" },
      getComment: { id: "c2", body: "Second comment" },
    });
  });

  it("infers a typed variables shape with both renamed keys", () => {
    const res = fixtureClient.query(
      {
        getPost: args({ id: "$postId" }, { id: true, title: true }),
        getComment: args({ id: "$commentId" }, { id: true, body: true }),
      },
      { variables: { postId: "p1", commentId: "c1" } }
    );

    // The variables type must be `{ postId: string; commentId: string }`
    // — not `{ id: string }`. If the rename regresses this becomes a
    // type error (and the runtime would crash because the resolver would
    // see `undefined` for both ids).
    const vars: { postId: string; commentId: string } = res.variables;
    expect(vars.postId).toBe("p1");
    expect(vars.commentId).toBe("c1");
  });

  it("infers a typed returnType with both projected operations", () => {
    const res = fixtureClient.query(
      {
        getPost: args({ id: "$postId" }, { id: true, title: true }),
        getComment: args({ id: "$commentId" }, { id: true, body: true }),
      },
      { variables: { postId: "p1", commentId: "c1" } }
    );

    // ExtractSelection must peel the args wrapper off so the projection
    // sees the inner selection. Without that, this assignment fails
    // because `returnType.getPost` would still carry `{ __args, selection }`.
    const typed: {
      getPost: { id: string; title: string };
      getComment: { id: string; body: string };
    } = res.returnType;
    expect(typed).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Example 12 / Mutation Example 4 — Input object types
// ---------------------------------------------------------------------------
//
// Both examples need an `input` GraphQL type, which the shared fixture
// doesn't declare (and which would conflict with the existing `searchPosts`
// and `createPost` signatures). They share a single inline fixture so the
// `builder.inputType` round-trip is exercised once, with two operations
// reading from it.

type PostFilterInput = { author: string; published: boolean };
type CreatePostInput = { title: string; body: string };
// Used by Mutation Example 5 — second input type so we have two mutations
// in one document, each carrying its own `input` field arg, that we can
// disambiguate via `args(...)`.
type CreateCommentInput = { name: string };

type AuthoredPost = {
  id: string;
  title: string;
  body: string;
  author: string;
  published: boolean;
};

// Result type for `createComment`. Kept tiny on purpose — Mutation 5
// only selects `id` from the result, so the rest of the shape doesn't
// matter for the example.
type AuthoredComment = { id: string; name: string };

const inputBuilder = createTypeDefBuilder();

const authoredPost = inputBuilder.type({
  id: t.string(),
  title: t.string(),
  body: t.string(),
  author: t.string(),
  published: t.boolean(),
});

const authoredComment = inputBuilder.type({
  id: t.string(),
  name: t.string(),
});

const postFilter = inputBuilder.inputType({
  author: t.string(),
  published: t.boolean(),
});

const createPostInput = inputBuilder.inputType({
  title: t.string(),
  body: t.string(),
});

const createCommentInput = inputBuilder.inputType({
  name: t.string(),
});

const inputTypeDefs = inputBuilder.combineTypeDefs([
  inputBuilder.typeDef({
    Post: authoredPost,
    Comment: authoredComment,
    PostFilter: postFilter,
    CreatePostInput: createPostInput,
    CreateCommentInput: createCommentInput,
    Query: {
      searchPosts: inputBuilder.query({
        input: t.type({
          filter: t.type<PostFilterInput>("PostFilter!"),
        }),
        output: t.type<AuthoredPost[]>("[Post]"),
      }),
    },
    Mutation: {
      createPost: inputBuilder.mutation({
        input: t.type({
          input: t.type<CreatePostInput>("CreatePostInput!"),
        }),
        output: t.type<AuthoredPost>("Post"),
      }),
      // Mutation Example 5 — second mutation taking an `input` field arg
      // so the test can prove `args(...)` disambiguates two operations
      // sharing the same arg name.
      createComment: inputBuilder.mutation({
        input: t.type({
          input: t.type<CreateCommentInput>("CreateCommentInput!"),
        }),
        output: t.type<AuthoredComment>("Comment"),
      }),
    },
  }),
]);

type InputTypeDefs = typeof inputTypeDefs;
const inputClient = createClient(inputTypeDefs);

const seedAuthored: AuthoredPost[] = [
  {
    id: "p1",
    title: "Ada's published post",
    body: "Body 1",
    author: "ada",
    published: true,
  },
  {
    id: "p2",
    title: "Ada's draft",
    body: "Body 2",
    author: "ada",
    published: false,
  },
  {
    id: "p3",
    title: "Bob's published post",
    body: "Body 3",
    author: "bob",
    published: true,
  },
];

const inputResolvers: Resolvers<InputTypeDefs> = {
  Query: {
    searchPosts: (_source, { filter }) =>
      seedAuthored.filter(
        (p) => p.author === filter.author && p.published === filter.published
      ),
  },
  Mutation: {
    createPost: (_source, { input }) => ({
      id: "p4",
      title: input.title,
      body: input.body,
      author: "ada",
      published: true,
    }),
    // Mutation Example 5 — paired with `createPost` in a single document.
    // Both mutations get distinct ids so the test can assert each result
    // independently.
    createComment: (_source, { input }) => ({
      id: "c1",
      name: input.name,
    }),
  },
};

const inputSchema = buildExecutableSchema(
  inputTypeDefs.toSDL(),
  inputResolvers as any
);

describe("Example 12: Query with an input object variable", () => {
  it("renders the input object type in the SDL", () => {
    const sdl = inputTypeDefs.toSDL();
    // The block should use the `input` keyword and contain both fields.
    // Whitespace between fields varies by graphql.print, so check the
    // pieces independently rather than asserting a fully normalized
    // string.
    expect(sdl).toContain("input PostFilter");
    expect(sdl).toContain("author: String");
    expect(sdl).toContain("published: Boolean");
  });

  it("declares the input object variable in the operation header", () => {
    const res = inputClient.query(
      {
        searchPosts: { id: true, title: true },
      },
      { variables: { filter: { author: "ada", published: true } } }
    );

    const normalized = res.toGraphQL().replace(/\s+/g, " ").trim();
    expect(normalized).toBe(
      "query SearchPosts($filter: PostFilter!) { searchPosts(filter: $filter) { id title } }"
    );
  });

  it("forwards the input object to graphql.execute", async () => {
    const res = inputClient.query(
      {
        searchPosts: { id: true, title: true },
      },
      { variables: { filter: { author: "ada", published: true } } }
    );

    const result = await exec(inputSchema, res);

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      searchPosts: [{ id: "p1", title: "Ada's published post" }],
    });
  });

  it("infers a typed variables shape with the input object", () => {
    const res = inputClient.query(
      {
        searchPosts: { id: true, title: true },
      },
      { variables: { filter: { author: "ada", published: true } } }
    );

    const typed: { searchPosts: { id: string; title: string }[] } =
      res.returnType;
    const vars: { filter: { author: string; published: boolean } } =
      res.variables;
    expect(typed).toBeDefined();
    expect(vars.filter.author).toBe("ada");
  });
});

// ---------------------------------------------------------------------------
// Mutation Example 1 — Simple mutation (no variables)
// ---------------------------------------------------------------------------

describe("Mutation Example 1: Simple mutation (no variables)", () => {
  it("emits the documented GraphQL string", () => {
    const res = fixtureClient.mutate({
      ping: { ok: true },
    });

    const normalized = res.toGraphQL().replace(/\s+/g, " ").trim();
    expect(normalized).toBe("mutation Ping { ping { ok } }");
  });

  it("executes the mutation and returns the resolver result", async () => {
    const res = fixtureClient.mutate({
      ping: { ok: true },
    });

    const result = await exec(fixtureSchema, res);

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({ ping: { ok: true } });
  });

  it("infers a typed returnType for the mutation", () => {
    const res = fixtureClient.mutate({
      ping: { ok: true },
    });

    const typed: { ping: { ok: boolean } } = res.returnType;
    expect(typed).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Mutation Example 2 — Mutation with variables
// ---------------------------------------------------------------------------

describe("Mutation Example 2: Mutation with variables", () => {
  it("declares variables in the mutation header", () => {
    const res = fixtureClient.mutate(
      {
        createPost: { id: true, title: true },
      },
      { variables: { title: "Hello", body: "World" } }
    );

    const normalized = res.toGraphQL().replace(/\s+/g, " ").trim();
    expect(normalized).toBe(
      "mutation CreatePost($title: String!, $body: String!) { createPost(title: $title, body: $body) { id title } }"
    );
  });

  it("forwards variables to the mutation resolver", async () => {
    const res = fixtureClient.mutate(
      {
        createPost: { id: true, title: true },
      },
      { variables: { title: "Hello", body: "World" } }
    );

    const result = await exec(fixtureSchema, res);

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      createPost: { id: "p3", title: "Hello" },
    });
  });

  it("infers a typed variables shape", () => {
    const res = fixtureClient.mutate(
      {
        createPost: { id: true, title: true },
      },
      { variables: { title: "Hello", body: "World" } }
    );

    const typed: { createPost: { id: string; title: string } } =
      res.returnType;
    const vars: { title: string; body: string } = res.variables;
    expect(typed).toBeDefined();
    expect(vars).toEqual({ title: "Hello", body: "World" });
  });
});

// ---------------------------------------------------------------------------
// Mutation Example 3 — Mutation with a nested response selection
// ---------------------------------------------------------------------------

describe("Mutation Example 3: Mutation with a nested response selection", () => {
  it("emits a nested selection on the mutation result", () => {
    const res = fixtureClient.mutate(
      {
        createPost: {
          id: true,
          title: true,
          comments: { id: true, body: true },
        },
      },
      { variables: { title: "Hello", body: "World" } }
    );

    const normalized = res.toGraphQL().replace(/\s+/g, " ").trim();
    expect(normalized).toBe(
      "mutation CreatePost($title: String!, $body: String!) { createPost(title: $title, body: $body) { id title comments { id body } } }"
    );
  });

  it("executes and returns the mutation result with an empty comments list", async () => {
    const res = fixtureClient.mutate(
      {
        createPost: {
          id: true,
          title: true,
          comments: { id: true, body: true },
        },
      },
      { variables: { title: "Hello", body: "World" } }
    );

    const result = await exec(fixtureSchema, res);

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      createPost: { id: "p3", title: "Hello", comments: [] },
    });
  });

  it("infers the nested mutation return type", () => {
    const res = fixtureClient.mutate(
      {
        createPost: {
          id: true,
          title: true,
          comments: { id: true, body: true },
        },
      },
      { variables: { title: "Hello", body: "World" } }
    );

    const typed: {
      createPost: {
        id: string;
        title: string;
        comments: { id: string; body: string }[];
      };
    } = res.returnType;
    expect(typed).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Mutation Example 4 — Mutation with an input object variable
// ---------------------------------------------------------------------------
//
// Reuses the input-types fixture defined above for Example 12 — see that
// block for the schema and resolvers.

describe("Mutation Example 4: Mutation with an input object variable", () => {
  it("renders the input object type alongside the mutation in the SDL", () => {
    const sdl = inputTypeDefs.toSDL();
    expect(sdl).toContain("input CreatePostInput");
    expect(sdl).toContain("title: String");
    expect(sdl).toContain("body: String");
    expect(sdl).toContain("createPost(input: CreatePostInput!)");
  });

  it("declares the input object variable in the mutation header", () => {
    const res = inputClient.mutate(
      {
        createPost: { id: true, title: true },
      },
      { variables: { input: { title: "Hello", body: "World" } } }
    );

    const normalized = res.toGraphQL().replace(/\s+/g, " ").trim();
    expect(normalized).toBe(
      "mutation CreatePost($input: CreatePostInput!) { createPost(input: $input) { id title } }"
    );
  });

  it("forwards the input object to the mutation resolver", async () => {
    const res = inputClient.mutate(
      {
        createPost: { id: true, title: true },
      },
      { variables: { input: { title: "Hello", body: "World" } } }
    );

    const result = await exec(inputSchema, res);

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      createPost: { id: "p4", title: "Hello" },
    });
  });

  it("infers a typed variables shape with the nested input object", () => {
    const res = inputClient.mutate(
      {
        createPost: { id: true, title: true },
      },
      { variables: { input: { title: "Hello", body: "World" } } }
    );

    const typed: { createPost: { id: string; title: string } } =
      res.returnType;
    const vars: { input: { title: string; body: string } } = res.variables;
    expect(typed).toBeDefined();
    expect(vars.input.title).toBe("Hello");
  });
});

// ---------------------------------------------------------------------------
// Mutation Example 5 — Multiple mutations with `args(...)` for disambiguation
// ---------------------------------------------------------------------------
//
// Two mutations (`createPost` and `createComment`) both declare an `input`
// field arg with their own input types. Wrapping each call in `args(...)`
// binds them to disjoint header variables (`$post` / `$comment`) so the
// merged variables map can carry both. Reuses the input-types fixture
// defined for Example 12 / Mutation 4 above.

describe("Mutation Example 5: Multiple mutations with args() for disambiguation", () => {
  it("emits the documented bootstrap mutation string", () => {
    const res = inputClient.mutate(
      {
        createPost: args({ input: "$post" }, { id: true }),
        createComment: args({ input: "$comment" }, { id: true }),
      },
      {
        variables: {
          post: { title: "Hello", body: "World" },
          comment: { name: "ada" },
        },
      }
    );

    const normalized = res.toGraphQL().replace(/\s+/g, " ").trim();
    expect(normalized).toBe(
      "mutation CreatePostAndCreateComment($post: CreatePostInput!, $comment: CreateCommentInput!) { createPost(input: $post) { id } createComment(input: $comment) { id } }"
    );
  });

  it("forwards each renamed input object to the right resolver", async () => {
    const res = inputClient.mutate(
      {
        createPost: args({ input: "$post" }, { id: true }),
        createComment: args({ input: "$comment" }, { id: true }),
      },
      {
        variables: {
          post: { title: "Hello", body: "World" },
          comment: { name: "ada" },
        },
      }
    );

    const result = await exec(inputSchema, res);

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      createPost: { id: "p4" },
      createComment: { id: "c1" },
    });
  });

  it("infers a typed variables shape with both renamed input objects", () => {
    const res = inputClient.mutate(
      {
        createPost: args({ input: "$post" }, { id: true }),
        createComment: args({ input: "$comment" }, { id: true }),
      },
      {
        variables: {
          post: { title: "Hello", body: "World" },
          comment: { name: "ada" },
        },
      }
    );

    // The variables type must carry both renamed keys with their full
    // input object shapes. If the rename collapses, this assignment
    // fails and the test catches the regression at typecheck time.
    const vars: {
      post: { title: string; body: string };
      comment: { name: string };
    } = res.variables;
    expect(vars.post.title).toBe("Hello");
    expect(vars.comment.name).toBe("ada");
  });

  it("infers a typed returnType for both mutations", () => {
    const res = inputClient.mutate(
      {
        createPost: args({ input: "$post" }, { id: true }),
        createComment: args({ input: "$comment" }, { id: true }),
      },
      {
        variables: {
          post: { title: "Hello", body: "World" },
          comment: { name: "ada" },
        },
      }
    );

    const typed: {
      createPost: { id: string };
      createComment: { id: string };
    } = res.returnType;
    expect(typed).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Subscription Example 1 — Simple subscription (no variables)
// ---------------------------------------------------------------------------

describe("Subscription Example 1: Simple subscription (no variables)", () => {
  it("emits a subscription operation with no header", () => {
    const res = fixtureClient.subscribe({
      postCreated: { id: true, title: true },
    });

    const normalized = res.toGraphQL().replace(/\s+/g, " ").trim();
    expect(normalized).toBe(
      "subscription PostCreated { postCreated { id title } }"
    );
  });

  it("graphql.subscribe iterates the source iterator and yields each post", async () => {
    const res = fixtureClient.subscribe({
      postCreated: { id: true, title: true },
    });

    const results = await drainSubscription(fixtureSchema, res);

    expect(results.map((r) => r.errors)).toEqual([undefined, undefined]);
    expect(results.map((r) => r.data)).toEqual([
      { postCreated: { id: "p1", title: "First post" } },
      { postCreated: { id: "p2", title: "Second post" } },
    ]);
  });

  it("infers a typed returnType for the subscription", () => {
    const res = fixtureClient.subscribe({
      postCreated: { id: true, title: true },
    });

    const typed: { postCreated: { id: string; title: string } } =
      res.returnType;
    expect(typed).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Subscription Example 2 — Subscription with variables
// ---------------------------------------------------------------------------

describe("Subscription Example 2: Subscription with variables", () => {
  it("declares the subscription variable in the header", () => {
    const res = fixtureClient.subscribe(
      {
        commentAdded: { id: true, body: true },
      },
      { variables: { postId: "p1" } }
    );

    const normalized = res.toGraphQL().replace(/\s+/g, " ").trim();
    expect(normalized).toBe(
      "subscription CommentAdded($postId: String!) { commentAdded(postId: $postId) { id body } }"
    );
  });

  it("filters the source iterator by the supplied variable", async () => {
    const res = fixtureClient.subscribe(
      {
        commentAdded: { id: true, body: true },
      },
      { variables: { postId: "p1" } }
    );

    const results = await drainSubscription(fixtureSchema, res);

    expect(results.map((r) => r.errors)).toEqual([undefined, undefined]);
    expect(results.map((r) => r.data)).toEqual([
      { commentAdded: { id: "c1", body: "First comment" } },
      { commentAdded: { id: "c2", body: "Second comment" } },
    ]);
  });

  it("infers a typed variables shape for the subscription", () => {
    const res = fixtureClient.subscribe(
      {
        commentAdded: { id: true, body: true },
      },
      { variables: { postId: "p1" } }
    );

    const typed: { commentAdded: { id: string; body: string } } =
      res.returnType;
    const vars: { postId: string } = res.variables;
    expect(typed).toBeDefined();
    expect(vars.postId).toBe("p1");
  });
});

// ---------------------------------------------------------------------------
// Subscription Example 3 — Subscription with nested fields (back-reference)
// ---------------------------------------------------------------------------

describe("Subscription Example 3: Subscription with nested fields", () => {
  it("emits a nested selection on the subscription payload", () => {
    const res = fixtureClient.subscribe(
      {
        commentAdded: {
          id: true,
          body: true,
          post: { id: true, title: true },
        },
      },
      { variables: { postId: "p1" } }
    );

    const normalized = res.toGraphQL().replace(/\s+/g, " ").trim();
    expect(normalized).toBe(
      "subscription CommentAdded($postId: String!) { commentAdded(postId: $postId) { id body post { id title } } }"
    );
  });

  it("walks the back-reference resolver on each yielded comment", async () => {
    const res = fixtureClient.subscribe(
      {
        commentAdded: {
          id: true,
          body: true,
          post: { id: true, title: true },
        },
      },
      { variables: { postId: "p1" } }
    );

    const results = await drainSubscription(fixtureSchema, res);

    expect(results.map((r) => r.errors)).toEqual([undefined, undefined]);
    expect(results.map((r) => r.data)).toEqual([
      {
        commentAdded: {
          id: "c1",
          body: "First comment",
          post: { id: "p1", title: "First post" },
        },
      },
      {
        commentAdded: {
          id: "c2",
          body: "Second comment",
          post: { id: "p1", title: "First post" },
        },
      },
    ]);
  });

  it("infers the nested subscription return type", () => {
    const res = fixtureClient.subscribe(
      {
        commentAdded: {
          id: true,
          body: true,
          post: { id: true, title: true },
        },
      },
      { variables: { postId: "p1" } }
    );

    const typed: {
      commentAdded: {
        id: string;
        body: string;
        post: { id: string; title: string };
      };
    } = res.returnType;
    expect(typed).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Scalar-returning operation
// ---------------------------------------------------------------------------

describe("Scalar-returning operation (String! output)", () => {
  it("emits a no-braces operation when the selection is `true`", () => {
    const res = fixtureClient.mutate(
      { deletePost: true },
      { variables: { id: "p1" } }
    );

    const normalized = res.toGraphQL().replace(/\s+/g, " ").trim();
    expect(normalized).toBe(
      "mutation DeletePost($id: String!) { deletePost(id: $id) }"
    );
  });

  it("executes the mutation and returns the raw scalar", async () => {
    const res = fixtureClient.mutate(
      { deletePost: true },
      { variables: { id: "p1" } }
    );

    const result = await exec(fixtureSchema, res);

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({ deletePost: "p1" });
  });

  it("infers `returnType` as the raw scalar (not a wrapper)", () => {
    const res = fixtureClient.mutate(
      { deletePost: true },
      { variables: { id: "p1" } }
    );

    const typed: { deletePost: string } = res.returnType;
    expect(typed).toBeDefined();
  });
});
