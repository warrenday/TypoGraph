import { createYoga } from "graphql-yoga";
import { executableSchema } from "@/lib/schema-executable";

// Subscriptions need Node's AsyncIterator + streaming primitives; the
// Edge runtime doesn't provide them.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const yoga = createYoga({
  schema: executableSchema,
  graphqlEndpoint: "/api/graphql",
  fetchAPI: { Response: globalThis.Response, Request: globalThis.Request },
});

// Wrapper to satisfy Next 15's stricter route-handler signature.
const handler = (request: Request) => yoga.handleRequest(request, {});

export { handler as GET, handler as POST, handler as OPTIONS };
