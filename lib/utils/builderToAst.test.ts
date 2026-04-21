import { describe, expect, it } from "vitest";
import { print } from "graphql";
import dedent from "dedent";
import builderToAst from "./builderToAst";

const toSDL = (input: Parameters<typeof builderToAst>[0]) =>
  print(builderToAst(input));

describe("builderToAst", () => {
  it("renders an object type with scalar fields", () => {
    expect(
      toSDL({
        User: { id: "String", name: "String" },
      })
    ).toEqual(dedent`
      type User {
        id: String
        name: String
      }
    `);
  });

  it("renders non-null fields with the trailing !", () => {
    expect(
      toSDL({
        User: { id: "String!", name: "String" },
      })
    ).toEqual(dedent`
      type User {
        id: String!
        name: String
      }
    `);
  });

  it("renders a Query type with input args", () => {
    expect(
      toSDL({
        Query: {
          getUser: {
            input: { id: "String" },
            output: "User",
          },
        },
      })
    ).toEqual(dedent`
      type Query {
        getUser(id: String): User
      }
    `);
  });

  it("renders a Query type with no input args", () => {
    expect(
      toSDL({
        Query: {
          listUsers: {
            input: {},
            output: "[User]",
          },
        },
      })
    ).toEqual(dedent`
      type Query {
        listUsers: [User]
      }
    `);
  });

  it("renders a Mutation type with multiple input args and a non-null return type", () => {
    expect(
      toSDL({
        Mutation: {
          createUser: {
            input: { name: "String!", age: "Int" },
            output: "User!",
          },
        },
      })
    ).toEqual(dedent`
      type Mutation {
        createUser(name: String!, age: Int): User!
      }
    `);
  });

  it("renders multiple types in declaration order", () => {
    expect(
      toSDL({
        User: { id: "String" },
        Post: { id: "String", title: "String" },
        Query: {
          getUser: { input: { id: "String" }, output: "User" },
        },
      })
    ).toEqual(dedent`
      type User {
        id: String
      }

      type Post {
        id: String
        title: String
      }

      type Query {
        getUser(id: String): User
      }
    `);
  });

  it("skips an empty Query or Mutation map", () => {
    // graphql-js rejects `type Mutation {}` ("must define one or more
    // fields"), so the SDL pipeline must drop empty operation maps even
    // though `BaseTypeDefs` still requires them at the type level.
    expect(
      toSDL({
        Query: {
          getUser: { input: { id: "String" }, output: "User" },
        },
        Mutation: {},
      })
    ).toEqual(dedent`
      type Query {
        getUser(id: String): User
      }
    `);
  });

  it("renders a Subscription type alongside Query and Mutation", () => {
    expect(
      toSDL({
        Query: {
          listPosts: { input: {}, output: "[Post]" },
        },
        Mutation: {
          createPost: { input: { title: "String!" }, output: "Post" },
        },
        Subscription: {
          postCreated: { input: {}, output: "Post" },
        },
      })
    ).toEqual(dedent`
      type Query {
        listPosts: [Post]
      }

      type Mutation {
        createPost(title: String!): Post
      }

      type Subscription {
        postCreated: Post
      }
    `);
  });

  it("skips an empty Subscription map", () => {
    expect(
      toSDL({
        Query: {
          listPosts: { input: {}, output: "[Post]" },
        },
        Subscription: {},
      })
    ).toEqual(dedent`
      type Query {
        listPosts: [Post]
      }
    `);
  });

  it("renders an input object type with the `input` keyword", () => {
    // Tagged via the `__kind: "input"` marker that `builder.inputType(...)`
    // attaches to its wrapper. The SDL should use `input Foo { ... }`
    // instead of `type Foo { ... }`, and field types should round-trip
    // through the same `mapType` helper as object type fields.
    expect(
      toSDL({
        PostFilter: {
          __kind: "input",
          fields: { author: "String", published: "Boolean" },
        } as any,
      })
    ).toEqual(dedent`
      input PostFilter {
        author: String
        published: Boolean
      }
    `);
  });

  it("preserves nested non-null markers inside list types", () => {
    // Regression: `mapType` previously stripped the first `!` from a type
    // string with `replace("!", "")`. For `[String!]!` that produced the
    // bogus `[String]!!`. The correct behavior is to strip *only* the
    // trailing `!`, so the inner non-null on the list item is preserved.
    expect(
      toSDL({
        Query: {
          postsByIds: {
            input: { ids: "[String!]!" },
            output: "[Post]",
          },
        },
      })
    ).toEqual(dedent`
      type Query {
        postsByIds(ids: [String!]!): [Post]
      }
    `);
  });

  it("skips falsy top-level entries", () => {
    expect(
      toSDL({
        User: { id: "String" },
        Empty: undefined,
      })
    ).toEqual(dedent`
      type User {
        id: String
      }
    `);
  });

  it("throws a helpful error on a malformed type string", () => {
    // Typograph stores type strings verbatim, so a typo in
    // `t.type<Post>("[Post")` (unclosed bracket) would otherwise slip
    // through as a `NamedType` and only fail when the server boots.
    // Validating at `builderToAst` time surfaces the error with the
    // offending string embedded in the message.
    expect(() =>
      toSDL({
        User: { id: "[String" },
      })
    ).toThrow(/invalid GraphQL type string: "\[String"/);

    expect(() =>
      toSDL({
        Query: {
          getUser: { input: {}, output: "Post User" },
        },
      })
    ).toThrow(/invalid GraphQL type string/);
  });
});
