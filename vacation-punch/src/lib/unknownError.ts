/** Human-readable message from a caught value without using `any`. */
export function messageFromUnknown(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return String(e);
}
