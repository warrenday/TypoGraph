import { Client, cacheExchange, fetchExchange } from "urql";
import { createClient } from "../lib/main";
import { type TypeDefs } from "./server/entitiies/index";

const client = new Client({
  url: "http://localhost:3001/graphql",
  exchanges: [cacheExchange, fetchExchange],
});

const typograph = createClient<TypeDefs>();

export const query = <
  Q extends Parameters<typeof typograph.query>[0],
  S extends Parameters<typeof typograph.query>[1],
  V extends Parameters<typeof typograph.query>[2]
>(
  query: Q,
  selection: S,
  variables: V
) => {
  const res = typograph.query(query, selection, variables);
  console.log(res.toGraphQL());
  return client.query<typeof res.types, any>(res.toGraphQL(), variables);
};
