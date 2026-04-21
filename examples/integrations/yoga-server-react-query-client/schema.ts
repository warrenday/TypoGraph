import { createTypeDefBuilder, t, type Resolvers } from "@overstacked/typograph";

const builder = createTypeDefBuilder();

const message = builder.type({
  id: t.id().notNull(),
  text: t.string().notNull(),
});

export type Message = typeof message;

export const typeDefs = builder.combineTypeDefs([
  builder.typeDef({
    Message: message,
    Query: {
      message: builder.query({
        input: t.type({}),
        output: t.type<Message>("Message!"),
      }),
    },
    Mutation: {
      setMessage: builder.mutation({
        input: t.type({ text: t.string().notNull() }),
        output: t.type<Message>("Message!"),
      }),
    },
  }),
]);

export type TypeDefs = typeof typeDefs;

let current: Message = { id: "1", text: "Hello, world!" };

export const resolvers: Resolvers<TypeDefs> = {
  Query: {
    message: () => current,
  },
  Mutation: {
    setMessage: (_source, { text }) => {
      current = { ...current, text };
      return current;
    },
  },
};
