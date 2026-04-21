import {
  useQuery as useTanstackQuery,
  useMutation as useTanstackMutation,
  type UseQueryOptions,
  type UseQueryResult,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import createClient from "../client";
import type {
  SelectionsByOperation,
  MergedVariables,
  ReturnShape,
} from "../client";
import type { BaseTypeDefs } from "../types/common";

// Transport contract the integration expects. React Query has no built-in
// HTTP client — unlike urql, which owns transport via its `Client` and
// `<Provider>`. The fetcher is the one seam the integration reserves:
// receive the raw GraphQL string and the variables object, return the
// response `data`. Plug in `fetch`, `graphql-request`, axios, or anything
// else.
//
// The fetcher **must throw** on GraphQL errors. React Query treats a
// resolved promise as success — if the fetcher returns `{ errors, data:
// null }` silently, callers will see `data: null` and no error state. The
// docs show the recommended pattern (check `json.errors` and throw).
export interface ReactQueryIntegrationOptions {
  fetcher: (query: string, variables: Record<string, any>) => Promise<any>;
}

// Public shape of the hooks bound to a single typograph schema.
//
// Each hook is fully generic on its selection set so that `ReturnShape`
// can project the selection through the schema and hand back a typed
// result. Extracting this shape as a named type does two things:
//   1. Gives `createReactQueryIntegration` an explicit return type, which
//      TS requires once the inferred type grows past its serialization
//      budget (TS7056 — the inferred type of the factory exceeds what the
//      compiler can write into a `.d.ts` without help).
//   2. Makes the public contract of the integration reviewable in one
//      place — consumers can look up exactly what `useQuery` and
//      `useMutation` accept and return without having to squint at the
//      factory body.
//
// No `useSubscription`: React Query doesn't ship a subscription primitive
// (its model is request/response with caching, not long-lived streams).
// Apps that need GraphQL subscriptions should use the urql integration
// (`typograph/integrations/urql`) or drop to the core client and hand
// `res.toGraphQL()` + `res.variables` to their own SSE/WebSocket
// transport. See `docs/any-client.mdx`.
interface ReactQueryIntegration<Schema extends BaseTypeDefs> {
  useQuery: <const S extends SelectionsByOperation<Schema, "Query">>(
    selection: S,
    options?: Omit<
      UseQueryOptions<ReturnShape<Schema, "Query", S>, Error>,
      "queryKey" | "queryFn"
    > & {
      variables?: MergedVariables<Schema, "Query", S>;
      queryKey?: readonly unknown[];
    }
  ) => UseQueryResult<ReturnShape<Schema, "Query", S>, Error>;

  useMutation: <const S extends SelectionsByOperation<Schema, "Mutation">>(
    selection: S,
    options?: Omit<
      UseMutationOptions<
        ReturnShape<Schema, "Mutation", S>,
        Error,
        MergedVariables<Schema, "Mutation", S>
      >,
      "mutationFn"
    >
  ) => UseMutationResult<
    ReturnShape<Schema, "Mutation", S>,
    Error,
    MergedVariables<Schema, "Mutation", S>
  >;
}

// Factory that binds a typograph schema to React Query's hooks. Call once
// at the top of your app (or in a module that re-exports the result) to
// get a `{ useQuery, useMutation }` pair whose selection sets, variables,
// and return types are all inferred directly from the typeDefs you pass
// in — no codegen, no cast-to-any required at the call site.
//
// The factory pattern keeps the hooks closed over a *runtime* typograph
// client (`createClient(typeDefs)`), so each hook can call into the same
// typed query-builder it would use on the server. Transport is delegated
// to the user-supplied `fetcher` — unlike the urql integration, which
// leaves transport to the urql `Client` in context.
//
// Note on the internal casts: the hook-level `MergedVariables<Schema, Op,
// S>` type doesn't structurally satisfy `typograph.query`'s inner
// `Variables` constraint (the `Prettify<MakeOptional<...>>` chain
// introduces mapped-type indirection that defeats assignability checks
// across generic boundaries). Each call to `typograph.query` /
// `typograph.mutate` casts its options through `any` at that one internal
// boundary — the external hook signatures are the real type gate, so
// callers still get fully-checked inputs and outputs.
export const createReactQueryIntegration = <
  T extends { types: BaseTypeDefs }
>(
  typeDefs: T,
  { fetcher }: ReactQueryIntegrationOptions
): ReactQueryIntegration<T["types"]> => {
  const typograph = createClient(typeDefs);
  type Schema = T["types"];

  // Thin wrapper over React Query's `useQuery`. The typograph handler
  // builds the GraphQL string + variables from the typed selection; we
  // feed them to the user-supplied fetcher inside `queryFn`.
  //
  // Default `queryKey` is `[res.toGraphQL(), res.variables]`. The GraphQL
  // string is canonical (deterministic from the selection + variables
  // pair via `buildGraphQLQuery`), so two selections that compile to the
  // same query share a cache entry. Callers can override via
  // `options.queryKey` for custom invalidation schemes.
  const useQuery = <const S extends SelectionsByOperation<Schema, "Query">>(
    selection: S,
    options?: Omit<
      UseQueryOptions<ReturnShape<Schema, "Query", S>, Error>,
      "queryKey" | "queryFn"
    > & {
      variables?: MergedVariables<Schema, "Query", S>;
      queryKey?: readonly unknown[];
    }
  ): UseQueryResult<ReturnShape<Schema, "Query", S>, Error> => {
    const { variables, queryKey, ...rest } = (options ?? {}) as any;
    const res = typograph.query(selection, { variables } as any);
    const query = res.toGraphQL();
    const vars = res.variables;

    return useTanstackQuery<ReturnShape<Schema, "Query", S>, Error>({
      queryKey: queryKey ?? [query, vars],
      queryFn: () =>
        fetcher(query, vars) as Promise<ReturnShape<Schema, "Query", S>>,
      ...rest,
    });
  };

  // Thin wrapper over React Query's `useMutation`. Unlike the urql
  // integration's mutation hook — which has to bypass urql's own
  // `useMutation` because urql freezes the query string at hook-init time
  // — React Query's `mutationFn` runs at execute time, which matches
  // typograph's model exactly. We rebuild the query string *inside*
  // `mutationFn` so the operation header declares `$title`, `$body`, etc.
  // for whichever keys are actually present in the variables map at call
  // time.
  const useMutation = <
    const S extends SelectionsByOperation<Schema, "Mutation">
  >(
    selection: S,
    options?: Omit<
      UseMutationOptions<
        ReturnShape<Schema, "Mutation", S>,
        Error,
        MergedVariables<Schema, "Mutation", S>
      >,
      "mutationFn"
    >
  ): UseMutationResult<
    ReturnShape<Schema, "Mutation", S>,
    Error,
    MergedVariables<Schema, "Mutation", S>
  > => {
    return useTanstackMutation({
      mutationFn: async (
        variables: MergedVariables<Schema, "Mutation", S>
      ) => {
        const res = typograph.mutate(selection, { variables } as any);
        return fetcher(res.toGraphQL(), res.variables) as Promise<
          ReturnShape<Schema, "Mutation", S>
        >;
      },
      ...options,
    });
  };

  // The locally-defined hooks are typed against the alias `Schema =
  // T["types"]`, which TypeScript doesn't consider structurally identical
  // to the interface's `T["types"]` reference once the generic is
  // threaded through `Prettify` and `MakeOptional`. The hooks'
  // implementations are correct — we just need to tell TypeScript to
  // accept them at the return boundary.
  return {
    useQuery,
    useMutation,
  } as unknown as ReactQueryIntegration<T["types"]>;
};
