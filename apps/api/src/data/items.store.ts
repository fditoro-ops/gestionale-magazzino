// src/data/items.store.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// percorso stabile indipendente dalla working directory
const FILE = path.resolve(__dirname, "../../data/items.json");

console.log("ITEMS_STORE FILE =", FILE);

export function saveItems(items: any[]) {
  fs.writeFileSync(FILE, JSON.stringify(items, null, 2), "utf-8");
}

export function loadItems(defaultItems: any[] = []) {
  try {
    if (!fs.existsSync(FILE)) return defaultItems;
    const raw = fs.readFileSync(FILE, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : defaultItems;
  } catch {
    return defaultItems;
  }
}
