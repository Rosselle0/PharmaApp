export type PunchAction =
  | "CLOCK_IN"
  | "CLOCK_OUT"
  | "BREAK_START"
  | "BREAK_END"
  | "LUNCH_START"
  | "LUNCH_END";

export function allowedNext(last: PunchAction | null): PunchAction[] {
  if (!last) return ["CLOCK_IN"];

  switch (last) {
    case "CLOCK_IN":
      return ["BREAK_START", "LUNCH_START", "CLOCK_OUT"];

    case "BREAK_START":
      // B behavior: allow CLOCK_OUT, we'll auto-close break
      return ["BREAK_END", "CLOCK_OUT"];

    case "BREAK_END":
      return ["BREAK_START", "LUNCH_START", "CLOCK_OUT"];

    case "LUNCH_START":
      // B behavior: allow CLOCK_OUT, we'll auto-close lunch
      return ["LUNCH_END", "CLOCK_OUT"];

    case "LUNCH_END":
      return ["BREAK_START", "CLOCK_OUT"];

    case "CLOCK_OUT":
      // next shift
      return ["CLOCK_IN"];

    default:
      return ["CLOCK_IN"];
  }
}

export function autoCloseForOut(last: PunchAction | null): PunchAction | null {
  if (last === "BREAK_START") return "BREAK_END";
  if (last === "LUNCH_START") return "LUNCH_END";
  return null;
}