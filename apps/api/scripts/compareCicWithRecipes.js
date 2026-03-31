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

async function loadRecipes() {
  const sql = `
    SELECT
      id,
      product_sku,
      name,
      status
    FROM recipes
    ORDER BY product_sku ASC
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

function buildReport(cicProducts, recipes) {
  const recipesBySku = new Map();

  for (const recipe of recipes) {
    const key = norm(recipe.product_sku);
    if (key) recipesBySku.set(key, recipe);
  }

  const rows = [];
  const matchedRecipeSkus = new Set();

  for (const product of cicProducts) {
    const cicId = product.id ?? "";
    const cicSku = extractCicSku(product);
    const cicName = extractCicName(product);

    const recipe = cicSku ? recipesBySku.get(cicSku) : null;

    if (recipe) {
      matchedRecipeSkus.add(norm(recipe.product_sku));
      rows.push({
        cic_id: cicId,
        cic_external_id: cicSku,
        cic_name: cicName,
        recipe_id: recipe.id ?? "",
        recipe_product_sku: recipe.product_sku ?? "",
        recipe_name: recipe.name ?? "",
        recipe_status: recipe.status ?? "",
        match_type: "MATCH_BY_RECIPE_SKU",
      });
    } else {
      rows.push({
        cic_id: cicId,
        cic_external_id: cicSku,
        cic_name: cicName,
        recipe_id: "",
        recipe_product_sku: "",
        recipe_name: "",
        recipe_status: "",
        match_type: "NO_MATCH_IN_RECIPES",
      });
    }
  }

  for (const recipe of recipes) {
    const key = norm(recipe.product_sku);
    if (!matchedRecipeSkus.has(key)) {
      rows.push({
        cic_id: "",
        cic_external_id: "",
        cic_name: "",
        recipe_id: recipe.id ?? "",
        recipe_product_sku: recipe.product_sku ?? "",
        recipe_name: recipe.name ?? "",
        recipe_status: recipe.status ?? "",
        match_type: "RECIPE_ONLY",
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
    "recipe_id",
    "recipe_product_sku",
    "recipe_name",
    "recipe_status",
    "match_type",
  ];

  const csv = [headers, ...rows.map((row) => headers.map((h) => row[h] ?? ""))]
    .map((row) =>
      row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");

  const out = path.resolve("cic_recipe_match_report.csv");
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
  const matched = rows.filter((r) => r.match_type === "MATCH_BY_RECIPE_SKU").slice(0, 10);
  const missing = rows.filter((r) => r.match_type === "NO_MATCH_IN_RECIPES").slice(0, 10);

  console.log("\n✅ Esempi MATCH_BY_RECIPE_SKU:");
  for (const row of matched) {
    console.log(`- CIC ${row.cic_external_id} -> RICETTA ${row.recipe_product_sku} | ${row.recipe_name}`);
  }

  console.log("\n❌ Esempi NO_MATCH_IN_RECIPES:");
  for (const row of missing) {
    console.log(`- CIC ${row.cic_external_id} | ${row.cic_name}`);
  }
}

async function main() {
  console.log("🚀 Confronto CIC vs Ricette...");

  const cicProducts = loadCicProducts();
  console.log(`📦 Prodotti CIC caricati: ${cicProducts.length}`);

  const recipes = await loadRecipes();
  console.log(`📚 Ricette caricate: ${recipes.length}`);

  const rows = buildReport(cicProducts, recipes);

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
