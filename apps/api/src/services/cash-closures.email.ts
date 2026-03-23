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

export async function sendCashClosureEmail(closure: any) {
  const to = process.env.CASH_CLOSURE_EMAIL_TO;

  if (!to) {
    console.log("⚠️ EMAIL NON CONFIGURATA");
    return { ok: false, error: "EMAIL NOT CONFIGURED" };
  }

  // 🔒 sicurezza su date
  const date = closure.business_date
    ? closure.business_date.slice(0, 10)
    : "N/D";

  const subject =
    Math.abs(Number(closure.delta || 0)) > 5
      ? `🚨 Delta ${closure.delta}€ | Chiusura ${date}`
      : `Chiusura Cassa ${date}`;

  const body = `
Chiusura Cassa

Data: ${date}
Operatore: ${closure.operator_name || closure.operator_id || "-"}

Teorico: € ${closure.theoretical_base ?? 0}
Dichiarato: € ${closure.declared_total ?? 0}
Delta: € ${closure.delta ?? 0}

Note:
${closure.notes || "-"}

Alert:
${(closure.alert_flags || []).join(", ") || "Nessuno"}
`;

  try {
    await transporter.sendMail({
      from: `"Core Gestionale" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text: body,
    });

    console.log("📧 EMAIL INVIATA:", to);
    return { ok: true };
  } catch (err: any) {
    console.error("❌ ERRORE EMAIL:", err);
    return { ok: false, error: err?.message || "EMAIL ERROR" };
  }
}
