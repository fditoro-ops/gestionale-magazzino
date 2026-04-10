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

    return data.filter((item) => {
      // ✅ tieni SOLO materie prime se campo esiste
      if (item.is_raw_material === true) return true;

      // ❌ elimina UUID (prodotti CIC)
      if (/^[0-9a-f-]{36}$/.test(item.sku)) return false;

      // ❌ elimina record senza nome valido
      if (!item.name || item.name.length < 3) return false;

      // fallback: tienilo
      return true;
    });

  } catch (err) {
    console.error("❌ loadItems error:", err);
    return defaultItems;
  }
}
