import { t } from "../../../lib/builder";
import { builder } from "../builder";
import type { Post } from "./article";

// User Types

const user = builder.type({
  id: t.string(),
  name: t.string(),
  articles: () => t.type<Post[]>("[Post]"),
});

export const userTypeDefs = builder.typeDef({
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

export type User = typeof user;
