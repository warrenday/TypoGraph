import { describe, expectTypeOf, it } from "vitest";
import { createTypeDefBuilder, t } from "./builder";

describe("builder", () => {
  it("generates the correct types", () => {
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

    expectTypeOf(typeDefs.types).toEqualTypeOf<{
      User: {
        id: string;
      };
      Post: {
        id: string;
        title: string;
        author: {
          id: string;
        };
      };
      Query: {
        getUser: {
          input: { id: string };
          output: { id: string };
        };
      };
      Mutation: {
        createPost: {
          input: { title: string };
          output: { id: string; title: string; author: { id: string } };
        };
      };
    }>();
  });
});
