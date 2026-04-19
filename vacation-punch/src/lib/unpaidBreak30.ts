/** Minimum gross shift length (minutes) before deducting the 30-minute unpaid meal from payable time. */
export const MIN_GROSS_MINUTES_FOR_UNPAID_BREAK_30 = 300; // 5h

export function unpaidBreak30DeductionMinutes(
  paidBreak30: boolean,
  grossShiftMinutes: number
): number {
  if (paidBreak30) return 0;
  return grossShiftMinutes >= MIN_GROSS_MINUTES_FOR_UNPAID_BREAK_30 ? 30 : 0;
}
