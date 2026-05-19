import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("shiftChange/time (APP_TZ=UTC)", () => {
  beforeEach(() => {
    vi.stubEnv("APP_TZ", "UTC");
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ymdInTZ formats calendar date in UTC", async () => {
    const { ymdInTZ } = await import("./time");
    expect(ymdInTZ(new Date(Date.UTC(2024, 5, 15, 3, 0, 0)))).toBe("2024-06-15");
  });

  it("addCalendarDaysYmd adds days across month boundary", async () => {
    const { addCalendarDaysYmd } = await import("./time");
    expect(addCalendarDaysYmd("2024-01-31", 1)).toBe("2024-02-01");
    expect(addCalendarDaysYmd("2024-03-01", -1)).toBe("2024-02-29");
  });

  it("hhmmToMinutes parses 24h strings", async () => {
    const { hhmmToMinutes } = await import("./time");
    expect(hhmmToMinutes("00:00")).toBe(0);
    expect(hhmmToMinutes("09:30")).toBe(9 * 60 + 30);
    expect(hhmmToMinutes("23:59")).toBe(23 * 60 + 59);
  });

  it("hhmmToMinutes rejects invalid strings", async () => {
    const { hhmmToMinutes } = await import("./time");
    expect(() => hhmmToMinutes("24:00")).toThrow(/Invalid HHMM/);
    expect(() => hhmmToMinutes("9:30")).toThrow(/Invalid HHMM/);
    expect(() => hhmmToMinutes("12:60")).toThrow(/Invalid HHMM/);
  });

  it("dowInTZ returns weekday for that calendar day in TZ", async () => {
    const { dowInTZ } = await import("./time");
    // 2024-06-15 is Saturday (6) in UTC calendar
    expect(dowInTZ(new Date(Date.UTC(2024, 5, 15, 12, 0, 0)))).toBe(6);
  });

  it("timeOfDayMinutesInTZ returns minutes since midnight in TZ", async () => {
    const { timeOfDayMinutesInTZ } = await import("./time");
    const d = new Date(Date.UTC(2024, 0, 10, 14, 45, 0));
    expect(timeOfDayMinutesInTZ(d)).toBe(14 * 60 + 45);
  });
});
