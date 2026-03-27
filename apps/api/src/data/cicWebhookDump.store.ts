import { pool } from "../db.js";

export async function appendCicWebhookDump(dump: any) {
  await pool.query(
    `
    INSERT INTO cic_webhook_dumps (
      operation,
      headers,
      payload
    )
    VALUES ($1, $2, $3)
    `,
    [
      dump.operation,
      dump.headers,
      dump
    ]
  );

  console.log("🧠 CIC DUMP salvato su DB");
}
