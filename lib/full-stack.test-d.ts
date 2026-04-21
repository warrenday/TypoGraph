import { describe, expect, expectTypeOf, it } from "vitest";
import { createTypeDefBuilder, t } from "./builder";
import { createClient } from "./main";

describe("Full stack types", () => {
  it("Generates the correct client from server types", () => {
    // Create the server types
    const builder = createTypeDefBuilder();

    const user = builder.type({
      id: t.string().notNull(),
    });

    const post = builder.type({
      id: t.string().notNull(),
      title: t.string().notNull(),
      author: () => user,
    });

    const userTypeDefs = builder.typeDef({
      User: user,
      Query: {
        getUser: builder.query({
          input: t.type({ id: t.string().notNull() }),
          output: t.type<typeof user>("User"),
        }),
      },
    });

    const postTypeDefs = builder.typeDef({
      Post: post,
      Mutation: {
        createPost: builder.mutation({
          input: t.type({ title: t.string().notNull() }),
          output: t.type<typeof post>("Post"),
        }),
      },
    });

    const typeDefs = builder.combineTypeDefs([userTypeDefs, postTypeDefs]);

    // Create the client
    const client = createClient(typeDefs);

    // Test query with correct parameters
    const getUserRes = client.query(
      {
        getUser: { id: true },
      },
      {
        variables: {
          id: "123",
        },
      }
    );

    // Test the return type for getUser query
    expectTypeOf(getUserRes.returnType).toEqualTypeOf<{
      getUser: {
        id: string;
      };
    }>();

    // Test the variable types for getUser query
    expectTypeOf(getUserRes.variables).toEqualTypeOf<{
      id: string;
    }>();

    // Test mutation with correct parameters
    const createPostRes = client.mutate(
      {
        createPost: {
          id: true,
          title: true,
          author: {
            id: true,
          },
        },
      },
      {
        variables: {
          title: "My Post",
        },
      }
    );

    // Test the return type for createPost mutation
    expectTypeOf(createPostRes.returnType).toEqualTypeOf<{
      createPost: {
        id: string;
        title: string;
        author: {
          id: string;
        };
      };
    }>();

    // Test the variable types for createPost mutation
    expectTypeOf(createPostRes.variables).toEqualTypeOf<{
      title: string;
    }>();

    // Test that TypeScript enforces correct variable types
    client.query(
      { getUser: { id: true } },
      // @ts-expect-error - id should be string, not number
      { variables: { id: 123 } }
    );

    // Non-null inputs are required — `createPost` declared `title:
    // t.string().notNull()`, so omitting it is still a type error.
    // @ts-expect-error - title is required for createPost
    client.mutate({ createPost: { id: true } }, { variables: {} });

    client.query(
      {
        // @ts-expect-error - "invalidQuery" is not a valid query name
        invalidQuery: {},
      },
      { variables: {} as never }
    );

    client.mutate(
      {
        // @ts-expect-error - "invalidMutation" is not a valid mutation name
        invalidMutation: {},
      },
      { variables: {} as never }
    );
  });

  it("treats nullable scalar inputs as optional in the variables shape", () => {
    // Regression: when an input field is declared without `.notNull()`,
    // the corresponding variables key should be optional — callers can
    // omit it entirely rather than having to pass `undefined`.
    const builder = createTypeDefBuilder();

    const post = builder.type({
      id: t.string().notNull(),
      title: t.string().notNull(),
      description: t.string(),
    });
    type Post = typeof post;

    const typeDefs = builder.combineTypeDefs([
      builder.typeDef({
        Post: post,
        Query: {},
        Mutation: {
          updatePost: builder.mutation({
            input: t.type({
              id: t.string().notNull(),
              title: t.string(),
              description: t.string(),
            }),
            output: t.type<Post>("Post!"),
          }),
        },
      }),
    ]);

    const client = createClient(typeDefs);

    // Passing only the required field should type-check.
    const res = client.mutate(
      { updatePost: { id: true, title: true, description: true } },
      { variables: { id: "p1" } },
    );

    // The variables shape has `id` required and `title`/`description`
    // optional. Assignability to `{ id; title?; description? }` proves
    // the nullable keys aren't required; passing an all-required shape
    // (below) would fail to compile if the regression came back.
    const vars: { id: string; title?: string; description?: string } =
      res.variables;
    expect(vars.id).toBe("p1");

    // Projected return type carries nullable fields as `string |
    // undefined`, matching GraphQL's schema-declared nullability.
    const typed: {
      updatePost: {
        id: string;
        title: string;
        description: string | undefined;
      };
    } = res.returnType;
    expect(typed).toBeDefined();
  });

  it("mirrors the demo flow: list query returning Post[] with nested Comment[]", () => {
    // End-to-end coverage that mirrors how the demo wires things up. This is
    // the missing test that would have caught the original list-of-objects
    // type bug if it had existed earlier.
    const builder = createTypeDefBuilder();

    const comment = builder.type({
      id: t.string().notNull(),
      body: t.string().notNull(),
    });
    type Comment = typeof comment;

    const post = builder.type({
      id: t.string().notNull(),
      title: t.string().notNull(),
      body: t.string().notNull(),
      comments: () => t.type<Comment[]>("[Comment]"),
    });
    type Post = typeof post;

    const postTypeDefs = builder.typeDef({
      Post: post,
      Query: {
        listPosts: builder.query({
          input: t.type({}),
          output: t.type<Post[]>("[Post]"),
        }),
      },
      Mutation: {},
    });

    const commentTypeDefs = builder.typeDef({
      Comment: comment,
    });

    const typeDefs = builder.combineTypeDefs([commentTypeDefs, postTypeDefs]);
    const client = createClient(typeDefs);

    const res = client.query(
      {
        listPosts: {
          id: true,
          title: true,
          body: true,
          comments: { id: true, body: true },
        },
      },
      { variables: {} }
    );

    expectTypeOf(res.returnType).toEqualTypeOf<{
      listPosts: {
        id: string;
        title: string;
        body: string;
        comments: { id: string; body: string }[];
      }[];
    }>();

    // Sanity-check the runtime SDL too — the demo's GraphQL Yoga server
    // consumes this string, so a regression here would silently break the demo.
    expect(typeof typeDefs.toSDL()).toBe("string");
    expect(typeDefs.toSDL()).toContain("listPosts: [Post]");
    expect(typeDefs.toSDL()).toContain("comments: [Comment]");
  });
});
