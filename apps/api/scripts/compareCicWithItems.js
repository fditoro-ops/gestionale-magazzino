import fs from "fs";
import path from "path";
import { pool } from "../dist/src/db.js";

function norm(value) {
  return String(value || "").trim().toUpperCase();
}

function loadCicProducts() {
  const file = path.resolve("products.json");

  if (!fs.existsSync(file)) {
    throw new Error(`File non trovato: ${file}`);
  }

  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function loadCoreItems() {
  const sql = `
    SELECT
      id,
      sku,
      name,
      active
    FROM "Item"
    ORDER BY sku ASC
  `;

  const result = await pool.query(sql);
  return result.rows;
}

function extractCicSku(product) {
  return norm(product.externalId ?? product.externalid ?? "");
}

function extractCicName(product) {
  return String(
    product.description ??
      product.name ??
      product.label ??
      product.value ??
      ""
  ).trim();
}

function extractCicPrice(product) {
  return product.prices?.[0]?.value ?? "";
}

function buildReport(cicProducts, coreItems) {
  const coreBySku = new Map();

  for (const item of coreItems) {
    const key = norm(item.sku);
    if (key) coreBySku.set(key, item);
  }

  const reportRows = [];
  const matchedCoreSkus = new Set();

  for (const product of cicProducts) {
    const cicId = product.id ?? "";
    const cicSku = extractCicSku(product);
    const cicName = extractCicName(product);
    const cicPrice = extractCicPrice(product);

    const matchedItem = cicSku ? coreBySku.get(cicSku) : null;

    if (matchedItem) {
      matchedCoreSkus.add(norm(matchedItem.sku));
      reportRows.push({
        cic_id: cicId,
        cic_external_id: cicSku,
        cic_name: cicName,
        cic_price: cicPrice,
        core_sku: matchedItem.sku ?? "",
        core_name: matchedItem.name ?? "",
        core_active: matchedItem.active,
        match_type: "MATCH_BY_SKU",
      });
    } else {
      reportRows.push({
        cic_id: cicId,
        cic_external_id: cicSku,
        cic_name: cicName,
        cic_price: cicPrice,
        core_sku: "",
        core_name: "",
        core_active: "",
        match_type: "NO_MATCH_IN_CORE",
      });
    }
  }

  for (const item of coreItems) {
    const skuKey = norm(item.sku);
    if (!matchedCoreSkus.has(skuKey)) {
      reportRows.push({
        cic_id: "",
        cic_external_id: "",
        cic_name: "",
        cic_price: "",
        core_sku: item.sku ?? "",
        core_name: item.name ?? "",
        core_active: item.active,
        match_type: "CORE_ONLY",
      });
    }
  }

  return reportRows;
}

function saveCsv(rows) {
  const headers = [
    "cic_id",
    "cic_external_id",
    "cic_name",
    "cic_price",
    "core_sku",
    "core_name",
    "core_active",
    "match_type",
  ];

  const csv = [headers, ...rows.map((row) => headers.map((h) => row[h] ?? ""))]
    .map((row) =>
      row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");

  const out = path.resolve("cic_core_match_report.csv");
  fs.writeFileSync(out, csv);
  console.log(`📊 Report salvato in ${out}`);
}

function printSummary(rows) {
  const summary = rows.reduce((acc, row) => {
    acc[row.match_type] = (acc[row.match_type] || 0) + 1;
    return acc;
  }, {});

  console.log("📈 Summary:", summary);
}

function printSamples(rows) {
  const matched = rows.filter((r) => r.match_type === "MATCH_BY_SKU").slice(0, 10);
  const missing = rows.filter((r) => r.match_type === "NO_MATCH_IN_CORE").slice(0, 10);

  console.log("\n✅ Esempi MATCH_BY_SKU:");
  for (const row of matched) {
    console.log(`- CIC ${row.cic_external_id} -> CORE ${row.core_sku} | ${row.core_name}`);
  }

  console.log("\n❌ Esempi NO_MATCH_IN_CORE:");
  for (const row of missing) {
    console.log(`- CIC ${row.cic_external_id} | ${row.cic_name}`);
  }
}

async function main() {
  console.log("🚀 Confronto CIC vs Core per SKU...");

  const cicProducts = loadCicProducts();
  console.log(`📦 Prodotti CIC caricati: ${cicProducts.length}`);

  const coreItems = await loadCoreItems();
  console.log(`📚 Articoli Core caricati: ${coreItems.length}`);

  const rows = buildReport(cicProducts, coreItems);

  printSummary(rows);
  printSamples(rows);
  saveCsv(rows);

  await pool.end();
}

main().catch(async (err) => {
  console.error("💥 ERRORE:", err.message);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
