import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createReactQueryIntegration } from "typograph/integrations/react-query";
import { typeDefs } from "../schema";
import { App } from "./App";

// React Query has no built-in transport; the integration takes a fetcher
// that returns `data` or throws on GraphQL errors.
const fetcher = async (query: string, variables: Record<string, any>) => {
  const res = await fetch("/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((e: { message: string }) => e.message).join(", "));
  }
  return json.data;
};

export const queryClient = new QueryClient();
export const { useQuery, useMutation } = createReactQueryIntegration(typeDefs, {
  fetcher,
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
