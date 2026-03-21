export async function sendCashClosureEmail(closure: any) {
  try {
    const subject = `Chiusura Cassa - ${closure.business_date?.slice(0, 10)}`;

    const body = `
Chiusura Cassa

Data: ${closure.business_date}
Operatore: ${closure.operator_name || closure.operator_id}

Teorico: ${closure.theoretical_base}
Dichiarato: ${closure.declared_total}
Delta: ${closure.delta}

Note:
${closure.notes || "-"}

Alert:
${(closure.alert_flags || []).join(", ") || "Nessuno"}
`;

    console.log("📧 CASH CLOSURE EMAIL (STUB)");
    console.log("TO:", process.env.CASH_CLOSURE_EMAIL_TO || "NOT SET");
    console.log("SUBJECT:", subject);
    console.log("BODY:", body);
    console.log("RECEIPT:", closure.receipt_image_url);

    return { ok: true };
  } catch (err: any) {
    console.error("❌ EMAIL ERROR:", err);
    return { ok: false, error: err?.message || "EMAIL ERROR" };
  }
}
