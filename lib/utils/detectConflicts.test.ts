import { describe, expect, it } from "vitest";
import detectConflicts from "./detectConflicts";

describe("detectConflicts", () => {
  it("returns no conflicts for disjoint typeDefs", () => {
    expect(
      detectConflicts([{ Post: { id: "String" } }, { User: { id: "String" } }])
    ).toEqual([]);
  });

  it("returns no conflicts for matching duplicates", () => {
    expect(
      detectConflicts([
        { Post: { id: "String" } },
        { Post: { id: "String" } },
      ])
    ).toEqual([]);
  });

  it("treats co-declared object fields as deep-merged (no conflict)", () => {
    expect(
      detectConflicts([
        { Post: { id: "String" } },
        { Post: { title: "String" } },
      ])
    ).toEqual([]);
  });

  it("flags a leaf-level type-string override", () => {
    expect(
      detectConflicts([
        { Query: { getPost: { output: "Post" } } },
        { Query: { getPost: { output: "String" } } },
      ])
    ).toEqual(["Query.getPost.output"]);
  });

  it("flags an array override (arrays are replaced, not merged)", () => {
    expect(
      detectConflicts([{ Post: { tags: [1, 2] } }, { Post: { tags: [3] } }])
    ).toEqual(["Post.tags"]);
  });

  it("ignores undefined or non-object items", () => {
    expect(
      detectConflicts([{ Post: { id: "String" } }, null, undefined])
    ).toEqual([]);
  });
});
