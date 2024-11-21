import { describe, expect, it } from "vitest";
import { createTypeDefBuilder, t } from "./builder";
import dedent from "dedent";

describe("createTypeDefBuilder", () => {
  it("converts the builder to SDL", () => {
    const builder = createTypeDefBuilder();

    // Users
    const user = builder.type({
      id: t.string(),
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
      id: t.string(),
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
        name: String!
        articles: [Post]
      }

      type Query {
        getUser(id: String!): User
      }

      type Mutation {
        createUser(name: String!): User
        updatePost(id: String!): Post
      }

      type Post {
        id: String!
        title: String!
        author: User
      }
    `);
  });
});
