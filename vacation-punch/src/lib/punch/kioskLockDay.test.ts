import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const punchFindFirst = vi.hoisted(() => vi.fn());
const employeeUpdate = vi.hoisted(() => vi.fn());
const punchFindMany = vi.hoisted(() => vi.fn());
const employeeUpdateMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    punchEvent: {
      findFirst: punchFindFirst,
      findMany: punchFindMany,
    },
    employee: {
      update: employeeUpdate,
      updateMany: employeeUpdateMany,
    },
  },
}));

describe("isPunchKioskLockExpiredByCalendarDay", () => {
  const prev = process.env.APP_TZ;

  beforeEach(async () => {
    vi.stubEnv("APP_TZ", "UTC");
    vi.resetModules();
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.APP_TZ;
    else process.env.APP_TZ = prev;
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("treats missing last clock-out as expired (no lock)", async () => {
    const { isPunchKioskLockExpiredByCalendarDay } = await import("./kioskLockDay");
    expect(isPunchKioskLockExpiredByCalendarDay(null)).toBe(true);
    expect(isPunchKioskLockExpiredByCalendarDay(undefined)).toBe(true);
  });

  it("false when last out and now share same calendar day in TZ", async () => {
    const { isPunchKioskLockExpiredByCalendarDay } = await import("./kioskLockDay");
    const last = new Date(Date.UTC(2024, 2, 10, 4, 0, 0));
    const now = new Date(Date.UTC(2024, 2, 10, 22, 0, 0));
    expect(isPunchKioskLockExpiredByCalendarDay(last, now)).toBe(false);
  });

  it("true when calendar day rolled in TZ", async () => {
    const { isPunchKioskLockExpiredByCalendarDay } = await import("./kioskLockDay");
    const last = new Date(Date.UTC(2024, 2, 10, 23, 0, 0));
    const now = new Date(Date.UTC(2024, 2, 11, 1, 0, 0));
    expect(isPunchKioskLockExpiredByCalendarDay(last, now)).toBe(true);
  });
});

describe("resolvePunchKioskLocked", () => {
  beforeEach(() => {
    punchFindFirst.mockReset();
    employeeUpdate.mockReset();
  });

  it("returns false immediately when dbLocked is false", async () => {
    vi.resetModules();
    const { resolvePunchKioskLocked } = await import("./kioskLockDay");
    const r = await resolvePunchKioskLocked("emp-1", false);
    expect(r).toBe(false);
    expect(punchFindFirst).not.toHaveBeenCalled();
  });

  it("clears stale lock and returns false when day changed", async () => {
    vi.stubEnv("APP_TZ", "UTC");
    vi.resetModules();
    const { resolvePunchKioskLocked } = await import("./kioskLockDay");
    punchFindFirst.mockResolvedValue({
      at: new Date(Date.UTC(2024, 0, 5, 12, 0, 0)),
    });
    const now = new Date(Date.UTC(2024, 0, 6, 8, 0, 0));
    const r = await resolvePunchKioskLocked("emp-42", true, now);
    expect(r).toBe(false);
    expect(employeeUpdate).toHaveBeenCalledWith({
      where: { id: "emp-42" },
      data: { punchKioskLocked: false },
    });
  });

  it("returns true when still same day and locked", async () => {
    vi.stubEnv("APP_TZ", "UTC");
    vi.resetModules();
    const { resolvePunchKioskLocked } = await import("./kioskLockDay");
    const day = new Date(Date.UTC(2024, 4, 1, 10, 0, 0));
    punchFindFirst.mockResolvedValue({ at: day });
    const r = await resolvePunchKioskLocked("emp-9", true, new Date(Date.UTC(2024, 4, 1, 18, 0, 0)));
    expect(r).toBe(true);
    expect(employeeUpdate).not.toHaveBeenCalled();
  });
});

describe("expireStalePunchKioskLocksForEmployeeIds", () => {
  beforeEach(() => {
    punchFindMany.mockReset();
    employeeUpdateMany.mockReset();
  });

  it("returns empty set when no ids", async () => {
    vi.resetModules();
    const { expireStalePunchKioskLocksForEmployeeIds } = await import("./kioskLockDay");
    const cleared = await expireStalePunchKioskLocksForEmployeeIds([]);
    expect(cleared.size).toBe(0);
    expect(punchFindMany).not.toHaveBeenCalled();
  });

  it("clears stale employees and returns their ids", async () => {
    vi.stubEnv("APP_TZ", "UTC");
    vi.resetModules();
    const { expireStalePunchKioskLocksForEmployeeIds } = await import("./kioskLockDay");
    punchFindMany.mockResolvedValue([
      { employeeId: "a", at: new Date(Date.UTC(2024, 6, 1, 8, 0, 0)) },
      { employeeId: "b", at: new Date(Date.UTC(2024, 6, 2, 8, 0, 0)) },
    ]);
    const now = new Date(Date.UTC(2024, 6, 3, 12, 0, 0));
    const cleared = await expireStalePunchKioskLocksForEmployeeIds(["a", "b"], now);
    expect(cleared.has("a")).toBe(true);
    expect(cleared.has("b")).toBe(true);
    expect(employeeUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a", "b"] } },
      data: { punchKioskLocked: false },
    });
  });
});
