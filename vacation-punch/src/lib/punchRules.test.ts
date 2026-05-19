import { describe, expect, it } from "vitest";
import { allowedNext, autoCloseForOut, type PunchAction } from "./punchRules";

describe("allowedNext", () => {
  it("starts with CLOCK_IN only", () => {
    expect(allowedNext(null)).toEqual(["CLOCK_IN"]);
  });

  it("after CLOCK_IN offers break, lunch, or out", () => {
    expect(allowedNext("CLOCK_IN")).toEqual(["BREAK_START", "LUNCH_START", "CLOCK_OUT"]);
  });

  it("after BREAK_START offers end break or out", () => {
    expect(allowedNext("BREAK_START")).toEqual(["BREAK_END", "CLOCK_OUT"]);
  });

  it("after BREAK_END offers break, lunch, or out", () => {
    expect(allowedNext("BREAK_END")).toEqual(["BREAK_START", "LUNCH_START", "CLOCK_OUT"]);
  });

  it("after LUNCH_START offers end lunch or out", () => {
    expect(allowedNext("LUNCH_START")).toEqual(["LUNCH_END", "CLOCK_OUT"]);
  });

  it("after LUNCH_END offers break or out", () => {
    expect(allowedNext("LUNCH_END")).toEqual(["BREAK_START", "CLOCK_OUT"]);
  });

  it("after CLOCK_OUT next shift starts with CLOCK_IN", () => {
    expect(allowedNext("CLOCK_OUT")).toEqual(["CLOCK_IN"]);
  });

  it("unknown last action falls back to CLOCK_IN", () => {
    expect(allowedNext("UNKNOWN" as PunchAction)).toEqual(["CLOCK_IN"]);
  });
});

describe("autoCloseForOut", () => {
  it("closes open break on out", () => {
    expect(autoCloseForOut("BREAK_START")).toBe("BREAK_END");
  });

  it("closes open lunch on out", () => {
    expect(autoCloseForOut("LUNCH_START")).toBe("LUNCH_END");
  });

  it("returns null when no auto-close", () => {
    expect(autoCloseForOut(null)).toBeNull();
    expect(autoCloseForOut("CLOCK_IN")).toBeNull();
    expect(autoCloseForOut("CLOCK_OUT")).toBeNull();
  });
});
