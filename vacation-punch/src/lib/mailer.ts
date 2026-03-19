import nodemailer from "nodemailer";

function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim();

  if (!host || !user || !pass || !from) {
    return null;
  }

  return {
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    from,
  };
}

export async function sendEmailOtp(args: {
  to: string;
  code: string;
  firstName?: string | null;
  subject?: string;
  purpose?: "LOGIN" | "EMAIL_CHANGE";
}) {
  const cfg = getSmtpConfig();
  if (!cfg) {
    return {
      ok: false as const,
      error:
        "Email non configuré. Ajoute SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.",
    };
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.auth,
  });

  const salutation = args.firstName?.trim() ? `Bonjour ${args.firstName},` : "Bonjour,";
  const isLogin = args.purpose === "LOGIN";
  const title = isLogin ? "Code de connexion" : "Code de vérification email";
  const description = isLogin
    ? "Utilise ce code pour terminer ta connexion au kiosk."
    : "Utilise ce code pour confirmer ton changement d'email.";

  const text = `${salutation}

${title}
Code: ${args.code}

${description}
Ce code expire dans 10 minutes.
Si vous n'avez pas demande cette action, ignorez ce message.`;

  const html = renderBeautifulEmail({
    title,
    greeting: salutation,
    description,
    code: args.code,
    footer:
      "Ce code expire dans 10 minutes. Si vous n'avez pas demandé cette action, ignorez ce message.",
  });

  await transporter.sendMail({
    from: cfg.from,
    to: args.to,
    subject: args.subject ?? (isLogin ? "Vérification connexion kiosk" : "Vérification changement email"),
    text,
    html,
  });

  return { ok: true as const };
}

export async function sendShiftChangeRequestEmail(args: {
  to: string;
  candidateFirstName?: string | null;
  requesterName: string;
  shiftStart: Date;
  shiftEnd: Date;
  note?: string | null;
}) {
  const cfg = getSmtpConfig();
  if (!cfg) {
    return {
      ok: false as const,
      error:
        "Email non configuré. Ajoute SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.",
    };
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.auth,
  });

  const date = new Intl.DateTimeFormat("fr-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(args.shiftStart);
  const start = new Intl.DateTimeFormat("fr-CA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(args.shiftStart);
  const end = new Intl.DateTimeFormat("fr-CA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(args.shiftEnd);

  const hello = args.candidateFirstName?.trim()
    ? `Bonjour ${args.candidateFirstName},`
    : "Bonjour,";

  const text = `${hello}

${args.requesterName} t'a envoye une demande de changement de quart.
Jour: ${date}
Heure: ${start} - ${end}
Note: ${args.note?.trim() || "(aucune)"}

Connecte-toi dans la section Changement pour accepter ou refuser.`;
  const html = renderBeautifulEmail({
    title: "Nouvelle demande de changement",
    greeting: hello,
    description: `${args.requesterName} t'a envoyé une demande de changement de quart.`,
    blocks: [
      `Jour: ${date}`,
      `Heure: ${start} - ${end}`,
      `Note: ${args.note?.trim() || "(aucune)"}`,
    ],
    footer: "Connecte-toi dans la section Changement pour accepter ou refuser.",
  });

  await transporter.sendMail({
    from: cfg.from,
    to: args.to,
    subject: "Nouvelle demande de changement de quart",
    text,
    html,
  });

  return { ok: true as const };
}

export async function sendShiftChangeAcceptedEmail(args: {
  to: string;
  requesterFirstName?: string | null;
  candidateName: string;
  shiftStart: Date;
  shiftEnd: Date;
}) {
  const cfg = getSmtpConfig();
  if (!cfg) {
    return {
      ok: false as const,
      error:
        "Email non configuré. Ajoute SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.",
    };
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.auth,
  });

  const hello = args.requesterFirstName?.trim()
    ? `Bonjour ${args.requesterFirstName},`
    : "Bonjour,";
  const date = new Intl.DateTimeFormat("fr-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(args.shiftStart);
  const start = new Intl.DateTimeFormat("fr-CA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(args.shiftStart);
  const end = new Intl.DateTimeFormat("fr-CA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(args.shiftEnd);

  const text = `${hello}

${args.candidateName} a accepté ton changement de quart.
Jour: ${date}
Heure: ${start} - ${end}

Le quart a bien été transféré.`;

  const html = renderBeautifulEmail({
    title: "Changement accepté",
    greeting: hello,
    description: `${args.candidateName} a accepté ton changement de quart.`,
    blocks: [`Jour: ${date}`, `Heure: ${start} - ${end}`],
    footer: "Le quart a bien été transféré.",
  });

  await transporter.sendMail({
    from: cfg.from,
    to: args.to,
    subject: "Ton changement de quart a été accepté",
    text,
    html,
  });

  return { ok: true as const };
}

function renderBeautifulEmail(args: {
  title: string;
  greeting: string;
  description: string;
  code?: string;
  blocks?: string[];
  footer: string;
}) {
  const blocksHtml = (args.blocks ?? [])
    .map(
      (b) =>
        `<div style="padding:8px 12px;border:1px solid #dbe7ff;border-radius:10px;background:#f7faff;color:#123;">${escapeHtml(
          b
        )}</div>`
    )
    .join("");

  const codeHtml = args.code
    ? `<div style="margin:12px auto 10px;max-width:220px;text-align:center;font-size:34px;font-weight:900;letter-spacing:6px;color:#0b3ea8;padding:12px 16px;border-radius:14px;border:1px solid #b9d1ff;background:linear-gradient(180deg,#ffffff,#edf4ff);">${escapeHtml(
        args.code
      )}</div>`
    : "";

  return `
  <div style="margin:0;padding:24px;background:#eef4ff;font-family:Inter,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #d7e3ff;border-radius:16px;overflow:hidden;box-shadow:0 12px 36px rgba(17,52,128,.12);">
      <div style="padding:20px 22px;background:linear-gradient(135deg,#0f3b97,#1e5ad7);color:#fff;">
        <div style="font-size:22px;font-weight:900;letter-spacing:.2px;">Accès Pharma</div>
        <div style="font-size:13px;opacity:.9;margin-top:4px;">Notification sécurisée</div>
      </div>
      <div style="padding:20px 22px;color:#0f172a;">
        <div style="font-size:21px;font-weight:900;margin-bottom:8px;">${escapeHtml(args.title)}</div>
        <div style="font-size:15px;font-weight:700;margin-bottom:8px;">${escapeHtml(args.greeting)}</div>
        <div style="font-size:14px;line-height:1.6;color:#334155;">${escapeHtml(args.description)}</div>
        ${codeHtml}
        <div style="display:grid;gap:8px;margin-top:10px;">${blocksHtml}</div>
        <div style="margin-top:16px;font-size:12px;color:#64748b;line-height:1.5;">${escapeHtml(args.footer)}</div>
      </div>
    </div>
  </div>`;
}

function escapeHtml(v: string) {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
