import { describe, expect, it } from "vitest";
import merge from "./merge";

describe("merge", () => {
  it("merges simple objects", () => {
    const obj1 = { a: 1 };
    const obj2 = { b: 2 };

    expect(merge(obj1, obj2)).toEqual({ a: 1, b: 2 });
  });

  it("overrides primitive values", () => {
    const obj1 = { a: 1 };
    const obj2 = { a: 2 };

    expect(merge(obj1, obj2)).toEqual({ a: 2 });
  });

  it("deeply merges nested objects", () => {
    const obj1 = {
      a: {
        b: 1,
        c: 2,
      },
    };
    const obj2 = {
      a: {
        b: 3,
        d: 4,
      },
    };

    expect(merge(obj1, obj2)).toEqual({
      a: {
        b: 3,
        c: 2,
        d: 4,
      },
    });
  });

  it("handles arrays by overriding them", () => {
    const obj1 = { arr: [1, 2, 3] };
    const obj2 = { arr: [4, 5] };

    expect(merge(obj1, obj2)).toEqual({ arr: [4, 5] });
  });

  it("handles null and undefined values", () => {
    const obj1 = { a: 1, b: null };
    const obj2 = { b: 2, c: undefined };

    expect(merge(obj1, obj2)).toEqual({ a: 1, b: 2, c: undefined });
  });

  it("merges multiple objects", () => {
    const obj1 = { a: 1 };
    const obj2 = { b: 2 };
    const obj3 = { c: 3 };

    expect(merge(obj1, obj2, obj3)).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("handles empty or falsy arguments", () => {
    const obj1 = { a: 1 };

    expect(merge(obj1, null as any, undefined as any)).toEqual({ a: 1 });
  });

  it("preserves complex nested structures", () => {
    const obj1 = {
      user: {
        profile: {
          name: "John",
          age: 30,
        },
        settings: {
          theme: "dark",
        },
      },
    };

    const obj2 = {
      user: {
        profile: {
          age: 31,
          location: "NYC",
        },
        settings: {
          notifications: true,
        },
      },
    };

    expect(merge(obj1, obj2)).toEqual({
      user: {
        profile: {
          name: "John",
          age: 31,
          location: "NYC",
        },
        settings: {
          theme: "dark",
          notifications: true,
        },
      },
    });
  });
});
