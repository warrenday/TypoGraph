import { t } from "../../../src/builder";
import { builder } from "../builder";
import type { User } from "./user";

// Post Types
const post = builder.type({
  id: t.string(),
  title: t.string(),
  author: () => t.type<User>("User"),
});

export const postTypeDefs = builder.typeDef({
  Post: post,
  Mutation: {
    updatePost: builder.mutation({
      input: t.type({ id: t.string() }),
      output: t.type<Post>("Post"),
    }),
  },
});

export type Post = typeof post;
