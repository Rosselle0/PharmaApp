/** Resolve custom employee row order (same rules as schedule view). */

export function decodeOrderCookie(raw: string | undefined) {
  if (!raw) return "";
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

export function parseOrderIds(orderParam: string) {
  return orderParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function applyEmployeeOrder<T extends { id: string }>(employees: T[], orderIds: string[]) {
  if (!orderIds.length) return employees;
  const byId = new Map(employees.map((e) => [e.id, e]));
  const ordered = orderIds.map((id) => byId.get(id)).filter((e): e is T => Boolean(e));
  const rest = employees.filter((e) => !orderIds.includes(e.id));
  return [...ordered, ...rest];
}

type CookieLike = { get: (name: string) => { value: string } | undefined };

export function resolveScheduleOrderParam(opts: {
  fromQuery: string | null | undefined;
  section: "CAISSE_LAB" | "FLOOR";
  cookieStore?: CookieLike;
}) {
  const fromQuery = String(opts.fromQuery ?? "").trim();
  if (fromQuery) return fromQuery;

  if (!opts.cookieStore) return "";

  const sectionCookie = decodeOrderCookie(
    opts.cookieStore.get(`schedule_order_${opts.section}`)?.value
  );
  if (sectionCookie) return sectionCookie;

  return decodeOrderCookie(opts.cookieStore.get("schedule_order")?.value);
}

/** Client-side: URL → localStorage → cookie → current table row order. */
export function resolveScheduleOrderClient(
  section: "CAISSE_LAB" | "FLOOR",
  fromUrl: string | null | undefined
) {
  const urlOrder = String(fromUrl ?? "").trim();
  if (urlOrder) return urlOrder;

  if (typeof window === "undefined") return "";

  const ls = (window.localStorage.getItem(`schedule-edit-order:${section}`) ?? "").trim();
  if (ls) return ls;

  const cookiePart = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`schedule_order_${section}=`));
  if (cookiePart) {
    const raw = cookiePart.slice(`schedule_order_${section}=`.length);
    const decoded = decodeOrderCookie(raw);
    if (decoded) return decoded;
  }

  const globalPart = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("schedule_order="));
  if (globalPart) {
    const raw = globalPart.slice("schedule_order=".length);
    const decoded = decodeOrderCookie(raw);
    if (decoded) return decoded;
  }

  const ids: string[] = [];
  document.querySelectorAll(".tableWrap .table tbody tr[data-emp-id]").forEach((row) => {
    const id = row.getAttribute("data-emp-id");
    if (id) ids.push(id);
  });
  return ids.length ? ids.join(",") : "";
}
