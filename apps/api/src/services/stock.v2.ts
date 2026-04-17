// src/data/items.store.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// da dist/src/data -> ../../../data/items.json
const FILE = path.resolve(__dirname, "../../../data/items.json");

export function loadItems(defaultItems: any[] = []) {
  try {
    if (!fs.existsSync(FILE)) return defaultItems;

    const raw = fs.readFileSync(FILE, "utf-8");
    const data = JSON.parse(raw);

    if (!Array.isArray(data)) return defaultItems;

    return data;
  } catch (err) {
    console.error("loadItems error:", err);
    return defaultItems;
  }
}

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
