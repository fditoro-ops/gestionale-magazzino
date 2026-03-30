// apps/api/scripts/downloadProducts.js
import fs from "fs";
import path from "path";

const BASE_URL = process.env.CIC_API_BASE_URL || "https://api.cassanova.com";
const API_KEY = process.env.CIC_API_KEY;
const VERSION = process.env.CIC_X_VERSION || "1.0.0";

if (!API_KEY) {
  console.error("❌ Mancante CIC_API_KEY");
  process.exit(1);
}

async function getAllProducts() {
  let all = [];
  let start = 0;
  const limit = 100;

  while (true) {
    const url = `${BASE_URL}/products?start=${start}&limit=${limit}`;

    const res = await fetch(url, {
      headers: {
        "X-Api-Key": API_KEY,
        "X-Version": VERSION,
      },
    });

    if (!res.ok) {
      throw new Error(`Products fetch failed: ${res.status}`);
    }

    const data = await res.json();
    const rows = data.data || [];

    if (rows.length === 0) break;

    all.push(...rows);
    start += limit;

    console.log(`📦 Scaricati: ${all.length}`);
  }

  return all;
}

function saveJSON(products) {
  const file = path.resolve("products.json");
  fs.writeFileSync(file, JSON.stringify(products, null, 2));
  console.log(`💾 Salvato JSON in ${file}`);
}

function saveCSV(products) {
  const headers = ["id", "name", "barcode", "price"];
  const rows = products.map((p) => [
    p.id,
    p.name,
    p.barcode || "",
    p.price || "",
  ]);

  const csv = [headers, ...rows]
    .map((r) => r.map((x) => `"${x}"`).join(","))
    .join("\n");

  const file = path.resolve("products.csv");
  fs.writeFileSync(file, csv);
  console.log(`📊 Salvato CSV in ${file}`);
}

async function main() {
  console.log("🚀 Download catalogo prodotti...");

  const products = await getAllProducts();

  console.log(`✅ Totale prodotti: ${products.length}`);

  saveJSON(products);
  saveCSV(products);
}

main().catch((err) => {
  console.error("💥 ERRORE:", err.message);
});
