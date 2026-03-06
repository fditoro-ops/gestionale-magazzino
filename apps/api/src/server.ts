import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import basicAuth from "express-basic-auth";
import fs from "fs";
import crypto from "crypto";

import movementsRouter from "./routes/movements.js";
import stockV2Router from "./routes/stock.v2.js";
import itemsRouter from "./routes/items.js";
import ordersRouter from "./routes/orders.js";

import { applyRecipeStock } from "./services/recipeStock.service.js";
import { upsertUnresolved, listUnresolved } from "./data/cicUnresolved.store.js";

/* =========================
   BOM (Google Sheet) Reader
   ========================= */

type BomLine = { ingredientSku: string; qty: number; um: string };
type BomMap = Record<string, BomLine[]>;

type CicProductMode = "RECIPE" | "IGNORE";
type CicProductMap = Record<string, {
  sku: string;
  mode: CicProductMode;
}>;

let bomCache: BomMap = {};
let bomLastSyncAt: string | null = null;
let bomLastError: string | null = null;

let cicProductModeCache: CicProductMap = {};
let cicProductModeLastSyncAt: string | null = null;
let cicProductModeLastError: string | null = null;

async function loadBomFromSheet(): Promise<BomMap> {
  const sheetId = process.env.BOM_SHEET_ID;
  const tab = process.env.BOM_SHEET_TAB || "RICETTARIO";
  if (!sheetId) throw new Error("BOM_SHEET_ID mancante");

  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(
    tab
  )}`;

  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`BOM fetch failed ${res.status}: ${txt}`);
  }

  const text = await res.text();
  const json = JSON.parse(text.substring(47).slice(0, -2));
  const rows = json?.table?.rows ?? [];

  const recipes: BomMap = {};

  for (const r of rows) {
    const c = r?.c ?? [];
    const productSku = c?.[0]?.v ? String(c[0].v).trim() : "";
    const ingredientSku = c?.[2]?.v ? String(c[2].v).trim() : "";
    const qty = Number(c?.[4]?.v ?? 0);
    const um = c?.[5]?.v ? String(c[5].v).trim().toUpperCase() : "";

    if (!productSku || !ingredientSku) continue;
    if (!qty || qty === 0) continue;

    if (!recipes[productSku]) recipes[productSku] = [];
    recipes[productSku].push({ ingredientSku, qty, um });
  }

  return recipes;
}

async function syncBom() {
  try {
    const recipes = await loadBomFromSheet();
    bomCache = recipes;
    bomLastSyncAt = new Date().toISOString();
    bomLastError = null;
    console.log("✅ BOM sync OK:", Object.keys(bomCache).length, "prodotti");
  } catch (err: any) {
    bomLastError = String(err?.message ?? err);
    console.error("❌ BOM sync error:", bomLastError);
  }
}

async function loadCicProductModesFromSheet(): Promise<CicProductMap> {
  const sheetId = process.env.BOM_SHEET_ID;
  const tab = process.env.CIC_PRODUCTS_SHEET_TAB || "PRODOTTI_CIC";
  if (!sheetId) throw new Error("BOM_SHEET_ID mancante");

  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(tab)}`;

  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`CIC products sheet fetch failed ${res.status}: ${txt}`);
  }

  const text = await res.text();
  const json = JSON.parse(text.substring(47).slice(0, -2));
  const rows = json?.table?.rows ?? [];

  const map: CicProductMap = {};

  for (const r of rows) {
    const c = r?.c ?? [];

    const cicId = c?.[0]?.v ? String(c[0].v).trim() : "";
    const sku = c?.[1]?.v ? String(c[1].v).trim() : "";
    const tipoScarico = c?.[6]?.v ? String(c[6].v).trim().toUpperCase() : "";

    if (!cicId || !sku) continue;
    if (tipoScarico !== "RECIPE" && tipoScarico !== "IGNORE") continue;

    map[cicId] = {
      sku,
      mode: tipoScarico as CicProductMode,
    };
  }

  return map;
}
async function syncCicProductModes() {
  try {
    const map = await loadCicProductModesFromSheet();
    cicProductModeCache = map;
    cicProductModeLastSyncAt = new Date().toISOString();
    cicProductModeLastError = null;

    console.log(
      "✅ PRODOTTI_CIC sync OK:",
      Object.keys(cicProductModeCache).length,
      "sku classificati"
    );
  } catch (err: any) {
    cicProductModeLastError = String(err?.message ?? err);
    console.error("❌ PRODOTTI_CIC sync error:", cicProductModeLastError);
  }
}
async function pushUnresolvedToSheet(row: any) {
  const url = process.env.CIC_PRODUCTS_SHEET_WRITE_URL;
  if (!url) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        docId: row?.docId || "",
        receiptNumber: row?.receiptNumber || "",
        cicId: row?._idProduct || "",
        variantId: row?._idProductVariant || "",
        name: row?.description || "",
        price: row?.price || "",
        qty: row?.qty || "",
        rawSku: row?.rawSku || "",
        note: row?.note || "",
      }),
    });

    console.log("✅ CIC unresolved push to sheet OK:", row?._idProduct || "");
  } catch (err) {
    console.log("⚠️ push sheet failed:", err);
  }
}
/* =========================
   CIC (Cassa in Cloud) Sync
   ========================= */

const CIC_WEBHOOK_SECRET = process.env.CIC_WEBHOOK_SECRET || "";
const CIC_API_KEY = process.env.CIC_API_KEY || "";
const CIC_API_BASE_URL = process.env.CIC_API_BASE_URL || "https://api.cassanova.com";
const CIC_X_VERSION = process.env.CIC_X_VERSION || "1.0.0";
const CIC_PRODUCTS_PATH = process.env.CIC_PRODUCTS_PATH || "/products";

const CIC_PRODUCTS_LIMIT = Number(process.env.CIC_PRODUCTS_LIMIT || 200);
const CIC_PRODUCTS_SYNC_HOURS = Number(process.env.CIC_PRODUCTS_SYNC_HOURS || 6);

let cicIdToSkuMap: Record<string, string> = {};
let cicProductsLastSyncAt: string | null = null;

let cicBearerToken: string | null = null;
let cicBearerTokenExpMs: number | null = null;

function cicTokenValid() {
  return !!cicBearerToken && !!cicBearerTokenExpMs && Date.now() < cicBearerTokenExpMs - 30_000;
}

async function getCicBearerToken() {
  if (!CIC_API_KEY) return null;
  if (cicTokenValid()) return cicBearerToken;

  const url = `${CIC_API_BASE_URL}/apikey/token`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: CIC_API_KEY }),
  });

  if (!res.ok) {
    const txt = await res.text();
    console.log("❌ CIC token error:", res.status, txt);
    return null;
  }

  const json: any = await res.json();
  cicBearerToken = String(json?.access_token || "");
  const expiresIn = Number(json?.expires_in || 3600);
  cicBearerTokenExpMs = Date.now() + expiresIn * 1000;

  console.log("✅ CIC token OK (expiresIn s):", expiresIn);
  return cicBearerToken;
}
async function syncCicProducts() {
  try {
    if (!CIC_API_KEY) {
      console.log("⚠️ CIC_API_KEY mancante: sync prodotti disattivata");
      return;
    }

    const token = await getCicBearerToken();
    if (!token) {
      console.log("⚠️ CIC token non disponibile: sync prodotti saltata");
      return;
    }

    const map: Record<string, string> = {};
    let start = 0;
    let totalCount = Infinity;
    const limit = Math.max(1, Math.min(CIC_PRODUCTS_LIMIT || 200, 500));

    let printedSample = false;

    while (start < totalCount) {
      const url = `${CIC_API_BASE_URL}${CIC_PRODUCTS_PATH}?start=${start}&limit=${limit}`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Version": CIC_X_VERSION,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const txt = await res.text();
        console.log("❌ CIC products error:", res.status, txt);
        return;
      }

      const json: any = await res.json();
      const products: any[] = Array.isArray(json?.products) ? json.products : [];
      totalCount = Number(json?.totalCount ?? products.length ?? 0);

      if (!printedSample && products.length) {
        printedSample = true;
        console.log("CIC PRODUCT SAMPLE:", JSON.stringify(products[0], null, 2));
      }

     for (const p of products) {
  const productId = String(p?.id || "").trim();
  const productDesc = String(p?.description || "").trim();

  // DEBUG mirato sui prodotti problematici
  if (
    productId === "8a060ec2-5f36-4358-929a-f354e561819b" ||
    productId === "0ccea60d-737c-4a9a-a6dc-534933b79032" ||
    productDesc.toUpperCase().includes("KOZEL") ||
    productDesc.toUpperCase().includes("ACQUA")
  ) {
    console.log("🔎 CIC TARGET PRODUCT:", JSON.stringify(p, null, 2));
  }

  const productSku =
    String(p?.internalId || "").trim() ||
    String(p?.externalId || "").trim() ||
    "";

  if (productId && productSku) map[productId] = productSku;

  const pBarcodes: any[] =
    (Array.isArray(p?.barcodes) && p.barcodes) ||
    (Array.isArray(p?.salesBarcodes) && p.salesBarcodes) ||
    [];

  for (const b of pBarcodes) {
    const code = String(b?.barcode || b?.code || b?.value || b || "").trim();
    if (code && productSku) map[code] = productSku;
  }

  const variants: any[] = Array.isArray(p?.variants) ? p.variants : [];
  for (const v of variants) {
    const variantId = String(v?.id || "").trim();

    // DEBUG mirato sulle varianti problematiche
    if (
      variantId === "2dbb6511-afe1-4599-a698-1673bb46ec3b" ||
      variantId === "51667f52-9f38-469a-a056-60786b1d2d4d"
    ) {
      console.log("🔎 CIC TARGET VARIANT:", JSON.stringify(v, null, 2));
    }

    const variantSku =
      String(v?.internalId || "").trim() ||
      String(v?.externalId || "").trim() ||
      productSku;

    if (variantId && variantSku) map[variantId] = variantSku;

    const vBarcodes: any[] =
      (Array.isArray(v?.barcodes) && v.barcodes) ||
      (Array.isArray(v?.salesBarcodes) && v.salesBarcodes) ||
      [];

    for (const b of vBarcodes) {
      const code = String(b?.barcode || b?.code || b?.value || b || "").trim();
      if (code && variantSku) map[code] = variantSku;
    }
  }
}
      start += limit;
      if (!products.length) break;
    }

    cicIdToSkuMap = map;
    cicProductsLastSyncAt = new Date().toISOString();
    console.log(
      "✅ CIC prodotti sincronizzati:",
      Object.keys(cicIdToSkuMap).length,
      "lastSync:",
      cicProductsLastSyncAt
    );
  } catch (err) {
    console.error("❌ Errore sync prodotti CIC:", err);
  }
}

function cicResolveSku(id: string) {
  if (!id) return id;

  if (id.startsWith("SKU")) {
    return id;
  }

  if (cicIdToSkuMap[id]) {
    return cicIdToSkuMap[id];
  }

  if (cicProductModeCache[id]) {
    return cicProductModeCache[id].sku;
  }

  return id;
}

function cicExtractItems(data: any) {
  const rows = data?.document?.rows ?? [];
  if (!Array.isArray(rows)) return [];

  return rows
    .map((r: any) => {
      const qty = Number(r?.quantity ?? 0);
      const price = Number(r?.price ?? 0);

      const idVariant = String(r?.idProductVariant ?? "").trim();
      const idProduct = String(r?.idProduct ?? "").trim();

      let resolved = "";

      if (idVariant) {
        resolved = cicResolveSku(idVariant);
      }

      // fallback: se la variante non si risolve in SKU, provo il prodotto padre
      if (!resolved || resolved.includes("-")) {
        resolved = cicResolveSku(idProduct);
      }

      console.log("CIC RESOLVE:", {
        variant: idVariant,
        product: idProduct,
        resolved,
      });

      return {
        sku: resolved,
        qty,
        total: qty * price,
        _idProduct: idProduct,
        _idProductVariant: idVariant,
      };
    })
    .filter((x: any) => x.sku && x.qty);
}

/* =========================
   App
   ========================= */

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

/* =========================
   Middleware
   ========================= */

app.use(
  cors({
    origin: process.env.NODE_ENV === "production" ? true : "http://localhost:5173",
    credentials: true,
  })
);

app.get("/webhooks/cic", (_req, res) => res.status(200).send("OK"));
app.head("/webhooks/cic", (_req, res) => res.status(200).end());
app.options("/webhooks/cic", (_req, res) => res.status(200).end());

app.post("/webhooks/cic", express.raw({ type: "*/*" }), async (req, res) => {
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";

    const signature = (req.header("x-cn-signature") || "").trim();
    const operation = (req.header("x-cn-operation") || "").trim();
    console.log("CIC x-cn-operation:", operation);

    if (CIC_WEBHOOK_SECRET && signature) {
      const expected = crypto.createHmac("sha1", CIC_WEBHOOK_SECRET).update(raw, "utf8").digest("hex");
      if (signature !== expected) {
        console.error("❌ CIC signature mismatch");
        return res.status(401).send("Invalid signature");
      }
    }

    if (!operation.startsWith("RECEIPT/")) {
      console.log("CIC skipped (not receipt):", operation);
      return res.status(200).send("OK");
    }

    const data = JSON.parse(raw);

    const docId = "CIC-" + String(data?.document?.id || data?.id || "");
    const orderDate = new Date(data?.document?.date || data?.document?.creationDate || Date.now());
    const tenantId = process.env.TENANT_ID || "IMP001";

    let items = cicExtractItems(data);

    const hasUnresolved = items.some((it) => String(it.sku).includes("-"));
    if (hasUnresolved) {
      console.log("ℹ️ CIC: trovati ID non risolti, provo sync prodotti…");
      await syncCicProducts();
      items = cicExtractItems(data);
    }

const unresolved = items.filter((it) => String(it.sku).includes("-"));
if (unresolved.length) {
  console.warn("❗CIC UNRESOLVED:", unresolved);

  const rawRows = Array.isArray(data?.document?.rows) ? data.document.rows : [];

  for (const it of unresolved) {
    const rawRow = rawRows.find((r: any) => {
      const rowVariant = String(r?.idProductVariant ?? "").trim();
      const rowProduct = String(r?.idProduct ?? "").trim();

      return (
        rowVariant === String(it._idProductVariant || "").trim() ||
        rowProduct === String(it._idProduct || "").trim()
      );
    });

    console.log(
      "🔎 CIC UNRESOLVED ROW:",
      JSON.stringify(
        {
          unresolved: it,
          row: rawRow || null,
        },
        null,
        2
      )
    );

    await pushUnresolvedToSheet({
      docId,
      receiptNumber:
        data?.document?.documentNumber ||
        data?.document?.number ||
        data?.document?.receiptNumber ||
        "",
      _idProduct: it._idProduct,
      _idProductVariant: it._idProductVariant,
      description: rawRow?.description || rawRow?.descriptionReceipt || "",
      price: rawRow?.price || "",
      qty: rawRow?.quantity || it.qty || "",
      rawSku: it.sku,
      note: "Da configurare",
    });

    upsertUnresolved({
      productId: it._idProduct || undefined,
      variantId: it._idProductVariant || undefined,
      rawSku: String(it.sku),
      docId,
      operation,
      total: it.total,
    });
  }
}
    const resolvedItems = items.filter((it) => !String(it.sku).includes("-"));

    const inserted = applyRecipeStock({
      docId,
      tenantId,
      orderDate,
      soldItems: resolvedItems.map((i: any) => ({ sku: i.sku, qty: i.qty })),
      bom: bomCache,
      cicProductModes: Object.fromEntries(
  Object.entries(cicProductModeCache).map(([k, v]) => [v.sku, v.mode])
),
    });

    console.log("✅ SCARICHI GENERATI:", inserted);
    return res.status(200).send("OK");
  } catch (err) {
    console.error("CIC webhook error:", err);
    return res.status(500).send("Webhook error");
  }
});

app.use(express.json());

/* =========================
   Debug / Health
   ========================= */

app.get("/debug/recipes", (_req, res) => {
  res.json({
    recipesCount: Object.keys(bomCache).length,
    bomLastSyncAt,
    bomLastError,
    sample: Object.entries(bomCache).slice(0, 5),
  });
});

app.get("/debug/cic-product-modes", (_req, res) => {
  res.json({
    count: Object.keys(cicProductModeCache).length,
    lastSyncAt: cicProductModeLastSyncAt,
    lastError: cicProductModeLastError,
    sample: Object.entries(cicProductModeCache).slice(0, 30),
  });
});

app.get("/debug/cic-unresolved", (_req, res) => {
  const rows = listUnresolved();
  res.json({
    count: rows.length,
    sample: rows.slice(0, 30),
  });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "gestionale-magazzino-api",
    time: new Date().toISOString(),
    cicProducts: {
      mapSize: Object.keys(cicIdToSkuMap).length,
      lastSyncAt: cicProductsLastSyncAt,
    },
    cicProductModes: {
      count: Object.keys(cicProductModeCache).length,
      lastSyncAt: cicProductModeLastSyncAt,
      lastError: cicProductModeLastError,
    },
    bom: {
      recipesCount: Object.keys(bomCache).length,
      lastSyncAt: bomLastSyncAt,
      lastError: bomLastError,
    },
  });
});

/* =========================
   Basic Auth
   ========================= */

const basicAuthEnabled = process.env.BASIC_AUTH_ENABLED === "true";
const user = process.env.BASIC_AUTH_USER ?? "";
const pass = process.env.BASIC_AUTH_PASS ?? "";

if (basicAuthEnabled && user && pass) {
  const auth = basicAuth({ users: { [user]: pass }, challenge: true, realm: "Core (staging)" });

  app.use((req, res, next) => {
    if (req.path === "/health") return next();
    if (req.path === "/debug/recipes") return next();
    if (req.path === "/debug/cic-product-modes") return next();
    if (req.path === "/debug/cic-unresolved") return next();
    if (req.path.startsWith("/webhooks/cic")) return next();
    return auth(req, res, next);
  });
}

/* =========================
   API routes
   ========================= */

app.use("/items", itemsRouter);
app.use("/movements", movementsRouter);
app.use("/stock-v2", stockV2Router);
app.use("/orders", ordersRouter);

/* =========================
   Static frontend
   ========================= */

if (process.env.NODE_ENV !== "development") {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const webPath = path.resolve(__dirname, "../../../web/dist");
  const indexHtml = path.join(webPath, "index.html");

  if (fs.existsSync(indexHtml)) {
    app.use(express.static(webPath));

    app.get("*", (req, res, next) => {
      const accept = req.headers.accept ?? "";
      if (!accept.includes("text/html")) return next();
      res.sendFile(indexHtml);
    });
  }
}

/* =========================
   Start
   ========================= */

app.listen(PORT, "0.0.0.0", async () => {
  console.log(`✅ Server attivo sulla porta ${PORT}`);

  await syncCicProducts();
  await syncBom();
  await syncCicProductModes();

  const msCic = Math.max(1, CIC_PRODUCTS_SYNC_HOURS) * 60 * 60 * 1000;
  setInterval(() => syncCicProducts(), msCic);
  setInterval(() => syncBom(), 5 * 60 * 1000);
  setInterval(() => syncCicProductModes(), 5 * 60 * 1000);
});
