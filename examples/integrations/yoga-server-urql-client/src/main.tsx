import React from "react";
import ReactDOM from "react-dom/client";
import { Client, cacheExchange, fetchExchange, Provider } from "urql";
import { createUrqlIntegration } from "@overstacked/typograph/integrations/urql";
import { typeDefs } from "../schema";
import { App } from "./App";

const client = new Client({
  url: "/graphql",
  exchanges: [cacheExchange, fetchExchange],
});

export const { useQuery, useMutation } = createUrqlIntegration(typeDefs);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider value={client}>
      <App />
    </Provider>
  </React.StrictMode>
);
