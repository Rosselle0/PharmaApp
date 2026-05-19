export function isAutoPunchShift(note: string | null | undefined) {
  return note === "PUNCH_AUTO" || note === "PUNCH_AUTO_UNAVAILABLE";
}
