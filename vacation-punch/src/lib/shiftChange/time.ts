const TZ = process.env.APP_TZ || "America/Toronto";

// Returns "YYYY-MM-DD" in business TZ
export function ymdInTZ(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// dayOfWeek in TZ: 0=Sun..6=Sat
export function dowInTZ(d: Date): number {
  // Force weekday in TZ by formatting parts then reconstructing a Date at noon local.
  // Simple approach: use Intl parts and compute day with a TZ-safe trick.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(d)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});

  // Create a UTC date at 12:00 for that YMD; weekday in UTC matches the YMD day itself.
  const y = Number(parts.year);
  const m = Number(parts.month);
  const da = Number(parts.day);
  const utcNoon = new Date(Date.UTC(y, m - 1, da, 12, 0, 0));
  return utcNoon.getUTCDay();
}

export function hhmmToMinutes(hhmm: string): number {
  // "09:30" -> 570
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) throw new Error(`Invalid HHMM: ${hhmm}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function timeOfDayMinutesInTZ(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(d)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});

  return Number(parts.hour) * 60 + Number(parts.minute);
}