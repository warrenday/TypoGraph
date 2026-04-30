import { useCallback, useState } from "react";
import {
  useQuery as useUrqlQuery,
  useSubscription as useUrqlSubscription,
  useClient,
  type UseQueryResponse,
  type UseSubscriptionResponse,
  type OperationResult,
  type OperationContext,
  type RequestPolicy,
} from "urql";
import createClient from "../client";
import type {
  SelectionsByOperation,
  ValidateSelectionsByOperation,
  MergedVariables,
  ReturnShape,
} from "../client";
import type { BaseTypeDefs } from "../types/common";

// Public shape of the hooks bound to a single typograph schema.
//
// Each hook is fully generic on its selection set so that `ReturnShape` can
// project the selection through the schema and hand back a typed result.
// Extracting this shape as a named type does two things:
//   1. Gives `createUrqlIntegration` an explicit return type, which TS
//      requires once the inferred type grows past its serialization budget
//      (TS7056 — the inferred type of the factory exceeds what the
//      compiler can write into a `.d.ts` without help).
//   2. Makes the public contract of the integration reviewable in one
//      place — consumers can look up exactly what `useQuery` / `useMutation`
//      / `useSubscription` accept and return without having to squint at
//      the factory body.
interface UseQueryOptions<Variables> {
  variables: Variables;
  pause?: boolean;
  requestPolicy?: RequestPolicy;
  context?: Partial<OperationContext>;
}

interface UseSubscriptionOptions<Variables> {
  variables: Variables;
  pause?: boolean;
  context?: Partial<OperationContext>;
}

interface UrqlIntegration<Schema extends BaseTypeDefs> {
  useQuery: <const S extends SelectionsByOperation<Schema, "Query">>(
    selection: S & ValidateSelectionsByOperation<Schema, "Query", S>,
    options?: UseQueryOptions<MergedVariables<Schema, "Query", S>>,
  ) => UseQueryResponse<ReturnShape<Schema, "Query", S>, any>;

  useMutation: <const S extends SelectionsByOperation<Schema, "Mutation">>(
    selection: S & ValidateSelectionsByOperation<Schema, "Mutation", S>,
  ) => readonly [
    { fetching: boolean; error?: Error; data?: ReturnShape<Schema, "Mutation", S> },
    (
      variables: MergedVariables<Schema, "Mutation", S>,
    ) => Promise<OperationResult<ReturnShape<Schema, "Mutation", S>, any>>,
  ];

  useSubscription: <
    const S extends SelectionsByOperation<Schema, "Subscription">,
  >(
    selection: S & ValidateSelectionsByOperation<Schema, "Subscription", S>,
    options?: UseSubscriptionOptions<
      MergedVariables<Schema, "Subscription", S>
    >,
  ) => UseSubscriptionResponse<ReturnShape<Schema, "Subscription", S>, any>;
}

// Factory that binds a typograph schema to urql's React hooks. Call once at
// the top of your app (or in a module that re-exports the result) to get a
// `{ useQuery, useMutation, useSubscription }` trio whose selection sets,
// variables, and return types are all inferred directly from the typeDefs
// you pass in — no codegen step, no cast-to-any required at the call site.
//
// The factory pattern keeps the hooks closed over a *runtime* typograph
// client (`createClient(typeDefs)`), so each hook can call into the same
// typed query-builder it would use on the server. All three hooks defer
// transport concerns (fetching, caching, subscription exchanges) to the
// `urql` Client that's already been wired up via `<Provider>` in the tree —
// this integration is purely the typograph ↔ urql bridge, not a new
// transport layer.
//
// Note on the subscription exchange: this integration expects the urql
// `Client` in context to be configured with a `subscriptionExchange` that
// speaks whatever transport the GraphQL server uses (e.g. SSE for
// graphql-yoga, graphql-ws for WS-based setups). See the demo's
// `demo/urql-client.ts` for a minimal SSE example.
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
export const createUrqlIntegration = <T extends { types: BaseTypeDefs }>(
  typeDefs: T,
): UrqlIntegration<T["types"]> => {
  const typograph = createClient(typeDefs);
  type Schema = T["types"];

  // Thin wrapper over urql's `useQuery`. The typograph handler builds the
  // GraphQL string + variables from the typed selection, and we feed them
  // straight into urql.
  const useQuery = <const S extends SelectionsByOperation<Schema, "Query">>(
    selection: S,
    options?: UseQueryOptions<MergedVariables<Schema, "Query", S>>,
  ): UseQueryResponse<ReturnShape<Schema, "Query", S>, any> => {
    const res = typograph.query(selection as any, options as any);
    return useUrqlQuery<ReturnShape<Schema, "Query", S>, any>({
      query: res.toGraphQL(),
      variables: res.variables,
      pause: options?.pause,
      requestPolicy: options?.requestPolicy,
      context: options?.context,
    });
  };

  // Custom mutation hook that bypasses urql's `useMutation` entirely.
  //
  // urql's own hook freezes the query string at hook-init time, but
  // typograph only declares header variables (`$title: String!, ...`) for
  // keys that are actually present in the variables map at the moment
  // `toGraphQL()` runs. With no variables at setup, the generated mutation
  // string would be `mutation CreatePost { createPost { id title body } }`
  // — no `$title`/`$body` — and any variables passed at execute time would
  // be silently dropped by the server. So we rebuild the query (with the
  // real variables) inside the execute callback, ensuring the operation
  // header always matches what the caller wants to send.
  //
  // The returned state object matches the fetching/error flags shape the
  // typical urql `useMutation` consumer looks at. Callers who need the
  // fully typed `data` should read `result.data` off the value `execute`
  // resolves to — it's typed as `ReturnShape<Schema, "Mutation", S>`.
  const useMutation = <
    const S extends SelectionsByOperation<Schema, "Mutation">,
  >(
    selection: S,
  ): readonly [
    { fetching: boolean; error?: Error; data?: ReturnShape<Schema, "Mutation", S> },
    (
      variables: MergedVariables<Schema, "Mutation", S>,
    ) => Promise<OperationResult<ReturnShape<Schema, "Mutation", S>, any>>,
  ] => {
    const client = useClient();
    const [state, setState] = useState<{
      fetching: boolean;
      error?: Error;
      data?: ReturnShape<Schema, "Mutation", S>;
    }>({ fetching: false });

    // `selection` is almost always an object literal at the call site
    // (typograph inference is at its cleanest that way), so its identity
    // changes every render. Stringifying gives us a stable key so
    // `execute` keeps its identity across renders — important when
    // callers pass `execute` into a memoized child or an effect dep list.
    const selectionKey = JSON.stringify(selection);

    const execute = useCallback(
      async (variables: MergedVariables<Schema, "Mutation", S>) => {
        setState({ fetching: true });
        const res = typograph.mutate(selection as any, { variables } as any);
        const result = await client
          .mutation<
            ReturnShape<Schema, "Mutation", S>,
            any
          >(res.toGraphQL(), res.variables)
          .toPromise();
        if (result.error) {
          setState({ fetching: false, error: result.error });
        } else {
          setState({ fetching: false, data: result.data ?? undefined });
        }
        return result;
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [client, selectionKey],
    );

    return [state, execute] as const;
  };

  // Thin wrapper over urql's `useSubscription`. Returns urql's native
  // `[state, executeSubscription]` tuple so callers can use `result.data`,
  // `result.error`, `result.fetching`, and re-execute at will — exactly
  // like any other urql subscription hook, but with the query and result
  // typed from the typograph selection.
  const useSubscription = <
    const S extends SelectionsByOperation<Schema, "Subscription">,
  >(
    selection: S,
    options?: UseSubscriptionOptions<
      MergedVariables<Schema, "Subscription", S>
    >,
  ): UseSubscriptionResponse<ReturnShape<Schema, "Subscription", S>, any> => {
    const res = typograph.subscribe(selection as any, options as any);
    return useUrqlSubscription<
      ReturnShape<Schema, "Subscription", S>,
      ReturnShape<Schema, "Subscription", S>,
      any
    >({
      query: res.toGraphQL(),
      variables: res.variables,
      pause: options?.pause,
      context: options?.context,
    });
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
  } as unknown as UrqlIntegration<T["types"]>;
};
