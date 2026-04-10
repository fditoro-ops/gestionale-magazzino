import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// se lo script sta in apps/api/scripts
const ITEMS_FILE = path.resolve(__dirname, "../data/items.json");
const BACKUP_DIR = path.resolve(__dirname, "../data/backups");
const LOG_DIR = path.resolve(__dirname, "../data/logs");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AnyItem = {
  sku?: string;
  name?: string;
  brand?: string;
  supplier?: string;
  category?: string;
  categoryId?: string;
  active?: boolean;
  [key: string]: unknown;
};

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function isDirtyItem(item: AnyItem): boolean {
  const sku = String(item?.sku ?? "").trim();
  const name = String(item?.name ?? "").trim();

  if (!sku) return true;
  if (UUID_RE.test(sku)) return true;
  if (!name || name.length < 3) return true;

  return false;
}

function classifyDirtyReason(item: AnyItem): string[] {
  const reasons: string[] = [];
  const sku = String(item?.sku ?? "").trim();
  const name = String(item?.name ?? "").trim();

  if (!sku) reasons.push("MISSING_SKU");
  if (UUID_RE.test(sku)) reasons.push("UUID_SKU");
  if (!name || name.length < 3) reasons.push("INVALID_NAME");

  return reasons;
}

function main() {
  const mode = process.argv.includes("--apply") ? "apply" : "dry-run";

  if (!fs.existsSync(ITEMS_FILE)) {
    console.error("❌ File items.json non trovato:", ITEMS_FILE);
    process.exit(1);
  }

  ensureDir(BACKUP_DIR);
  ensureDir(LOG_DIR);

  const raw = fs.readFileSync(ITEMS_FILE, "utf-8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    console.error("❌ items.json non contiene un array.");
    process.exit(1);
  }

  const items = parsed as AnyItem[];

  const cleanItems: AnyItem[] = [];
  const dirtyItems: Array<
    AnyItem & { __index: number; __reasons: string[] }
  > = [];

  items.forEach((item, index) => {
    const reasons = classifyDirtyReason(item);

    if (reasons.length > 0) {
      dirtyItems.push({
        ...item,
        __index: index,
        __reasons: reasons,
      });
      return;
    }

    cleanItems.push(item);
  });

  const stamp = nowStamp();

  const summary = {
    mode,
    file: ITEMS_FILE,
    totalBefore: items.length,
    totalDirty: dirtyItems.length,
    totalAfter: cleanItems.length,
    dirtyByReason: dirtyItems.reduce<Record<string, number>>((acc, item) => {
      item.__reasons.forEach((r) => {
        acc[r] = (acc[r] || 0) + 1;
      });
      return acc;
    }, {}),
    sampleDirty: dirtyItems.slice(0, 30).map((item) => ({
      index: item.__index,
      sku: item.sku ?? null,
      name: item.name ?? null,
      reasons: item.__reasons,
    })),
  };

  const logFile = path.join(LOG_DIR, `clean-items-${stamp}.json`);
  fs.writeFileSync(logFile, JSON.stringify(summary, null, 2), "utf-8");

  console.log("🧹 CLEAN ITEMS SUMMARY");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`📝 Log salvato in: ${logFile}`);

  if (mode === "dry-run") {
    console.log("ℹ️ Dry-run completato. Nessuna modifica applicata.");
    console.log("ℹ️ Per applicare davvero: npm run clean:items -- --apply");
    return;
  }

  const backupFile = path.join(BACKUP_DIR, `items-${stamp}.backup.json`);
  fs.writeFileSync(backupFile, raw, "utf-8");

  fs.writeFileSync(ITEMS_FILE, JSON.stringify(cleanItems, null, 2), "utf-8");

  console.log(`💾 Backup creato in: ${backupFile}`);
  console.log(`✅ Pulizia applicata. Nuovi items salvati in: ${ITEMS_FILE}`);
}

main();
