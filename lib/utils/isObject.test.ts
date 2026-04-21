import { describe, expect, it } from "vitest";
import isObject from "./isObject";

describe("isObject", () => {
  it("returns true for plain objects", () => {
    expect(isObject({})).toBe(true);
    expect(isObject({ a: 1 })).toBe(true);
  });

  it("returns false for null", () => {
    expect(isObject(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isObject(undefined)).toBe(false);
  });

  it("returns false for primitives", () => {
    expect(isObject("string")).toBe(false);
    expect(isObject(42)).toBe(false);
    expect(isObject(true)).toBe(false);
    expect(isObject(false)).toBe(false);
    expect(isObject(0)).toBe(false);
    expect(isObject("")).toBe(false);
  });

  it("returns false for arrays", () => {
    expect(isObject([])).toBe(false);
    expect(isObject([1, 2, 3])).toBe(false);
  });

  it("returns true for class instances", () => {
    class Foo {}
    expect(isObject(new Foo())).toBe(true);
  });

  it("returns true for Date instances (matches the historic behavior)", () => {
    // Dates are objects from `typeof` and not arrays, so they qualify.
    // The library never receives Dates in practice, but documenting the
    // current behavior here protects against an accidental future change.
    expect(isObject(new Date())).toBe(true);
  });
});
