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

function esc(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function alertLabel(code: string) {
  switch (code) {
    case "MISSING_RECEIPT_IMAGE":
      return "Foto scontrino mancante";
    case "DELTA_OVER_THRESHOLD":
      return "Delta oltre soglia";
    case "ALL_VALUES_ZERO":
      return "Tutti i valori a zero";
    case "DECLARED_ZERO_WITH_THEORETICAL":
      return "Dichiarato zero con teorico > 0";
    default:
      return code;
  }
}

function buildDeltaTone(delta: number) {
  if (delta === 0) {
    return {
      color: "#166534",
      bg: "#DCFCE7",
      border: "#BBF7D0",
      label: "OK",
    };
  }

  if (Math.abs(delta) <= 5) {
    return {
      color: "#B45309",
      bg: "#FEF3C7",
      border: "#FDE68A",
      label: "ATTENZIONE",
    };
  }

  return {
    color: "#B91C1C",
    bg: "#FEE2E2",
    border: "#FECACA",
    label: "DELTA",
  };
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
  const theoreticalBase = Number(closure?.theoretical_base ?? 0);
  const cashDeclared = Number(closure?.cash_declared ?? 0);
  const cardDeclared = Number(closure?.card_declared ?? 0);
  const satispayDeclared = Number(closure?.satispay_declared ?? 0);
  const otherDeclared = Number(closure?.other_declared ?? 0);
  const declaredTotal = Number(closure?.declared_total ?? 0);
  const delta = Number(closure?.delta ?? 0);
  const notes = closure?.notes || "-";
  const alerts = Array.isArray(closure?.alert_flags) ? closure.alert_flags : [];
  const receiptImageUrl = closure?.receipt_image_url || null;

  const deltaTone = buildDeltaTone(delta);

  const subject =
    Math.abs(delta) > 5
      ? `🚨 Delta ${euro(delta)} | Chiusura ${date}`
      : `Chiusura Cassa ${date}`;

  const alertsHtml = alerts.length
    ? alerts
        .map(
          (a: string) => `
            <span style="
              display:inline-block;
              margin:0 8px 8px 0;
              padding:7px 12px;
              border-radius:999px;
              font-size:12px;
              font-weight:700;
              background:#FEF3C7;
              color:#92400E;
              border:1px solid #FDE68A;
            ">
              ${esc(alertLabel(a))}
            </span>
          `
        )
        .join("")
    : `<span style="color:#486581;">Nessuno</span>`;

  const receiptBlock = receiptImageUrl
    ? `
      <div style="
        margin-top:20px;
        border:1px solid #D9E2EC;
        border-radius:16px;
        background:#FFFFFF;
        overflow:hidden;
      ">
        <div style="
          padding:14px 16px;
          background:#F8FBFC;
          border-bottom:1px solid #D9E2EC;
          font-size:16px;
          font-weight:800;
          color:#243B53;
        ">
          Scontrino
        </div>

        <div style="padding:16px;">
          <div style="margin-bottom:12px;">
            <a
              href="${esc(receiptImageUrl)}"
              target="_blank"
              rel="noreferrer"
              style="
                color:#0B7285;
                text-decoration:none;
                font-weight:800;
              "
            >
              Apri immagine
            </a>
          </div>

          <img
            src="${esc(receiptImageUrl)}"
            alt="Scontrino"
            style="
              width:100%;
              max-width:900px;
              border-radius:12px;
              border:1px solid #D9E2EC;
              display:block;
            "
          />
        </div>
      </div>
    `
    : `
      <div style="
        margin-top:20px;
        border:1px solid #F7D070;
        border-radius:16px;
        background:#FFF8E8;
        padding:14px 16px;
        color:#8D5E00;
        font-size:14px;
        font-weight:700;
      ">
        Foto scontrino non presente
      </div>
    `;

  const html = `
  <!DOCTYPE html>
  <html lang="it">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Chiusura Cassa</title>
    </head>
    <body style="
      margin:0;
      padding:24px;
      background:#EEF4F7;
      font-family:Arial, Helvetica, sans-serif;
      color:#243B53;
    ">
      <div style="
        max-width:980px;
        margin:0 auto;
      ">
        <div style="
          background:#1451A6;
          color:#FFFFFF;
          border-radius:18px 18px 0 0;
          padding:22px 24px 16px 24px;
          box-shadow:0 10px 30px rgba(20,81,166,0.18);
        ">
          <div style="
            font-size:34px;
            font-weight:800;
            line-height:1.1;
            margin-bottom:8px;
          ">
            Chiusura Cassa
          </div>

          <div style="
            font-size:18px;
            line-height:1.5;
            font-weight:700;
            opacity:0.98;
          ">
            Data: ${esc(date)} · Operatore: ${esc(operator)}
          </div>
        </div>

        <div style="
          background:#FFFFFF;
          border:1px solid #D9E2EC;
          border-top:none;
          border-radius:0 0 18px 18px;
          padding:18px;
          box-shadow:0 10px 24px rgba(15,23,42,0.06);
        ">
          <div style="
            display:block;
            margin-bottom:18px;
          ">
            <div style="
              display:inline-block;
              padding:8px 14px;
              border-radius:999px;
              background:${deltaTone.bg};
              color:${deltaTone.color};
              border:1px solid ${deltaTone.border};
              font-size:13px;
              font-weight:800;
            ">
              ${esc(deltaTone.label)} · Delta ${esc(euro(delta))}
            </div>
          </div>

          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;border-spacing:0 14px;">
            <tr>
              <td valign="top" style="width:50%;padding-right:8px;">
                <div style="
                  border:1px solid #D9E2EC;
                  border-radius:16px;
                  background:#F8FBFC;
                  padding:18px;
                  min-height:140px;
                ">
                  <div style="
                    font-size:14px;
                    color:#627D98;
                    font-weight:800;
                    margin-bottom:10px;
                    text-transform:uppercase;
                    letter-spacing:0.03em;
                  ">
                    Totali
                  </div>

                  <div style="font-size:17px; line-height:1.9;">
                    <div><strong>Teorico:</strong> ${esc(euro(theoreticalBase))}</div>
                    <div><strong>Dichiarato:</strong> ${esc(euro(declaredTotal))}</div>
                    <div>
                      <strong>Differenza:</strong>
                      <span style="color:${deltaTone.color}; font-weight:800;">
                        ${esc(euro(delta))}
                      </span>
                    </div>
                  </div>
                </div>
              </td>

              <td valign="top" style="width:50%;padding-left:8px;">
                <div style="
                  border:1px solid #D9E2EC;
                  border-radius:16px;
                  background:#F8FBFC;
                  padding:18px;
                  min-height:140px;
                ">
                  <div style="
                    font-size:14px;
                    color:#627D98;
                    font-weight:800;
                    margin-bottom:10px;
                    text-transform:uppercase;
                    letter-spacing:0.03em;
                  ">
                    Note e alert
                  </div>

                  <div style="
                    font-size:16px;
                    line-height:1.6;
                    margin-bottom:12px;
                  ">
                    ${esc(notes)}
                  </div>

                  <div>
                    ${alertsHtml}
                  </div>
                </div>
              </td>
            </tr>
          </table>

          <div style="
            border:1px solid #D9E2EC;
            border-radius:16px;
            overflow:hidden;
            background:#FFFFFF;
            margin-top:8px;
          ">
            <div style="
              background:#EEF2F6;
              color:#627D98;
              font-size:14px;
              font-weight:800;
              text-transform:uppercase;
              letter-spacing:0.03em;
              padding:12px 16px;
              border-bottom:1px solid #D9E2EC;
            ">
              Metodi di pagamento
            </div>

            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
              <thead>
                <tr>
                  <th align="left" style="padding:14px 16px;border-bottom:1px solid #D9E2EC;color:#627D98;font-size:13px;">Metodo</th>
                  <th align="right" style="padding:14px 16px;border-bottom:1px solid #D9E2EC;color:#627D98;font-size:13px;">Dichiarato</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="padding:14px 16px;border-bottom:1px solid #EEF2F6;font-weight:700;">Contanti</td>
                  <td align="right" style="padding:14px 16px;border-bottom:1px solid #EEF2F6;">${esc(euro(cashDeclared))}</td>
                </tr>
                <tr>
                  <td style="padding:14px 16px;border-bottom:1px solid #EEF2F6;font-weight:700;">Carte</td>
                  <td align="right" style="padding:14px 16px;border-bottom:1px solid #EEF2F6;">${esc(euro(cardDeclared))}</td>
                </tr>
                <tr>
                  <td style="padding:14px 16px;border-bottom:1px solid #EEF2F6;font-weight:700;">Satispay</td>
                  <td align="right" style="padding:14px 16px;border-bottom:1px solid #EEF2F6;">${esc(euro(satispayDeclared))}</td>
                </tr>
                <tr>
                  <td style="padding:14px 16px;font-weight:700;">Altri</td>
                  <td align="right" style="padding:14px 16px;">${esc(euro(otherDeclared))}</td>
                </tr>
              </tbody>
            </table>
          </div>

          ${receiptBlock}
        </div>
      </div>
    </body>
  </html>
  `;

  const text = `
Chiusura Cassa

Data: ${date}
Operatore: ${operator}

Teorico: ${euro(theoreticalBase)}
Dichiarato: ${euro(declaredTotal)}
Differenza: ${euro(delta)}

Metodi:
- Contanti: ${euro(cashDeclared)}
- Carte: ${euro(cardDeclared)}
- Satispay: ${euro(satispayDeclared)}
- Altri: ${euro(otherDeclared)}

Note:
${notes}

Alert:
${alerts.length ? alerts.map(alertLabel).join(", ") : "Nessuno"}

Scontrino:
${receiptImageUrl || "Non presente"}
`.trim();

  try {
    await transporter.sendMail({
      from: `"Core Gestionale" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      html,
    });

    console.log("📧 EMAIL INVIATA:", to);
    console.log("📧 CASH CLOSURE DATA:", {
      date,
      operator,
      theoreticalBase,
      declaredTotal,
      delta,
      cashDeclared,
      cardDeclared,
      satispayDeclared,
      otherDeclared,
      receiptImageUrl,
      alerts,
    });

    return { ok: true };
  } catch (err: any) {
    console.error("❌ ERRORE EMAIL:", err);
    return { ok: false, error: err?.message || "EMAIL ERROR" };
  }
}
