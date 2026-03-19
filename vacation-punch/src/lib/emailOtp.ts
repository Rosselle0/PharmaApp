import crypto from "crypto";

type EmailChangePayload = {
  employeeId: string;
  newEmail: string;
  codeHash: string;
  exp: number;
};

function base64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function unbase64url(input: string) {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return Buffer.from(`${b64}${pad}`, "base64");
}

function getSecret() {
  const secret =
    process.env.EMAIL_CHANGE_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.SUPABASE_JWT_SECRET?.trim() ||
    "dev-email-change-secret";

  if (
    process.env.NODE_ENV === "production" &&
    secret === "dev-email-change-secret"
  ) {
    throw new Error("EMAIL_CHANGE_SECRET manquant en production");
  }
  return secret;
}

export function hashOtp(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export function createEmailChangeToken(payload: EmailChangePayload) {
  const secret = getSecret();
  const body = base64url(JSON.stringify(payload));
  const sig = base64url(crypto.createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

export function readEmailChangeToken(token: string): EmailChangePayload | null {
  const secret = getSecret();
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = base64url(crypto.createHmac("sha256", secret).update(body).digest());
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  try {
    const json = JSON.parse(unbase64url(body).toString("utf8"));
    if (!json || typeof json !== "object") return null;
    return json as EmailChangePayload;
  } catch {
    return null;
  }
}

export function normalizeEmail(value: unknown): string | null {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const left = local.slice(0, 2);
  return `${left}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`;
}
