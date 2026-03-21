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

  const subject = `Chiusura Cassa - ${closure.business_date.slice(0, 10)}`;

  const body = `
Chiusura Cassa

Data: ${closure.business_date}
Operatore: ${closure.operator_name || closure.operator_id}

Teorico: € ${closure.theoretical_base}
Dichiarato: € ${closure.declared_total}
Delta: € ${closure.delta}

Note:
${closure.notes || "-"}

Alert:
${(closure.alert_flags || []).join(", ") || "Nessuno"}
`;

  await transporter.sendMail({
    from: `"Core Gestionale" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text: body,
  });

  return { ok: true };
}
