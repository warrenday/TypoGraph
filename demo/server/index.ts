import { createSchema, createYoga } from "graphql-yoga";
import { createServer } from "http";
import { typeDefs, type TypeDefs } from "./entitiies/index";
import { type Resolvers } from "../../lib/main";

const resolvers: Resolvers<TypeDefs> = {
  Post: {
    id: () => "2",
  },
  Query: {
    getUser: (args) => {
      // TODO: Implement
      return {
        id: "1",
        name: "John Doe",
      };
    },
  },
  Mutation: {
    updatePost: (args) => {
      // TODO: Implement
      return {
        id: "1",
      };
    },
  },
};

const startServer = async () => {
  const schema = createSchema({
    typeDefs: typeDefs.toSDL(),
    resolvers,
  });

  const yoga = createYoga({
    schema,
    graphqlEndpoint: "/graphql",
    cors: {
      origin: "*",
    },
  });

  const server = createServer(yoga);

  server.listen(3001, () => {
    console.log("Server is running on http://localhost:3001/graphql");
  });
};

startServer();
