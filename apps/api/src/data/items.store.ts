// src/data/items.store.ts
import { pool } from "../db.js";

export async function getItemBySku(_tenantId: string, sku: string) {
  const normalizedSku = String(sku || "").trim().toUpperCase();

  const result = await pool.query(
    `
    SELECT
      id,
      sku,
      name,
      active
    FROM "Item"
    WHERE UPPER(sku) = $1
    LIMIT 1
    `,
    [normalizedSku]
  );

  return result.rows[0] || null;
}
