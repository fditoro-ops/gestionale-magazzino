import fs from "fs";
import path from "path";

const WRITE_URL = process.env.CIC_PRODUCTS_SHEET_WRITE_URL;
const TAB_NAME = process.env.CIC_PRODUCTS_SHEET_TAB || "PRODOTTI_CIC";
const CSV_PATH = process.env.CIC_MISSING_ACTIONS_CSV || "cic_missing_recipe_actions.csv";
const DRY_RUN = process.env.DRY_RUN === "1";

if (!WRITE_URL && !DRY_RUN) {
  console.error("❌ Mancante CIC_PRODUCTS_SHEET_WRITE_URL");
  process.exit(1);
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"' && inQuotes && next === '"') {
      cur += '"';
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out;
}

function readCsv(filePath) {
  const abs = path.resolve(filePath);

  if (!fs.existsSync(abs)) {
    throw new Error(`CSV non trovato: ${abs}`);
  }

  const raw = fs.readFileSync(abs, "utf8").trim();
  if (!raw) return [];

  const lines = raw.split(/\r?\n/);
  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? "";
    });
    return row;
  });
}

function norm(v) {
  return String(v || "").trim();
}

function buildUpdates(rows) {
  const updates = [];

  for (const row of rows) {
    const decision = norm(row.decision).toUpperCase();
    if (!decision) continue;
    if (decision !== "RECIPE" && decision !== "IGNORE") continue;

    const cicSku = norm(row.cic_external_id);
    const cicName = norm(row.cic_name);
    const recipeSku = norm(row.recipe_sku_to_create_or_link);
    const note = norm(row.note);

    if (!cicSku) {
      console.warn("⚠️ Riga saltata: manca cic_external_id", row);
      continue;
    }

    if (decision === "RECIPE" && !recipeSku) {
      console.warn(`⚠️ Riga saltata: ${cicSku} è RECIPE ma manca recipe_sku_to_create_or_link`);
      continue;
    }

    updates.push({
      cicSku,
      cicName,
      tipoScarico: decision,
      resolvedSku: decision === "RECIPE" ? recipeSku : "",
      note,
    });
  }

  return updates;
}

/**
 * Mappa i campi del CSV nei campi attesi dal tuo endpoint / sheet.
 * Se il tuo Apps Script usa nomi diversi, cambia SOLO qui.
 */
function mapForSheet(updates) {
  return updates.map((u) => ({
    externalId: u.cicSku,
    name: u.cicName,
    tipoScarico: u.tipoScarico,     // RECIPE | IGNORE
    sku: u.resolvedSku,             // SKU ricetta se RECIPE, vuoto se IGNORE
    note: u.note,
  }));
}

/**
 * Questo è l'unico punto che potrebbe richiedere adattamento
 * in base al payload atteso dal tuo CIC_PRODUCTS_SHEET_WRITE_URL.
 */
async function sendUpdates(writeUrl, tabName, rows) {
  const payload = {
    tab: tabName,
    mode: "upsertByExternalId",
    key: "externalId",
    rows,
  };

  const res = await fetch(writeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Write failed: ${res.status} - ${text}`);
  }

  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return data;
}

async function main() {
  console.log("🚀 Applico aggiornamenti a PRODOTTI_CIC...");

  const csvRows = readCsv(CSV_PATH);
  console.log(`📄 Righe CSV lette: ${csvRows.length}`);

  const updates = buildUpdates(csvRows);
  console.log(`🧩 Update validi trovati: ${updates.length}`);

  if (updates.length === 0) {
    console.log("ℹ️ Nessun update da applicare.");
    return;
  }

  const mappedRows = mapForSheet(updates);

  console.log("📌 Anteprima primi 5 update:");
  console.log(mappedRows.slice(0, 5));

  if (DRY_RUN) {
    const out = path.resolve("prodotti_cic_updates.preview.json");
    fs.writeFileSync(out, JSON.stringify(mappedRows, null, 2));
    console.log(`🧪 DRY RUN attivo. Preview salvata in ${out}`);
    return;
  }

  const result = await sendUpdates(WRITE_URL, TAB_NAME, mappedRows);

  console.log("✅ Aggiornamento completato");
  console.log(result);
}

main().catch((err) => {
  console.error("💥 ERRORE:", err.message);
  process.exit(1);
});
