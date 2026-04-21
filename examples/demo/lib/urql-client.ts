"use client";

import {
  Client,
  cacheExchange,
  fetchExchange,
  subscriptionExchange,
} from "urql";
import { createUrqlIntegration } from "typograph/integrations/urql";
import { typeDefs } from "./entities";

const GRAPHQL_PATH = "/api/graphql";

export const client = new Client({
  url: GRAPHQL_PATH,
  exchanges: [
    cacheExchange,
    fetchExchange,
    subscriptionExchange({
      forwardSubscription: (request) => ({
        subscribe: (sink) => {
          const url = new URL(GRAPHQL_PATH, window.location.origin);
          if (request.query) {
            url.searchParams.set("query", request.query);
          }
          if (
            request.variables &&
            Object.keys(request.variables).length > 0
          ) {
            url.searchParams.set(
              "variables",
              JSON.stringify(request.variables)
            );
          }

          const es = new EventSource(url.toString());

          const handleNext = (event: MessageEvent) => {
            try {
              sink.next(JSON.parse(event.data));
            } catch (err) {
              sink.error(err);
            }
          };
          const handleComplete = () => {
            sink.complete();
            es.close();
          };
          const handleError = () => {
            // urql tears the subscription down on sink.error, so we close
            // the EventSource here to stop the browser's built-in
            // auto-reconnect loop from running with no consumer.
            es.close();
            sink.error(new Error("Subscription connection error"));
          };

          es.addEventListener("next", handleNext);
          es.addEventListener("complete", handleComplete);
          es.addEventListener("error", handleError);

          return {
            unsubscribe: () => {
              es.removeEventListener("next", handleNext);
              es.removeEventListener("complete", handleComplete);
              es.removeEventListener("error", handleError);
              es.close();
            },
          };
        },
      }),
    }),
  ],
});

export const { useQuery, useMutation, useSubscription } =
  createUrqlIntegration(typeDefs);
