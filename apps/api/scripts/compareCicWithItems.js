// apps/api/scripts/compareCicWithItems.js
import fs from "fs";
import path from "path";
import { pool } from "../dist/src/db.js";

function normalize(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function normalizeSku(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

async function loadCoreItems() {
  const sql = `
    SELECT
      id,
      sku,
      name,
      "supplierId",
      supplier,
      category,
      brand,
      active
    FROM "Item"
    ORDER BY sku ASC
  `;

  const result = await pool.query(sql);
  return result.rows;
}

function loadCicProducts() {
  const file = path.resolve("products.json");

  if (!fs.existsSync(file)) {
    throw new Error(`File non trovato: ${file}`);
  }

  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function buildReport(cicProducts, coreItems) {
  const coreBySku = new Map();
  const coreByName = new Map();

  for (const item of coreItems) {
    const skuKey = normalizeSku(item.sku);
    const nameKey = normalize(item.name);

    if (skuKey) coreBySku.set(skuKey, item);
    if (nameKey && !coreByName.has(nameKey)) coreByName.set(nameKey, item);
  }

  const rows = [];

  for (const p of cicProducts) {
    const cicId = p.id ?? "";
    const cicExternalId = p.externalId ?? p.externalid ?? "";
    const cicName =
      p.description ??
      p.name ??
      p.value ??
      p.label ??
      "";
    const cicPrice = p.prices?.[0]?.value ?? "";

    const extKey = normalizeSku(cicExternalId);
    const nameKey = normalize(cicName);

    let matchType = "NO_MATCH";
    let matchedItem = null;

    if (extKey && coreBySku.has(extKey)) {
      matchType = "MATCH_BY_EXTERNAL_ID";
      matchedItem = coreBySku.get(extKey);
    } else if (nameKey && coreByName.has(nameKey)) {
      matchType = "POSSIBLE_MATCH_BY_NAME";
      matchedItem = coreByName.get(nameKey);
    }

    rows.push({
      cic_id: cicId,
      cic_external_id: cicExternalId,
      cic_name: cicName,
      cic_price: cicPrice,
      core_sku: matchedItem?.sku ?? "",
      core_name: matchedItem?.name ?? "",
      match_type: matchType,
    });
  }

  const matchedCoreSkus = new Set(
    rows.filter((r) => r.core_sku).map((r) => normalizeSku(r.core_sku))
  );

  for (const item of coreItems) {
    const skuKey = normalizeSku(item.sku);
    if (!matchedCoreSkus.has(skuKey)) {
      rows.push({
        cic_id: "",
        cic_external_id: "",
        cic_name: "",
        cic_price: "",
        core_sku: item.sku ?? "",
        core_name: item.name ?? "",
        match_type: "CORE_ONLY",
      });
    }
  }

  return rows;
}

function saveCsv(rows) {
  const headers = [
    "cic_id",
    "cic_external_id",
    "cic_name",
    "cic_price",
    "core_sku",
    "core_name",
    "match_type",
  ];

  const csv = [headers, ...rows.map((r) => headers.map((h) => r[h] ?? ""))]
    .map((row) =>
      row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");

  const out = path.resolve("cic_core_match_report.csv");
  fs.writeFileSync(out, csv);
  console.log(`📊 Report salvato in ${out}`);
}

async function main() {
  console.log("🚀 Confronto CIC vs Core...");

  const cicProducts = loadCicProducts();
  console.log(`📦 Prodotti CIC caricati: ${cicProducts.length}`);

  const coreItems = await loadCoreItems();
  console.log(`📚 Articoli Core caricati: ${coreItems.length}`);

  const report = buildReport(cicProducts, coreItems);

  const summary = report.reduce((acc, row) => {
    acc[row.match_type] = (acc[row.match_type] || 0) + 1;
    return acc;
  }, {});

  console.log("📈 Summary:", summary);

  saveCsv(report);

  await pool.end();
}

main().catch(async (err) => {
  console.error("💥 ERRORE:", err.message);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
