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

    // 🔥 FILTRO QUI
    return data.filter((item) => item.is_raw_material === true);

  } catch {
    return defaultItems;
  }
}
