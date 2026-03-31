import fs from "fs";
import path from "path";

const BASE_URL = process.env.CIC_API_BASE_URL || "https://api.cassanova.com";
const API_KEY = process.env.CIC_API_KEY;
const VERSION = process.env.CIC_X_VERSION || "1.0.0";

if (!API_KEY) {
  console.error("❌ Mancante CIC_API_KEY");
  process.exit(1);
}

async function getToken() {
  const res = await fetch(`${BASE_URL}/apikey/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Version": VERSION,
    },
    body: JSON.stringify({
      apiKey: API_KEY,
    }),
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Auth failed: ${res.status} - ${text}`);
  }

  const data = JSON.parse(text);

  if (!data.access_token) {
    throw new Error(`Token mancante nella risposta: ${text}`);
  }

  return data.access_token;
}

async function getAllProducts(token) {
  let all = [];
  let start = 0;
  const limit = 100;

  while (true) {
    const url = `${BASE_URL}/products?start=${start}&limit=${limit}`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Version": VERSION,
      },
    });

    const text = await res.text();

    if (!res.ok) {
      throw new Error(`Products fetch failed: ${res.status} - ${text}`);
    }

    const data = JSON.parse(text);

const rows = data.data?.items || data.data || [];
    
    console.log(
      `➡️ Pagina start=${start}, righe=${rows.length}, totale=${data.totalCount ?? "n/d"}`
    );

    if (rows.length === 0) {
      break;
    }

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
  const headers = ["id", "externalId", "idSalesPoint", "price"];

  const rows = products.map((p) => [
    p.id ?? "",
    p.externalId ?? "",
    p.idSalesPoint ?? "",
    p.prices?.[0]?.value ?? "",
  ]);

  const csv = [headers, ...rows]
    .map((row) =>
      row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");

  const file = path.resolve("products.csv");
  fs.writeFileSync(file, csv);
  console.log(`📊 Salvato CSV in ${file}`);
}

async function main() {
  console.log("🚀 Download catalogo prodotti...");

  const token = await getToken();
  console.log("🔐 Token ottenuto");

  const products = await getAllProducts(token);
  console.log(`✅ Totale prodotti: ${products.length}`);

  saveJSON(products);
  saveCSV(products);
}

main().catch((err) => {
  console.error("💥 ERRORE:", err.message);
  process.exit(1);
});
