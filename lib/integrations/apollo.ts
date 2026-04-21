import { useCallback, useState } from "react";
import {
  useQuery as useApolloQuery,
  useSubscription as useApolloSubscription,
  useApolloClient,
  gql,
  ApolloError,
  type QueryResult,
  type SubscriptionResult,
  type FetchResult,
} from "@apollo/client";
import createClient from "../client";
import type {
  SelectionsByOperation,
  MergedVariables,
  ReturnShape,
} from "../client";
import type { BaseTypeDefs } from "../types/common";

// Public shape of the hooks bound to a single typograph schema.
//
// Each hook is fully generic on its selection set so that `ReturnShape` can
// project the selection through the schema and hand back a typed result.
// Extracting this shape as a named type does two things:
//   1. Gives `createApolloIntegration` an explicit return type, which TS
//      requires once the inferred type grows past its serialization budget
//      (TS7056 — the inferred type of the factory exceeds what the
//      compiler can write into a `.d.ts` without help).
//   2. Makes the public contract of the integration reviewable in one
//      place — consumers can look up exactly what `useQuery` / `useMutation`
//      / `useSubscription` accept and return without having to squint at
//      the factory body.
interface ApolloMutationState<TData> {
  data?: TData | null;
  loading: boolean;
  error?: ApolloError;
  called: boolean;
  reset: () => void;
}

interface ApolloIntegration<Schema extends BaseTypeDefs> {
  useQuery: <const S extends SelectionsByOperation<Schema, "Query">>(
    selection: S,
    options?: { variables: MergedVariables<Schema, "Query", S> },
  ) => QueryResult<ReturnShape<Schema, "Query", S>, any>;

  useMutation: <const S extends SelectionsByOperation<Schema, "Mutation">>(
    selection: S,
  ) => readonly [
    (
      variables: MergedVariables<Schema, "Mutation", S>,
    ) => Promise<FetchResult<ReturnShape<Schema, "Mutation", S>>>,
    ApolloMutationState<ReturnShape<Schema, "Mutation", S>>,
  ];

  useSubscription: <
    const S extends SelectionsByOperation<Schema, "Subscription">,
  >(
    selection: S,
    options?: { variables: MergedVariables<Schema, "Subscription", S> },
  ) => SubscriptionResult<ReturnShape<Schema, "Subscription", S>, any>;
}

// Factory that binds a typograph schema to Apollo Client's React hooks. Call
// once at the top of your app (or in a module that re-exports the result) to
// get a `{ useQuery, useMutation, useSubscription }` trio whose selection
// sets, variables, and return types are all inferred directly from the
// typeDefs you pass in — no codegen step, no cast-to-any required at the
// call site.
//
// The factory pattern keeps the hooks closed over a *runtime* typograph
// client (`createClient(typeDefs)`), so each hook can call into the same
// typed query-builder it would use on the server. All three hooks defer
// transport concerns (fetching, caching, subscription links) to the
// `ApolloClient` that's already been wired up via `<ApolloProvider>` in the
// tree — this integration is purely the typograph ↔ Apollo bridge, not a
// new transport layer.
//
// Note on subscriptions: this integration expects the `ApolloClient` in
// context to be configured with a subscription link (e.g. `GraphQLWsLink`
// for graphql-ws, or a custom SSE link for graphql-yoga), typically
// combined with the HTTP link via Apollo's `split(...)`.
//
// Note on the internal casts: the hook-level `MergedVariables<Schema, Op,
// S>` type doesn't structurally satisfy `typograph.query`'s inner
// `Variables` constraint (the `Prettify<MakeOptional<...>>` chain
// introduces mapped-type indirection that defeats assignability checks
// across generic boundaries). Each call to `typograph.query` /
// `typograph.mutate` / `typograph.subscribe` casts its options through
// `any` at that one internal boundary — the external hook signatures are
// the real type gate, so callers still get fully-checked inputs and
// outputs.
export const createApolloIntegration = <T extends { types: BaseTypeDefs }>(
  typeDefs: T,
): ApolloIntegration<T["types"]> => {
  const typograph = createClient(typeDefs);
  type Schema = T["types"];

  // Thin wrapper over Apollo's `useQuery`. The typograph handler builds the
  // GraphQL string + variables from the typed selection; we pass the string
  // through `gql` to get the `DocumentNode` Apollo requires.
  const useQuery = <const S extends SelectionsByOperation<Schema, "Query">>(
    selection: S,
    options?: { variables: MergedVariables<Schema, "Query", S> },
  ): QueryResult<ReturnShape<Schema, "Query", S>, any> => {
    const res = typograph.query(selection, options as any);
    return useApolloQuery<ReturnShape<Schema, "Query", S>, any>(
      gql(res.toGraphQL()),
      { variables: res.variables },
    );
  };

  // Custom mutation hook that bypasses Apollo's `useMutation` entirely.
  //
  // Apollo's own hook freezes the mutation document at init time, but
  // typograph only declares header variables (`$title: String!, ...`) for
  // keys that are actually present in the variables map at the moment
  // `toGraphQL()` runs. With no variables at setup, the generated mutation
  // string would be `mutation CreatePost { createPost { id title body } }`
  // — no `$title`/`$body` — and any variables passed at execute time would
  // be silently dropped by the server. So we rebuild the document (with
  // the real variables) inside the execute callback, ensuring the
  // operation header always matches what the caller wants to send.
  //
  // The returned shape matches Apollo's `[execute, result]` ordering so
  // this feels native to Apollo users. The result exposes `data`,
  // `loading`, `error`, `called`, and `reset` — the same surface Apollo's
  // `MutationResult` provides, minus `client` (consumers can grab it via
  // `useApolloClient()` if needed).
  const useMutation = <
    const S extends SelectionsByOperation<Schema, "Mutation">,
  >(
    selection: S,
  ): readonly [
    (
      variables: MergedVariables<Schema, "Mutation", S>,
    ) => Promise<FetchResult<ReturnShape<Schema, "Mutation", S>>>,
    ApolloMutationState<ReturnShape<Schema, "Mutation", S>>,
  ] => {
    const client = useApolloClient();
    type TData = ReturnShape<Schema, "Mutation", S>;

    const initialState = {
      loading: false,
      called: false,
    } as Omit<ApolloMutationState<TData>, "reset">;
    const [state, setState] =
      useState<Omit<ApolloMutationState<TData>, "reset">>(initialState);

    // `selection` is almost always an object literal at the call site
    // (typograph inference is at its cleanest that way), so its identity
    // changes every render. Stringifying gives us a stable key so
    // `execute` keeps its identity across renders — important when
    // callers pass `execute` into a memoized child or an effect dep list.
    const selectionKey = JSON.stringify(selection);

    const execute = useCallback(
      async (variables: MergedVariables<Schema, "Mutation", S>) => {
        setState({
          loading: true,
          called: true,
          data: undefined,
          error: undefined,
        });
        const res = typograph.mutate(selection, { variables } as any);
        try {
          const result = await client.mutate<TData>({
            mutation: gql(res.toGraphQL()),
            variables: res.variables,
          });
          const graphqlError = result.errors?.length
            ? new ApolloError({ graphQLErrors: [...result.errors] })
            : undefined;
          setState({
            data: result.data,
            loading: false,
            called: true,
            error: graphqlError,
          });
          return result;
        } catch (err) {
          const error =
            err instanceof ApolloError
              ? err
              : new ApolloError({ networkError: err as Error });
          setState({ loading: false, called: true, error });
          throw err;
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [client, selectionKey],
    );

    const reset = useCallback(() => {
      setState(initialState);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return [execute, { ...state, reset }] as const;
  };

  // Thin wrapper over Apollo's `useSubscription`. Returns Apollo's native
  // `SubscriptionResult` so callers read `result.data`, `result.error`,
  // `result.loading` — exactly like any other Apollo subscription hook,
  // but with the query and result typed from the typograph selection.
  const useSubscription = <
    const S extends SelectionsByOperation<Schema, "Subscription">,
  >(
    selection: S,
    options?: { variables: MergedVariables<Schema, "Subscription", S> },
  ): SubscriptionResult<ReturnShape<Schema, "Subscription", S>, any> => {
    const res = typograph.subscribe(selection, options as any);
    return useApolloSubscription<ReturnShape<Schema, "Subscription", S>, any>(
      gql(res.toGraphQL()),
      { variables: res.variables },
    );
  };

  // The locally-defined hooks are typed against the alias `Schema = T["types"]`,
  // which TypeScript doesn't consider structurally identical to the interface's
  // `T["types"]` reference once the generic is threaded through `Prettify`
  // and `MakeOptional`. The hooks' implementations are correct — we just need
  // to tell TypeScript to accept them at the return boundary.
  return {
    useQuery,
    useMutation,
    useSubscription,
  } as unknown as ApolloIntegration<T["types"]>;
};
