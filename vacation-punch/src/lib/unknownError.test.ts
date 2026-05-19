import { describe, expect, it } from "vitest";
import { messageFromUnknown } from "./unknownError";

describe("messageFromUnknown", () => {
  it("reads Error.message", () => {
    expect(messageFromUnknown(new Error("boom"))).toBe("boom");
  });

  it("returns string as-is", () => {
    expect(messageFromUnknown("plain")).toBe("plain");
  });

  it("stringifies other values", () => {
    expect(messageFromUnknown(404)).toBe("404");
    expect(messageFromUnknown(null)).toBe("null");
    expect(messageFromUnknown({ a: 1 })).toBe("[object Object]");
  });
});
