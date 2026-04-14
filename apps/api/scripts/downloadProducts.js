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
  const all = [];
  let start = 0;
  const limit = 100;
  let totalCount = Infinity;

  while (start < totalCount) {
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
    const rows = Array.isArray(data.products) ? data.products : [];
    totalCount = Number(data.totalCount ?? rows.length);

    console.log(
      `➡️ Pagina start=${start}, righe=${rows.length}, totale=${totalCount}`
    );

    if (rows.length === 0) break;

    all.push(...rows);
    start += limit;

    console.log(`📦 Scaricati: ${all.length}`);
  }

  return all;
}

function flattenProducts(products) {
  const rows = [];

  for (const p of products) {
    const productId = String(p?.id || "").trim();
    const productName = String(
      p?.description || p?.descriptionLabel || ""
    ).trim();
    const internalId = String(p?.internalId || "").trim();
    const externalId = String(p?.externalId || "").trim();
    const idSalesPoint = String(p?.idSalesPoint || "").trim();

    const category = String(
      p?.category?.description || p?.category?.descriptionLabel || ""
    ).trim();

    const department = String(
      p?.department?.description || p?.department?.descriptionLabel || ""
    ).trim();

    const productPrice =
      Array.isArray(p?.prices) && p.prices.length
        ? p.prices[0]?.value ?? ""
        : "";

    rows.push({
      type: "PRODUCT",
      productId,
      variantId: "",
      name: productName,
      internalId,
      externalId,
      idSalesPoint,
      barcode: "",
      category,
      department,
      price: productPrice,
    });

    const variants = Array.isArray(p?.variants) ? p.variants : [];

    for (const v of variants) {
      const variantId = String(v?.id || "").trim();
      const variantName = String(
        v?.description || v?.descriptionReceipt || productName || ""
      ).trim();
      const variantInternalId = String(v?.internalId || "").trim();
      const variantExternalId = String(v?.externalId || "").trim();

      const variantPrice =
        Array.isArray(v?.prices) && v.prices.length
          ? v.prices[0]?.value ?? productPrice
          : productPrice;

      const barcodes =
        (Array.isArray(v?.barcodes) && v.barcodes) ||
        (Array.isArray(v?.salesBarcodes) && v.salesBarcodes) ||
        [];

      if (!barcodes.length) {
        rows.push({
          type: "VARIANT",
          productId,
          variantId,
          name: variantName,
          internalId: variantInternalId,
          externalId: variantExternalId,
          idSalesPoint,
          barcode: "",
          category,
          department,
          price: variantPrice,
        });
      } else {
        for (const b of barcodes) {
          rows.push({
            type: "VARIANT",
            productId,
            variantId,
            name: variantName,
            internalId: variantInternalId,
            externalId: variantExternalId,
            idSalesPoint,
            barcode: String(
              b?.barcode || b?.code || b?.value || b || ""
            ).trim(),
            category,
            department,
            price: variantPrice,
          });
        }
      }
    }
  }

  return rows;
}

function saveJSON(products) {
  const file = path.resolve("products.json");
  fs.writeFileSync(file, JSON.stringify(products, null, 2), "utf8");
  console.log(`💾 Salvato JSON in ${file}`);
}

function saveCSV(rows) {
  const headers = [
    "type",
    "productId",
    "variantId",
    "name",
    "internalId",
    "externalId",
    "idSalesPoint",
    "barcode",
    "category",
    "department",
    "price",
  ];

  const csv = [headers, ...rows.map((row) => headers.map((h) => row[h] ?? ""))]
    .map((row) =>
      row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");

  const file = path.resolve("products_flat.csv");
  fs.writeFileSync(file, csv, "utf8");
  console.log(`📊 Salvato CSV in ${file}`);
}

async function main() {
  console.log("🚀 Download catalogo prodotti...");

  const token = await getToken();
  console.log("🔐 Token ottenuto");

  const products = await getAllProducts(token);
  console.log(`✅ Totale prodotti raw: ${products.length}`);

  const flatRows = flattenProducts(products);
  console.log(`🧩 Righe esportabili: ${flatRows.length}`);

  saveJSON(products);
  saveCSV(flatRows);
}

main().catch((err) => {
  console.error("💥 ERRORE:", err.message);
  process.exit(1);
});
