import { createSchema } from "../$node_modules/graphql-yoga/typings/index.js";
import { typeDefs } from "./entities/index.js";
import { resolvers } from "./entities/resolvers.js";

export const executableSchema = createSchema({
  typeDefs: typeDefs.toSDL(),
  resolvers: resolvers as Parameters<typeof createSchema>[0]["resolvers"],
});
