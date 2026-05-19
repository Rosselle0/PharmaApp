import { describe, expect, it } from "vitest";
import {
  MIN_GROSS_MINUTES_FOR_UNPAID_BREAK_30,
  unpaidBreak30DeductionMinutes,
} from "./unpaidBreak30";

describe("unpaidBreak30DeductionMinutes", () => {
  it("returns 0 when employee has paid 30 min break", () => {
    expect(unpaidBreak30DeductionMinutes(true, 600)).toBe(0);
    expect(unpaidBreak30DeductionMinutes(true, 299)).toBe(0);
  });

  it("returns 30 when unpaid and gross shift >= threshold", () => {
    expect(unpaidBreak30DeductionMinutes(false, MIN_GROSS_MINUTES_FOR_UNPAID_BREAK_30)).toBe(30);
    expect(unpaidBreak30DeductionMinutes(false, MIN_GROSS_MINUTES_FOR_UNPAID_BREAK_30 + 1)).toBe(30);
    expect(unpaidBreak30DeductionMinutes(false, 24 * 60)).toBe(30);
  });

  it("returns 0 when unpaid but shift shorter than threshold", () => {
    expect(unpaidBreak30DeductionMinutes(false, MIN_GROSS_MINUTES_FOR_UNPAID_BREAK_30 - 1)).toBe(0);
    expect(unpaidBreak30DeductionMinutes(false, 0)).toBe(0);
  });
});
