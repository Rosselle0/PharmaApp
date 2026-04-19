import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const PREFIX = "scrypt1$";

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(plain, salt, 64);
  return `${PREFIX}${salt.toString("base64")}$${key.toString("base64")}`;
}

export function verifyPassword(plain: string, stored: string | null | undefined): boolean {
  if (!stored?.startsWith(PREFIX)) return false;
  const rest = stored.slice(PREFIX.length);
  const i = rest.indexOf("$");
  if (i <= 0) return false;
  const saltB64 = rest.slice(0, i);
  const hashB64 = rest.slice(i + 1);
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltB64, "base64");
    expected = Buffer.from(hashB64, "base64");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  const key = scryptSync(plain, salt, expected.length);
  if (key.length !== expected.length) return false;
  return timingSafeEqual(key, expected);
}
