// src/data/items.store.ts
import { pool } from "../db.js";

export async function getItemBySku(tenantId: string, sku: string) {
  const normalizedSku = String(sku || "").trim().toUpperCase();

  const result = await pool.query(
    `
    SELECT
      id,
      sku,
      name,
      active,
      tenant_id
    FROM "Item"
    WHERE tenant_id = $1
      AND UPPER(sku) = $2
    LIMIT 1
    `,
    [tenantId, normalizedSku]
  );

  return result.rows[0] || null;
}
