import fs from "fs";
import path from "path";

const BASE_URL = process.env.CIC_API_BASE_URL || "https://api.cassanova.com";
const API_KEY = process.env.CIC_API_KEY;
const VERSION = process.env.CIC_X_VERSION || "1.0.0";

if (!API_KEY) {
  console.error("❌ Mancante CIC_API_KEY");
  process.exit(1);
}

const variants = [
  {
    name: "X-Api-Key",
    headers: {
      "X-Api-Key": API_KEY,
      "X-Version": VERSION,
    },
  },
  {
    name: "apikey",
    headers: {
      apikey: API_KEY,
      "X-Version": VERSION,
    },
  },
  {
    name: "Authorization Bearer",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "X-Version": VERSION,
    },
  },
  {
    name: "Authorization ApiKey",
    headers: {
      Authorization: `ApiKey ${API_KEY}`,
      "X-Version": VERSION,
    },
  },
  {
    name: "x-api-key lowercase",
    headers: {
      "x-api-key": API_KEY,
      "X-Version": VERSION,
    },
  },
];

async function testVariant(variant) {
  const url = `${BASE_URL}/products?start=0&limit=5`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: variant.headers,
    });

    const text = await res.text();

    console.log(`\n==============================`);
    console.log(`TEST: ${variant.name}`);
    console.log(`STATUS: ${res.status}`);
    console.log(`HEADERS:`, variant.headers);
    console.log(`BODY: ${text.slice(0, 1000)}`);

    return { ok: res.ok, status: res.status, body: text };
  } catch (err) {
    console.log(`\n==============================`);
    console.log(`TEST: ${variant.name}`);
    console.log(`ERRORE FETCH: ${err.message}`);
    return { ok: false, status: 0, body: err.message };
  }
}

async function main() {
  console.log("🚀 Diagnostica CIC /products");

  for (const variant of variants) {
    const result = await testVariant(variant);

    if (result.ok) {
      console.log(`\n✅ Variante funzionante: ${variant.name}`);
      return;
    }
  }

  console.log("\n❌ Nessuna variante ha funzionato.");
}

main().catch((err) => {
  console.error("💥 ERRORE FATALE:", err.message);
});
