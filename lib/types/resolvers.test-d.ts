import { describe, it, expectTypeOf } from "vitest";
import type { FieldWithArgs } from "./common";
import type { Resolvers } from "./resolvers";

describe("Resolvers", () => {
  type Comment = { id: string; body: string };
  type Post = {
    id: string;
    title: string;
    body: string;
    comments: Comment[];
  };

  type TypeDefs = {
    types: {
      Query: {
        listPosts: { input: {}; output: Post[] };
        getPost: { input: { id: string }; output: Post };
      };
      Mutation: {
        createPost: {
          input: { title: string; body: string };
          output: Post;
        };
      };
      Post: Post;
      Comment: Comment;
    };
  };

  it("types Query and Mutation args correctly", () => {
    const resolvers: Resolvers<TypeDefs> = {
      Query: {
        listPosts: () => [],
        getPost: (_source, args) => {
          expectTypeOf(args).toEqualTypeOf<{ id: string }>();
          return { id: args.id, title: "", body: "" };
        },
      },
      Mutation: {
        createPost: (_source, args) => {
          expectTypeOf(args).toEqualTypeOf<{ title: string; body: string }>();
          return { id: "1", title: args.title, body: args.body };
        },
      },
    };
    expectTypeOf(resolvers).toMatchTypeOf<Resolvers<TypeDefs>>();
  });

  it("passes the containing parent type to every field resolver", () => {
    // Field resolvers always receive the *containing* parent type as their
    // first argument, matching graphql-js's actual `(parent, args, ctx,
    // info)` calling convention. Both array fields (`Post.comments`) and
    // primitive fields (`Post.title`) get a `Post` parent, not the field's
    // own value type.
    const resolvers: Resolvers<TypeDefs> = {
      Post: {
        comments: (parent) => {
          expectTypeOf(parent).toEqualTypeOf<Post>();
          return [];
        },
        title: (parent) => {
          expectTypeOf(parent).toEqualTypeOf<Post>();
          return parent.title;
        },
      },
    };
    expectTypeOf(resolvers).toMatchTypeOf<Resolvers<TypeDefs>>();
  });

  it("types nested field resolvers with both parent and args via FieldWithArgs", () => {
    // When a field is declared via `builder.field({ input, output })` it
    // carries a `FieldWithArgs<I, O>` brand. The resolver type then becomes
    // `(parent: ContainingType, args: Partial<I>) => DeepPartial<O>` instead
    // of falling back to the parent-only signature. This is what fixes the
    // long-standing gap that forced demos to cast `Post.comments` to `any`.
    type BrandedPost = {
      id: string;
      title: string;
      body: string;
      comments: FieldWithArgs<{ limit: number }, Comment[]>;
    };

    type BrandedTypeDefs = {
      types: {
        Query: { listPosts: { input: {}; output: BrandedPost[] } };
        Mutation: {};
        Post: BrandedPost;
        Comment: Comment;
      };
    };

    const resolvers: Resolvers<BrandedTypeDefs> = {
      Post: {
        comments: (parent, args) => {
          // Parent is the containing `BrandedPost`, NOT the inner `Comment`
          // item type or the brand wrapper itself.
          expectTypeOf(parent).toEqualTypeOf<BrandedPost>();
          // Args is the partial form of the field's declared input map.
          // GraphQL field args default to nullable, so the resolver sees
          // `{ limit?: number }` (Partial) — implementations can decide
          // whether to apply a runtime default for the missing case.
          expectTypeOf(args).toEqualTypeOf<{ limit?: number }>();
          return args.limit != null ? [] : [];
        },
        // Non-branded fields on the same type still get the parent-only
        // signature with the containing type as `parent`.
        title: (parent) => {
          expectTypeOf(parent).toEqualTypeOf<BrandedPost>();
          return parent.title;
        },
      },
    };
    expectTypeOf(resolvers).toMatchTypeOf<Resolvers<BrandedTypeDefs>>();
  });

  it("rejects wrong field-arg shapes inside FieldWithArgs", () => {
    type BrandedPost = {
      id: string;
      comments: FieldWithArgs<{ limit: number }, Comment[]>;
    };
    type BrandedTypeDefs = {
      types: {
        Query: {};
        Mutation: {};
        Post: BrandedPost;
      };
    };

    const _resolvers: Resolvers<BrandedTypeDefs> = {
      Post: {
        // @ts-expect-error - args.limit must be a number, not a string
        comments: (_parent, args: { limit: string }) => [],
      },
    };
  });

  it("allows an empty resolvers object — every entry is optional", () => {
    const resolvers: Resolvers<TypeDefs> = {};
    expectTypeOf(resolvers).toMatchTypeOf<Resolvers<TypeDefs>>();
  });

  it("accepts a deep-partial return type from resolvers", () => {
    const resolvers: Resolvers<TypeDefs> = {
      Query: {
        // Only returning `id` (omitting title/body) is valid because the
        // remaining fields can be filled in by their own resolvers.
        getPost: () => ({ id: "1" }),
      },
    };
    expectTypeOf(resolvers).toMatchTypeOf<Resolvers<TypeDefs>>();
  });

  it("rejects wrong arg shapes and wrong return shapes", () => {
    const _resolvers: Resolvers<TypeDefs> = {
      Query: {
        // @ts-expect-error - id should be string, not number
        getPost: (_source, args: { id: number }) => ({ id: "1" }),
      },
      Mutation: {
        // @ts-expect-error - return value field has the wrong type
        createPost: () => ({ id: 1 }),
      },
    };
  });

  it("does not allow defining resolvers for keys that aren't in the schema", () => {
    const _resolvers: Resolvers<TypeDefs> = {
      // @ts-expect-error - NotAType is not a key in TypeDefs.types
      NotAType: {},
    };
  });

  it("threads a Context generic through every resolver position", () => {
    // `Resolvers<T, Context>` gives the user-supplied context type to
    // every resolver — root ops, type fields, and subscription halves.
    // Defaults to `unknown`, so existing call sites that don't opt in
    // keep compiling.
    type Ctx = { userId: string };

    const resolvers: Resolvers<TypeDefs, Ctx> = {
      Query: {
        getPost: (_source, args, context) => {
          expectTypeOf(context).toEqualTypeOf<Ctx>();
          return { id: args.id, title: "", body: "" };
        },
      },
      Mutation: {
        createPost: (_source, args, context) => {
          expectTypeOf(context).toEqualTypeOf<Ctx>();
          return { id: context.userId, title: args.title, body: args.body };
        },
      },
      Post: {
        title: (parent, _args, context) => {
          expectTypeOf(context).toEqualTypeOf<Ctx>();
          return parent.title;
        },
      },
    };
    expectTypeOf(resolvers).toMatchTypeOf<Resolvers<TypeDefs, Ctx>>();
  });
});
