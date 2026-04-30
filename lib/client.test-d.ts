import { describe, it, expectTypeOf } from "vitest";
import createClient from "./client";

describe("createClient", () => {
  it("has valid return type for a query", () => {
    const client = createClient({} as {
      types: {
        Query: {
          getUser: {
            input: {
              id: string;
              age?: number;
            };
            output: {
              id: string;
              name: string;
              age: number;
            };
          };
        };
        Mutation: {};
      };
    });

    const res = client.query(
      {
        getUser: { id: true, name: true, age: true },
      },
      { variables: { id: "1", age: 2 } }
    );

    expectTypeOf(res.returnType).toEqualTypeOf<{
      getUser: { id: string; name: string; age: number };
    }>();

    expectTypeOf(res.variables).toEqualTypeOf<{
      id: string;
      age: number;
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

    const client = createClient({} as {
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
    });

    const res = client.query(
      {
        getUser: {
          id: true,
          name: true,
          posts: { id: true, author: { name: true, posts: { id: true } } },
        },
      },
      { variables: { id: "1" } }
    );

    expectTypeOf(res.returnType).toEqualTypeOf<{
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

    expectTypeOf(res.variables).toEqualTypeOf<{
      id: string;
    }>();
  });

  it("has valid return type for a query whose output is a top-level array", () => {
    // Regression: previously SelectionSet<T> / SelectFields<T, S> only handled
    // arrays as fields, not as the operation output itself (e.g. `listPosts:
    // { output: Post[] }`). When T was an array, `keyof T` collapsed to numeric
    // indices, the selection became `never`, and consumers like
    // `result.data?.listPosts.map(p => p.id)` saw `Property 'id' does not
    // exist on type 'never'`.
    type Post = {
      id: string;
      title: string;
      body: string;
    };

    const client = createClient({} as {
      types: {
        Query: {
          listPosts: {
            input: {};
            output: Post[];
          };
        };
        Mutation: {
          createPosts: {
            input: { title: string };
            output: Post[];
          };
        };
      };
    });

    const queryRes = client.query(
      {
        listPosts: { id: true, title: true, body: true },
      },
      { variables: {} }
    );

    expectTypeOf(queryRes.returnType).toEqualTypeOf<{
      listPosts: { id: string; title: string; body: string }[];
    }>();

    // Partial selections should also produce arrays of the partial item type.
    const partial = client.query(
      { listPosts: { id: true } },
      { variables: {} }
    );
    expectTypeOf(partial.returnType).toEqualTypeOf<{
      listPosts: { id: string }[];
    }>();

    // Same shape rule applies to mutations returning arrays.
    const mutationRes = client.mutate(
      {
        createPosts: { id: true, title: true },
      },
      { variables: { title: "x" } }
    );
    expectTypeOf(mutationRes.returnType).toEqualTypeOf<{
      createPosts: { id: string; title: string }[];
    }>();

    // Selecting a field that doesn't exist on the item type must still error,
    // proving the constraint is bound to the item, not the array wrapper.
    client.query(
      {
        listPosts: {
          // @ts-expect-error - 'random' is not a field on Post
          random: true,
        },
      },
      { variables: {} }
    );
  });

  it("has valid return type for a query whose output is an array of objects with nested arrays", () => {
    // Guard against the array-unwrap fix accidentally breaking nested arrays.
    type Comment = { id: string; body: string };
    type Post = {
      id: string;
      title: string;
      comments: Comment[];
    };

    const client = createClient({} as {
      types: {
        Query: {
          listPosts: {
            input: {};
            output: Post[];
          };
        };
        Mutation: {};
      };
    });

    const res = client.query(
      {
        listPosts: {
          id: true,
          title: true,
          comments: { id: true, body: true },
        },
      },
      { variables: {} }
    );

    expectTypeOf(res.returnType).toEqualTypeOf<{
      listPosts: {
        id: string;
        title: string;
        comments: { id: string; body: string }[];
      }[];
    }>();
  });

  it("has valid selection fields for a query", () => {
    const client = createClient({} as {
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
    });

    // This should pass type checking
    client.query(
      {
        getUser: {
          id: true,
          name: true,
        },
      },
      {
        variables: {
          id: "1",
        },
      }
    );

    // This should pass type checking with partial selection
    client.query(
      {
        getUser: {
          id: true,
        },
      },
      {
        variables: {
          id: "1",
        },
      }
    );

    // This should fail type checking — `name: "d"` is not a valid leaf
    // (must be `true` or a nested selection object).
    client.query(
      {
        getUser: {
          // @ts-expect-error - invalid leaf value
          name: "d",
        },
      },
      { variables: { id: "1" } }
    );

    // This should fail type checking — `random` is not a field on `getUser`.
    client.query(
      {
        getUser: {
          // @ts-expect-error - invalid field
          random: true,
        },
      },
      { variables: { id: "1" } }
    );

    // This should fail type checking (wrong variable type)
    client.query(
      {
        getUser: {
          id: true,
        },
      },
      {
        variables: {
          // @ts-expect-error - wrong variable type
          id: 2,
        },
      }
    );
  });

  it("supports multiple top-level fields in a single operation", () => {
    type Post = { id: string; title: string };
    type Comment = { id: string; body: string };

    const client = createClient({} as {
      types: {
        Query: {
          getPost: { input: { id: string }; output: Post };
          getComment: { input: { id: string }; output: Comment };
        };
        Mutation: {};
      };
    });

    const res = client.query(
      {
        getPost: { id: true, title: true },
        getComment: { id: true, body: true },
      },
      { variables: { id: "1" } }
    );

    expectTypeOf(res.returnType).toEqualTypeOf<{
      getPost: { id: string; title: string };
      getComment: { id: string; body: string };
    }>();

    // Both operations share the same `id` variable since they declare it
    // with the same type — the merged variables shape collapses to one key.
    expectTypeOf(res.variables).toEqualTypeOf<{ id: string }>();
  });

  it("rejects unknown fields even when mixed with valid fields", () => {
    type Post = { id: string; title: string; body: string };

    const client = createClient({} as {
      types: {
        Query: {
          listPosts: { input: {}; output: Post[] };
        };
        Mutation: {};
      };
    });

    // An unknown field alongside valid fields must still error.
    client.query(
      {
        listPosts: {
          id: true,
          // @ts-expect-error - 'nonExistent' is not a field on Post
          nonExistent: true,
        },
      },
      { variables: {} }
    );
  });
});
