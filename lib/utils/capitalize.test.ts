import { describe, expect, it } from "vitest";
import capitalize from "./capitalize";

describe("capitalize", () => {
  it("returns an empty string unchanged", () => {
    expect(capitalize("")).toBe("");
  });

  it("uppercases a single lowercase character", () => {
    expect(capitalize("a")).toBe("A");
  });

  it("leaves an already-capitalized string unchanged", () => {
    expect(capitalize("Hello")).toBe("Hello");
  });

  it("only capitalizes the first character", () => {
    expect(capitalize("hello world")).toBe("Hello world");
  });

  it("handles unicode characters", () => {
    expect(capitalize("éclair")).toBe("Éclair");
  });

  it("leaves digits and symbols unchanged", () => {
    expect(capitalize("123abc")).toBe("123abc");
    expect(capitalize("!hello")).toBe("!hello");
  });
});
