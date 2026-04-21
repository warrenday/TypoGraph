import type { GraphQLResolveInfo } from "graphql";
import { BaseTypeDefs, DeepPartial, FieldWithArgs, PeelFieldArgs } from "./common";

// Resolver map for the Query/Mutation root. Matches graphql-js's calling
// convention exactly: `(source, args, context, info)`. `source` is the
// rootValue passed to `execute()` (usually `undefined`), so callers
// typically ignore it with a leading `_source`. `context` is threaded
// through the top-level `Context` generic — it defaults to `unknown`,
// which forces a narrowing check the moment a resolver reaches for a
// field on it, catching accidental context use in code that didn't
// opt into a context type.
type PartialResolver<
  T extends Record<string, { input: unknown; output: unknown }>,
  Context,
> = {
  [K in keyof T]?: (
    source: unknown,
    args: T[K]["input"],
    context: Context,
    info?: GraphQLResolveInfo,
  ) => DeepPartial<T[K]["output"]>;
};

// Resolver map for a named object type. Every field resolver follows
// graphql-js's `(parent, args, context, info)` signature. Two flavors
// per field, picked at the type level by checking for the
// `FieldWithArgs<I, O>` brand emitted by `builder.field(...)`:
//
//   1. Branded fields — typed `args` from the `input` map.
//   2. Plain fields — `args` typed as `{}`. graphql-js always passes
//      an args object (empty when the field has no declared args), so
//      the slot has to exist; typing it as `{}` keeps resolvers that
//      don't care about args free to ignore it with a leading `_args`.
//
// `info` is optional so resolvers are easy to call directly in unit
// tests without constructing a full `GraphQLResolveInfo`.
type PartialTypeResolver<T extends Record<string, any>, Context> = {
  [K in keyof T]?: T[K] extends FieldWithArgs<infer FieldInput, infer FieldOutput>
    ? (
        parent: T,
        args: Partial<FieldInput>,
        context: Context,
        info?: GraphQLResolveInfo,
      ) => DeepPartial<FieldOutput>
    : (
        parent: T,
        args: {},
        context: Context,
        info?: GraphQLResolveInfo,
      ) => DeepPartial<PeelFieldArgs<T[K]>>;
};

// Subscription resolvers carry both a `subscribe` (returns the source
// async iterator) and an optional `resolve` (transforms each emitted
// payload into the field value). Both halves follow graphql-js's
// calling convention verbatim:
//   subscribe: (source, args, context, info) => AsyncIterable
//   resolve:   (payload, args, context, info) => output
type PartialSubscriptionResolver<
  T extends Record<string, { input: unknown; output: unknown }>,
  Context,
> = {
  [K in keyof T]?: {
    subscribe: (
      source: unknown,
      args: T[K]["input"],
      context: Context,
      info?: GraphQLResolveInfo,
    ) => AsyncIterable<any> | Promise<AsyncIterable<any>>;
    resolve?: (
      payload: any,
      args: T[K]["input"],
      context: Context,
      info?: GraphQLResolveInfo,
    ) => DeepPartial<T[K]["output"]>;
  };
};

// When the schema doesn't declare a Mutation or Subscription map, we omit
// the key entirely instead of typing it as `never`. graphql-yoga's
// `IResolvers` index signature rejects `never`, so conditional
// intersections let typeDefs without those operations flow straight into
// `createSchema({ resolvers })` without a cast.
type Resolvers<T extends { types: BaseTypeDefs }, Context = unknown> = {
  Query?: PartialResolver<T["types"]["Query"], Context>;
} & (T["types"]["Mutation"] extends Record<
  string,
  { input: unknown; output: unknown }
>
  ? { Mutation?: PartialResolver<T["types"]["Mutation"], Context> }
  : {}) &
  (T["types"]["Subscription"] extends Record<
    string,
    { input: unknown; output: unknown }
  >
    ? {
        Subscription?: PartialSubscriptionResolver<
          T["types"]["Subscription"],
          Context
        >;
      }
    : {}) &
  Omit<
    {
      [K in keyof T["types"]]?: T["types"][K] extends Record<string, any>
        ? PartialTypeResolver<T["types"][K], Context>
        : never;
    },
    "Query" | "Mutation" | "Subscription"
  >;

export type { Resolvers };
