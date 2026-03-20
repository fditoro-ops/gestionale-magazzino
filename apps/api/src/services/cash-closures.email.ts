import type { CashClosure } from "../types/cash-closure.js";

function euro(n: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}

export async function sendCashClosureEmail(input: {
  closure: CashClosure;
}) {
  const { closure } = input;

  const subject = `Chiusura cassa ${closure.business_date} - ${closure.operator_name ?? "Operatore"}`;

  const body = `
Chiusura cassa completata.

Data: ${closure.business_date}
Operatore: ${closure.operator_name ?? "-"}
Teorico base: ${euro(closure.theoretical_base)}
Contanti: ${euro(closure.cash_declared)}
Carte: ${euro(closure.card_declared)}
Satispay: ${euro(closure.satispay_declared)}
Altri: ${euro(closure.other_declared)}
Totale dichiarato: ${euro(closure.declared_total)}
Delta: ${euro(closure.delta)}

Note:
${closure.notes ?? "-"}
  `.trim();

  console.log("📧 CASH CLOSURE EMAIL");
  console.log({ subject, body, receipt: closure.receipt_image_url });

  // TODO:
  // integra qui il tuo servizio reale email
  // es:
  // await sendMail({
  //   to: process.env.CASH_CLOSURE_EMAIL_TO,
  //   subject,
  //   text: body,
  //   attachments: closure.receipt_image_url ? [...] : [],
  // });

  return { ok: true };
}
