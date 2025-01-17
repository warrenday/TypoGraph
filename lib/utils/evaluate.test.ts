import { describe, it, expect } from "vitest";
import evaluate from "./evaluate";

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
  });
});
