import { BaseTypeDefs } from "./common";

type BaseType = "Query" | "Mutation";

// Create a type-safe client
type QueryKeys<S extends BaseTypeDefs, B extends BaseType> = keyof S[B];
type QueryResponse<
  S extends BaseTypeDefs,
  T extends QueryKeys<S, B>,
  B extends BaseType
> = S[B][T]["output"];

// Step 2: Define a selection set type without requiring arrays in the selection
type SelectionSet<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? SelectionSet<U> // Automatically infer array item type without needing array brackets in selection
    : T[K] extends object
    ? SelectionSet<T[K]>
    : true; // Primitive fields can be selected with `true`
};

// Step 3: Define a utility to map the selection set to a specific response type
// prettier-ignore
// @ts-expect-error
type SelectSubFields<T, S, K> = SelectFields<T[K] extends any[] ? T[K][0] : T[K], S[K]>
type SelectFields<T, S extends SelectionSet<T>> = {
  [K in keyof S]: S[K] extends true
    ? // @ts-expect-error
      T[K]
    : S[K] extends object
    ? // @ts-expect-error
      T[K] extends any[]
      ? Array<SelectSubFields<T, S, K>>
      : SelectSubFields<T, S, K>
    : never;
};

async function fetchQuery<
  S extends BaseTypeDefs,
  T extends QueryKeys<S, "Query">,
  Q extends SelectionSet<QueryResponse<S, T, "Query">>
>(
  query: T,
  selectionSet: Q
): Promise<SelectFields<QueryResponse<S, T, "Query">, Q>> {
  // Actual fetch logic here
  // ...
  return {} as SelectFields<QueryResponse<S, T, "Query">, Q>;
}

async function fetchMutation<
  S extends BaseTypeDefs,
  T extends QueryKeys<S, "Query">,
  Q extends SelectionSet<QueryResponse<S, T, "Query">>
>(
  query: T,
  selectionSet: Q
): Promise<SelectFields<QueryResponse<S, T, "Query">, Q>> {
  // Actual fetch logic here
  // ...
  return {} as SelectFields<QueryResponse<S, T, "Query">, Q>;
}

const createClient = <TUserSchema extends { types: BaseTypeDefs }>() => {
  return {
    query: async <
      S extends TUserSchema["types"],
      T extends QueryKeys<S, "Query">,
      Q extends SelectionSet<QueryResponse<S, T, "Query">>
    >(
      query: T,
      selectionSet: Q
    ): Promise<SelectFields<QueryResponse<S, T, "Query">, Q>> => {
      return await fetchQuery(query, selectionSet);
    },
    mutate: async <
      S extends TUserSchema["types"],
      T extends QueryKeys<S, "Mutation">,
      Q extends SelectionSet<QueryResponse<S, T, "Mutation">>
    >(
      mutation: T,
      selectionSet: Q
    ): Promise<SelectFields<QueryResponse<S, T, "Mutation">, Q>> => {
      return await fetchMutation(mutation, selectionSet);
    },
  };
};

export default createClient;
