// src/data/items.store.ts
import fs from "fs";
import path from "path";

const ITEMS_FILE = path.resolve(process.cwd(), "apps/api/data/items.json");

export function saveItems(items: any[]) {
  fs.writeFileSync(ITEMS_FILE, JSON.stringify(items, null, 2), "utf-8");
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
