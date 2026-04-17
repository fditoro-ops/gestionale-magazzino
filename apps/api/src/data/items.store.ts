// src/data/items.store.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// da dist/src/data -> ../../../data/items.json
const FILE = path.resolve(__dirname, "../../../data/items.json");

console.log("ITEMS_STORE FILE =", FILE);

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

export function getItemBySku(tenantId: string, sku: string) {
  const items = loadItems([]);

  const normalizedSku = String(sku || "").trim().toUpperCase();

  return (
    items.find((i: any) => {
      const itemSku = String(i.sku || "").trim().toUpperCase();

      // se hai tenant nel JSON
      if (i.tenant_id) {
        return i.tenant_id === tenantId && itemSku === normalizedSku;
      }

      // fallback se non hai tenant salvato
      return itemSku === normalizedSku;
    }) || null
  );
}
