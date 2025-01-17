import { describe, it, expectTypeOf } from "vitest";
import createClient from "./client";

describe("createClient", () => {
  it("has valid return type for a query", () => {
    const client = createClient<{
      types: {
        Query: {
          getUser: {
            input: {
              id: string;
            };
            output: {
              id: string;
              name: string;
            };
          };
        };
        Mutation: {};
      };
    }>();

    const res = client.query(
      "getUser",
      { id: true, name: true },
      { variables: { id: "1" } }
    );

    expectTypeOf(res.types).toEqualTypeOf<{
      getUser: { id: string; name: string };
    }>();
  });

  it("has valid return type for a complex query", () => {
    type User = {
      id: string;
      name: string;
      posts: Post[];
    };

    type Post = {
      id: string;
      title: string;
      author: User;
    };

    const client = createClient<{
      types: {
        Query: {
          getUser: {
            input: {
              id: string;
            };
            output: User;
          };
        };
        Mutation: {};
      };
    }>();

    const res = client.query(
      "getUser",
      {
        id: true,
        name: true,
        posts: { id: true, author: { name: true, posts: { id: true } } },
      },
      { variables: { id: "1" } }
    );

    expectTypeOf(res.types).toEqualTypeOf<{
      getUser: {
        id: string;
        name: string;
        posts: {
          id: string;
          author: {
            name: string;
            posts: {
              id: string;
            }[];
          };
        }[];
      };
    }>();
  });

  it("has valid selection fields for a query", () => {
    const client = createClient<{
      types: {
        Query: {
          getUser: {
            input: {
              id: string;
            };
            output: {
              id: string;
              name: string;
            };
          };
        };
        Mutation: {};
      };
    }>();

    // This should pass type checking
    client.query(
      "getUser",
      {
        id: true,
        name: true,
      },
      {
        variables: {},
      }
    );

    // This should pass type checking with partial selection
    client.query(
      "getUser",
      {
        id: true,
      },
      {
        variables: {},
      }
    );

    // This should fail type checking
    client.query(
      "getUser",
      {
        // @ts-expect-error - invalid field
        name: "d",
      },
      { variables: {} }
    );

    // This should fail type checking
    client.query(
      "getUser",
      {
        // @ts-expect-error - invalid field
        random: true,
      },
      { variables: {} }
    );
  });
});
