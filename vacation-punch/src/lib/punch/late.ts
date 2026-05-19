/** Grace period before lateness is counted (minutes). */
export const LATE_GRACE_MINUTES = 5;

export function roundUpToNext15Minutes(mins: number) {
  if (!Number.isFinite(mins) || mins <= 0) return 0;
  return Math.ceil(mins / 15) * 15;
}

/** Penalty minutes applied to payroll when late beyond grace. */
export function computeLatePenaltyMinutes(rawLateMinutes: number | null) {
  if (rawLateMinutes === null) return null;
  if (rawLateMinutes <= LATE_GRACE_MINUTES) return 0;
  return roundUpToNext15Minutes(rawLateMinutes);
}

export type LateDecision = "ACCEPTED" | "REJECTED" | "PENDING";

/** Payable / effective start after late review rules. */
export function computeEffectiveStartTime(
  shiftStart: Date,
  latePenaltyMinutes: number | null,
  lateDecision: LateDecision | null | undefined
) {
  if (!latePenaltyMinutes || latePenaltyMinutes <= 0) return shiftStart;
  if (lateDecision === "REJECTED") return shiftStart;
  return new Date(shiftStart.getTime() + latePenaltyMinutes * 60_000);
}

export function lateMsFromPlannedStart(plannedStart: Date, now = new Date()) {
  const raw = now.getTime() - plannedStart.getTime();
  if (raw <= LATE_GRACE_MINUTES * 60_000) return 0;
  return raw;
}

/** Human label for journaux / schedule when punch was after planned start. */
export function formatLateDisplay(rawLateMinutes: number | null) {
  if (rawLateMinutes === null || rawLateMinutes <= 0) return null;
  const rounded = Math.round(rawLateMinutes);
  if (rounded <= LATE_GRACE_MINUTES) {
    return `Retard ${rounded} min (tolérance)`;
  }
  const penalty = computeLatePenaltyMinutes(rawLateMinutes);
  if (penalty && penalty > 0) {
    return `En retard de ${rounded} min`;
  }
  return `En retard de ${rounded} min`;
}
