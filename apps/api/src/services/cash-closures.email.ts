import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

function euro(value: unknown) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(Number.isFinite(n) ? n : 0);
}

export async function sendCashClosureEmail(input: any) {
  const to = process.env.CASH_CLOSURE_EMAIL_TO;

  if (!to) {
    console.log("⚠️ EMAIL NON CONFIGURATA");
    return { ok: false, error: "EMAIL NOT CONFIGURED" };
  }

  const closure = input?.closure ?? input;

  const date = closure?.business_date
    ? String(closure.business_date).slice(0, 10)
    : "N/D";

  const operator = closure?.operator_name || closure?.operator_id || "-";
  const theoretical = closure?.theoretical_base ?? 0;
  const declared = closure?.declared_total ?? 0;
  const delta = closure?.delta ?? 0;
  const notes = closure?.notes || "-";
  const alerts = Array.isArray(closure?.alert_flags)
    ? closure.alert_flags
    : [];

  const subject =
    Math.abs(Number(delta || 0)) > 5
      ? `🚨 Delta ${euro(delta)} | Chiusura ${date}`
      : `Chiusura Cassa ${date}`;

  const body = `
Chiusura Cassa

Data: ${date}
Operatore: ${operator}

Teorico: ${euro(theoretical)}
Dichiarato: ${euro(declared)}
Delta: ${euro(delta)}

Note:
${notes}

Alert:
${alerts.length ? alerts.join(", ") : "Nessuno"}
`.trim();

  try {
    await transporter.sendMail({
      from: `"Core Gestionale" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text: body,
    });

    console.log("📧 EMAIL INVIATA:", to);
    console.log("📧 CASH CLOSURE DATA:", {
      date,
      operator,
      theoretical,
      declared,
      delta,
      alerts,
    });

    return { ok: true };
  } catch (err: any) {
    console.error("❌ ERRORE EMAIL:", err);
    return { ok: false, error: err?.message || "EMAIL ERROR" };
  }
}
