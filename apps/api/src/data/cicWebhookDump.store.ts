import fs from "fs";
import path from "path";

const FILE = path.resolve(process.cwd(), "apps/api/data/cic-webhook-dumps.json");

export function loadCicWebhookDumps(defaultRows: any[] = []) {
  try {
    if (!fs.existsSync(FILE)) return defaultRows;
    const raw = fs.readFileSync(FILE, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : defaultRows;
  } catch {
    return defaultRows;
  }
}

export function saveCicWebhookDumps(rows: any[]) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(rows, null, 2), "utf-8");
}

export function appendCicWebhookDump(row: any) {
  const rows = loadCicWebhookDumps([]);
  rows.push(row);

  // tieni solo gli ultimi 500 dump per non gonfiare troppo il file
  const trimmed = rows.slice(-500);

  saveCicWebhookDumps(trimmed);
}
