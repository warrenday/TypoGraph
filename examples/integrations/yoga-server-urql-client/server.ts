import { createServer } from "node:http";
import { createYoga, createSchema } from "graphql-yoga";
import { typeDefs, resolvers } from "./schema";

const yoga = createYoga({
  schema: createSchema({
    typeDefs: typeDefs.toSDL(),
    resolvers: resolvers as Parameters<typeof createSchema>[0]["resolvers"],
  }),
  graphqlEndpoint: "/graphql",
});

const server = createServer(yoga);
server.listen(4000, () => {
  console.log("graphql ready at http://localhost:4000/graphql");
});
