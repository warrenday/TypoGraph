import { describe, it, expect } from "vitest";
import evaluate from "./evaluate";
import { t, TypeBuilder } from "../builder";

describe("evaluate", () => {
  it("evaluates all keys in an object", () => {
    const obj = {
      a: 1,
      b: () => 2,
    };

    expect(evaluate(obj)).toEqual({ a: 1, b: 2 });
  });

  it("evaluates nested objects", () => {
    const obj = {
      a: 1,
      b: { c: () => 2 },
    };

    expect(evaluate(obj)).toEqual({ a: 1, b: { c: 2 } });
  });

  it("coerces TypeBuilder instances to their GraphQL type string", () => {
    const obj = {
      id: t.string(),
      age: t.int().notNull(),
    };

    expect(evaluate(obj)).toEqual({ id: "String", age: "Int!" });
  });

  it("evaluates a mixed object containing TypeBuilders, functions, and primitives", () => {
    const obj = {
      id: t.id().notNull(),
      title: t.string(),
      lazy: () => "resolved",
      static: "static-value",
      nested: {
        body: t.string(),
      },
    };

    expect(evaluate(obj)).toEqual({
      id: "ID!",
      title: "String",
      lazy: "resolved",
      static: "static-value",
      nested: { body: "String" },
    });
  });

  it("invokes function values to support lazy/circular type references", () => {
    const obj = {
      author: () => new TypeBuilder<string>("User"),
    };

    // Functions are invoked but the resulting TypeBuilder is *not* recursively
    // coerced — that mirrors how `combineTypeDefs` calls `evaluate` once on the
    // merged tree, with the inner thunks resolving to TypeBuilder instances
    // already converted in the field map evaluation step.
    const result = evaluate(obj);
    expect(result.author).toBeInstanceOf(TypeBuilder);
    expect(result.author.toString()).toBe("User");
  });

  it("leaves arrays alone (treats them as opaque values)", () => {
    const obj = { tags: [1, 2, 3] };
    expect(evaluate(obj)).toEqual({ tags: [1, 2, 3] });
  });

  it("does not invoke functions that take arguments", () => {
    // Only zero-arg thunks are considered unwrappable. A resolver-like
    // function hanging off a typeDef field should survive the walk, not
    // get called with zero arguments and produce garbage.
    const withArgsFn = (x: number) => x + 1;
    const obj = { handler: withArgsFn };
    expect(evaluate(obj)).toEqual({ handler: withArgsFn });
  });

  it("does not invoke class constructors", () => {
    // Class constructors are `typeof === "function"` with `length === 0`,
    // but calling them without `new` throws. Detecting the non-writable
    // `prototype` descriptor keeps them out of the thunk-unwrap path.
    class Foo {}
    const obj = { ctor: Foo };
    expect(evaluate(obj)).toEqual({ ctor: Foo });
  });

  it("throws on a direct object cycle instead of stack-overflowing", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => evaluate(cyclic)).toThrow(/cycle in typeDefs/);
  });
});
