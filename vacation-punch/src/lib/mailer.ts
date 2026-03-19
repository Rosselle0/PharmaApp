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
  const text = `${salutation}

Votre code de verification pour changer l'email est: ${args.code}

Ce code expire dans 10 minutes.
Si vous n'avez pas demande ce changement, ignorez ce message.`;

  await transporter.sendMail({
    from: cfg.from,
    to: args.to,
    subject: "Verification changement email",
    text,
  });

  return { ok: true as const };
}
