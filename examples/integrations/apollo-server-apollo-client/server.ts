import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { typeDefs, resolvers } from "./schema";

const server = new ApolloServer({
  typeDefs: typeDefs.toSDL(),
  resolvers: resolvers as any,
});

const { url } = await startStandaloneServer(server, {
  listen: { port: 4000 },
});

console.log(`apollo server ready at ${url}`);
