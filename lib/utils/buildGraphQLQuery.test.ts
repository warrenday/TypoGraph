import { describe, expect, it } from "vitest";
import dedent from "dedent";
import buildGraphQLQuery from "./buildGraphQLQuery";

// Normalize whitespace so we can compare against a readable expected string
// without caring about the indentation that the template literal injects.
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();

describe("buildGraphQLQuery", () => {
  it("emits a query with no variables and no header parens", () => {
    const out = buildGraphQLQuery(
      "query",
      { listPosts: { id: true, title: true } },
      { listPosts: {} },
      {}
    );

    expect(normalize(out)).toBe(
      normalize(dedent`
        query ListPosts {
          listPosts {
            id title
          }
        }
      `)
    );
  });

  it("emits a query with a string variable using $variable syntax", () => {
    const out = buildGraphQLQuery(
      "query",
      { getPost: { id: true, title: true } },
      { getPost: { id: "String" } },
      { id: "abc" }
    );

    expect(normalize(out)).toBe(
      normalize(dedent`
        query GetPost($id: String) {
          getPost(id: $id) {
            id title
          }
        }
      `)
    );
  });

  it("does not stringify number variables in the GraphQL output", () => {
    // Regression: the original implementation hard-coded `key: "value"` which
    // double-quoted numbers. With $variables, the value lives outside the
    // query string entirely, so the output must contain `$age` and never `30`.
    const out = buildGraphQLQuery(
      "query",
      { getUser: { id: true } },
      { getUser: { age: "Int" } },
      { age: 30 }
    );

    expect(out).toContain("$age: Int");
    expect(out).toContain("age: $age");
    expect(out).not.toContain('"30"');
    expect(out).not.toContain("30");
  });

  it("supports boolean and multiple variables in declaration order", () => {
    const out = buildGraphQLQuery(
      "query",
      { search: { id: true } },
      { search: { term: "String!", limit: "Int", verified: "Boolean" } },
      { term: "hello", limit: 5, verified: true }
    );

    expect(normalize(out)).toBe(
      normalize(dedent`
        query Search($term: String!, $limit: Int, $verified: Boolean) {
          search(term: $term, limit: $limit, verified: $verified) {
            id
          }
        }
      `)
    );
  });

  it("omits optional variables that are not present in the call", () => {
    // `age` is declared in the inputDef but not provided at call time, so it
    // should not appear in either the header or the field args.
    const out = buildGraphQLQuery(
      "query",
      { getUser: { id: true } },
      { getUser: { id: "String", age: "Int" } },
      { id: "abc" }
    );

    expect(out).toContain("$id: String");
    expect(out).toContain("id: $id");
    expect(out).not.toContain("$age");
  });

  it("emits nested field selections", () => {
    const out = buildGraphQLQuery(
      "query",
      {
        getUser: {
          id: true,
          profile: { name: true, bio: true },
        },
      },
      { getUser: {} },
      {}
    );

    expect(normalize(out)).toBe(
      normalize(dedent`
        query GetUser {
          getUser {
            id profile { name bio }
          }
        }
      `)
    );
  });

  it("emits a mutation with proper $variable syntax", () => {
    const out = buildGraphQLQuery(
      "mutation",
      { createPost: { id: true, title: true } },
      { createPost: { title: "String!", body: "String" } },
      { title: "hi", body: "there" }
    );

    expect(normalize(out)).toBe(
      normalize(dedent`
        mutation CreatePost($title: String!, $body: String) {
          createPost(title: $title, body: $body) {
            id title
          }
        }
      `)
    );
  });

  it("does not require escaping string contents because values live in the variables map", () => {
    // Regression: the original implementation inlined values into the query
    // string and did not escape quotes. With proper $variable syntax this is
    // no longer a concern — the value just rides on the JSON variables map.
    const tricky = 'He said "hi"';
    const out = buildGraphQLQuery(
      "query",
      { getUser: { id: true } },
      { getUser: { name: "String" } },
      { name: tricky }
    );

    expect(out).not.toContain(tricky);
    expect(out).toContain("$name");
  });

  it("throws on an invalid field value", () => {
    expect(() =>
      buildGraphQLQuery(
        "query",
        // @ts-expect-error - intentionally invalid
        { x: { id: 5 } },
        { x: {} },
        {}
      )
    ).toThrow(/Invalid value/);
  });

  it("emits multiple top-level fields in a single document", () => {
    // Two operations sharing one variables map produce a single multi-root
    // document. The header declares each unique variable once, and each
    // operation block emits its own field-arg list.
    const out = buildGraphQLQuery(
      "query",
      {
        getPost: { id: true, title: true },
        getComment: { id: true, body: true },
      },
      {
        getPost: { id: "String!" },
        getComment: { id: "String!" },
      },
      { id: "1" }
    );

    expect(normalize(out)).toBe(
      normalize(dedent`
        query GetPostAndGetComment($id: String!) {
          getPost(id: $id) {
            id title
          }
          getComment(id: $id) {
            id body
          }
        }
      `)
    );
  });

  it("emits a subscription operation", () => {
    const out = buildGraphQLQuery(
      "subscription",
      { commentAdded: { id: true, body: true } },
      { commentAdded: { postId: "String!" } },
      { postId: "p1" }
    );

    expect(normalize(out)).toBe(
      normalize(dedent`
        subscription CommentAdded($postId: String!) {
          commentAdded(postId: $postId) {
            id body
          }
        }
      `)
    );
  });
});
