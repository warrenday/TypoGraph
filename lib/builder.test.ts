import { describe, expect, it } from "vitest";
import { createTypeDefBuilder, t } from "./builder";
import dedent from "dedent";

describe("createTypeDefBuilder", () => {
  it("converts the builder to SDL", () => {
    const builder = createTypeDefBuilder();

    // Users
    const user = builder.type({
      id: t.string().notNull(),
      name: t.string(),
      articles: () => t.type<Post[]>("[Post]"),
    });
    type User = typeof user;
    const userTypeDefs = builder.typeDef({
      User: user,
      Query: {
        getUser: builder.query({
          input: t.type({ id: t.string() }),
          output: t.type<User>("User"),
        }),
      },
      Mutation: {
        createUser: builder.mutation({
          input: t.type({ name: t.string() }),
          output: t.type<User>("User"),
        }),
      },
    });

    // Posts
    const post = builder.type({
      id: t.string().notNull(),
      title: t.string(),
      author: () => t.type<User>("User"),
    });
    type Post = typeof post;
    const postTypeDefs = builder.typeDef({
      Post: post,
      Mutation: {
        updatePost: builder.mutation({
          input: t.type({ id: t.string() }),
          output: t.type<Post>("Post"),
        }),
      },
    });

    const typeDefs = builder.combineTypeDefs([userTypeDefs, postTypeDefs]);

    expect(typeDefs.toSDL()).toEqual(dedent`
      type User {
        id: String!
        name: String
        articles: [Post]
      }

      type Query {
        getUser(id: String): User
      }

      type Mutation {
        createUser(name: String): User
        updatePost(id: String): Post
      }

      type Post {
        id: String!
        title: String
        author: User
      }
    `);
  });

  it("renders a schema with only a Query (no Mutation)", () => {
    const builder = createTypeDefBuilder();
    const post = builder.type({ id: t.string() });
    type Post = typeof post;

    const typeDefs = builder.combineTypeDefs([
      builder.typeDef({
        Post: post,
        Query: {
          getPost: builder.query({
            input: t.type({ id: t.string() }),
            output: t.type<Post>("Post"),
          }),
        },
      }),
    ]);

    expect(typeDefs.toSDL()).toEqual(dedent`
      type Post {
        id: String
      }

      type Query {
        getPost(id: String): Post
      }
    `);
  });

  it("renders a schema with only a Mutation (no Query)", () => {
    const builder = createTypeDefBuilder();
    const post = builder.type({ id: t.string() });
    type Post = typeof post;

    const typeDefs = builder.combineTypeDefs([
      builder.typeDef({
        Post: post,
        Mutation: {
          createPost: builder.mutation({
            input: t.type({ title: t.string() }),
            output: t.type<Post>("Post"),
          }),
        },
      }),
    ]);

    expect(typeDefs.toSDL()).toEqual(dedent`
      type Post {
        id: String
      }

      type Mutation {
        createPost(title: String): Post
      }
    `);
  });

  it("supports all built-in scalar constructors", () => {
    const builder = createTypeDefBuilder();
    const thing = builder.type({
      id: t.id(),
      name: t.string(),
      count: t.int(),
      active: t.boolean(),
    });
    type Thing = typeof thing;

    const typeDefs = builder.combineTypeDefs([
      builder.typeDef({
        Thing: thing,
        Query: {
          getThing: builder.query({
            input: t.type({}),
            output: t.type<Thing>("Thing"),
          }),
        },
      }),
    ]);

    expect(typeDefs.toSDL()).toEqual(dedent`
      type Thing {
        id: ID
        name: String
        count: Int
        active: Boolean
      }

      type Query {
        getThing: Thing
      }
    `);
  });

  it("applies .notNull() to every scalar kind", () => {
    const builder = createTypeDefBuilder();
    const thing = builder.type({
      id: t.id().notNull(),
      name: t.string().notNull(),
      count: t.int().notNull(),
      active: t.boolean().notNull(),
    });
    type Thing = typeof thing;

    const typeDefs = builder.combineTypeDefs([
      builder.typeDef({
        Thing: thing,
        Query: {},
      }),
    ]);

    expect(typeDefs.toSDL()).toContain("id: ID!");
    expect(typeDefs.toSDL()).toContain("name: String!");
    expect(typeDefs.toSDL()).toContain("count: Int!");
    expect(typeDefs.toSDL()).toContain("active: Boolean!");
  });

  it("works when combining a single typeDef", () => {
    const builder = createTypeDefBuilder();
    const post = builder.type({ id: t.string() });
    type Post = typeof post;

    const typeDefs = builder.combineTypeDefs([
      builder.typeDef({
        Post: post,
        Query: {
          listPosts: builder.query({
            input: t.type({}),
            output: t.type<Post[]>("[Post]"),
          }),
        },
      }),
    ]);

    expect(typeDefs.toSDL()).toEqual(dedent`
      type Post {
        id: String
      }

      type Query {
        listPosts: [Post]
      }
    `);
  });

  it("merges Query types from multiple typeDefs", () => {
    const builder = createTypeDefBuilder();
    const user = builder.type({ id: t.string() });
    const post = builder.type({ id: t.string() });
    type User = typeof user;
    type Post = typeof post;

    const userTypeDefs = builder.typeDef({
      User: user,
      Query: {
        getUser: builder.query({
          input: t.type({ id: t.string() }),
          output: t.type<User>("User"),
        }),
      },
    });

    const postTypeDefs = builder.typeDef({
      Post: post,
      Query: {
        getPost: builder.query({
          input: t.type({ id: t.string() }),
          output: t.type<Post>("Post"),
        }),
      },
    });

    const typeDefs = builder.combineTypeDefs([userTypeDefs, postTypeDefs]);
    const sdl = typeDefs.toSDL();

    expect(sdl).toContain("getUser(id: String): User");
    expect(sdl).toContain("getPost(id: String): Post");
  });

  it("resolves lazy/circular references via thunks", () => {
    const builder = createTypeDefBuilder();

    const post = builder.type({
      id: t.string(),
      comments: () => t.type<Comment[]>("[Comment]"),
    });
    type Post = typeof post;

    const comment = builder.type({
      id: t.string(),
      post: () => t.type<Post>("Post"),
    });
    type Comment = typeof comment;

    const typeDefs = builder.combineTypeDefs([
      builder.typeDef({ Post: post, Query: {} }),
      builder.typeDef({ Comment: comment }),
    ]);

    expect(typeDefs.toSDL()).toContain("comments: [Comment]");
    expect(typeDefs.toSDL()).toContain("post: Post");
  });

  it("eagerly evaluates `.types` to a plain object at runtime", () => {
    // Regression: previously `.types` was the raw input array. After the
    // eager-evaluate refactor it should be the merged + evaluated object.
    const builder = createTypeDefBuilder();
    const user = builder.type({ id: t.string().notNull() });
    type User = typeof user;

    const typeDefs = builder.combineTypeDefs([
      builder.typeDef({
        User: user,
        Query: {
          getUser: builder.query({
            input: t.type({ id: t.string() }),
            output: t.type<User>("User"),
          }),
        },
      }),
    ]);

    expect(typeDefs.types).toEqual({
      User: { id: "String!" },
      Query: {
        getUser: {
          input: { id: "String" },
          output: "User",
        },
      },
    });
  });
});
