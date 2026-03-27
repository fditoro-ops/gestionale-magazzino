import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import basicAuth from "express-basic-auth";
import fs from "fs";
import crypto from "crypto";
import { pool, testDbConnection, initDb } from "./db.js";
import movementsRouter from "./routes/movements.js";
import stockV2Router from "./routes/stock.v2.js";
import itemsRouter from "./routes/items.js";
import ordersRouter from "./routes/orders.js";

import { applyRecipeStock } from "./services/recipeStock.service.js";
import { upsertUnresolved, listUnresolved } from "./data/cicUnresolved.store.js";
import {
  appendCicWebhookDump,
  loadCicWebhookDumps,
} from "./data/cicWebhookDump.store.js";
import {
  upsertPendingRow,
  listPendingRows,
  markPendingRowProcessed,
} from "./data/cicPendingRows.store.js";

import suppliersRouter from "./routes/suppliers.js";
import authRouter from "./routes/auth.js";
import usersRouter from "./routes/users.js";
import inventoryRouter from "./routes/inventory.js";
import { saveSalesDocumentWithLines, getSalesFeed } from "./data/sales.store.js";
import recipesRouter from "./routes/recipes.router.js";
import cashClosuresRouter from "./routes/cash-closures.router.js";
import webhooksCicRouter from "./routes/webhooks.cic.router.js";
import {
  syncRecipesDbCache,
  getRecipesDbCache,
} from "./services/recipesDb.service.js";
import { cicResolveSku, cicExtractItems } from "./services/cicMapping.service.js";
import dashboardRouter from "./routes/dashboard.router.js";
import pendingRouter from "./routes/pending.routes.js";


/* =========================
   BOM (Google Sheet) Reader
   ========================= */

type BomLine = { ingredientSku: string; qty: number; um: string };
type BomMap = Record<string, BomLine[]>;

type CicProductMode = "RECIPE" | "IGNORE";

type CicProductMapEntry = {
  sku: string;
  mode: CicProductMode;
  productId: string;
  variantId: string;
  name?: string;
};

type CicProductMap = Record<string, CicProductMapEntry>;

type CicCatalogRow = {
  type: "PRODUCT" | "VARIANT";
  productId: string;
  variantId: string;
  name: string;
  internalId: string;
  externalId: string;
  barcode: string;
  category: string;
  department: string;
  price: number | string;
};

type CicExtractedItem = {
  sku: string;
  qty: number;
  total: number;
  _idProduct: string;
  _idProductVariant: string;
};

// cache ricette
let bomCache: BomMap = {};
let bomLastSyncAt: string | null = null;
let bomLastError: string | null = null;

let cicProductModeCache: CicProductMap = {};
let cicProductModeLastSyncAt: string | null = null;
let cicProductModeLastError: string | null = null;

export function getBomCache() {
  return bomCache;
}

export function getCicProductModesCache() {
  return cicProductModeCache;
}

export function getLastEmergencySyncMs() {
  return lastEmergencySyncMs;
}

export function getActiveBom() {
  const dbBom = getRecipesDbCache();
  if (Object.keys(dbBom).length > 0) return dbBom;
  return bomCache;
}

export function setLastEmergencySyncMs(value: number) {
  lastEmergencySyncMs = value;
}

export function getCicIdToSkuMap() {
  return cicIdToSkuMap;
}

/* =========================
   BOM
   ========================= */

async function loadBomFromSheet(): Promise<BomMap> {
  const sheetId = process.env.BOM_SHEET_ID;
  const tab = process.env.BOM_SHEET_TAB || "RICETTE";
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

    // RICETTE:
    // A = SKU prodotto
    // C = SKU ingrediente
    // E = QTY
    // F = UM

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

/* =========================
   PRODOTTI_CIC
   ========================= */

async function loadCicProductModesFromSheet(): Promise<CicProductMap> {
  const sheetId = process.env.BOM_SHEET_ID;
  const tab = process.env.CIC_PRODUCTS_SHEET_TAB || "PRODOTTI_CIC";
  if (!sheetId) throw new Error("BOM_SHEET_ID mancante");

  if (DEBUG_CIC) console.log("DEBUG CIC MODES sheetId:", sheetId);
  if (DEBUG_CIC) console.log("DEBUG CIC MODES tab:", tab);

  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(
    tab
  )}`;

  if (DEBUG_CIC) console.log("DEBUG CIC MODES url:", url);

  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`CIC products sheet fetch failed ${res.status}: ${txt}`);
  }

  const text = await res.text();
  if (DEBUG_CIC) console.log("DEBUG CIC MODES raw text preview:", text.slice(0, 180));

  const json = JSON.parse(text.substring(47).slice(0, -2));
  const rows = json?.table?.rows ?? [];

  if (DEBUG_CIC) console.log("DEBUG CIC MODES raw rows:", rows.length);

  const map: CicProductMap = {};

  for (const r of rows) {
    const c = r?.c ?? [];

    const productId = c?.[0]?.v ? String(c[0].v).trim() : "";
    const variantId = c?.[1]?.v ? String(c[1].v).trim() : "";
    const sku = c?.[2]?.v ? String(c[2].v).trim() : "";
    const name = c?.[3]?.v ? String(c[3].v).trim() : "";
    const tipoScaricoRaw = c?.[7]?.v ? String(c[7].v).trim() : "";
    const tipoScarico = tipoScaricoRaw.toUpperCase();

    if (!sku) continue;
    if (!productId && !variantId) continue;
    if (tipoScarico !== "RECIPE" && tipoScarico !== "IGNORE") continue;

    const entry: CicProductMapEntry = {
      sku,
      mode: tipoScarico as CicProductMode,
      productId,
      variantId,
      name,
    };

    if (variantId) map[variantId] = entry;
    if (productId) map[productId] = entry;
  }

  if (DEBUG_CIC) console.log("DEBUG CIC MODES final keys:", Object.keys(map).length);
  if (DEBUG_CIC) {
    console.log(
      "DEBUG CIC MODES sample entries:",
      Object.entries(map).slice(0, 5)
    );
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
      "chiavi mappate"
    );
  } catch (err: any) {
    cicProductModeLastError = String(err?.message ?? err);
    console.error("❌ PRODOTTI_CIC sync error:", cicProductModeLastError);
  }
}

/* =========================
   SHEET write helpers
   ========================= */

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
  category: row?.category || "",
  department: row?.department || "",
  note: row?.note || "",
}),
    });

    console.log("✅ CIC unresolved push to sheet OK:", row?._idProduct || "");
  } catch (err) {
    console.log("⚠️ push sheet failed:", err);
  }
}

async function pushCatalogToSheet(rows: CicCatalogRow[]) {
  const url = process.env.CIC_PRODUCTS_SHEET_WRITE_URL;
  if (!url) throw new Error("CIC_PRODUCTS_SHEET_WRITE_URL mancante");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode: "catalog",
      rows,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Catalog push failed ${res.status}: ${txt}`);
  }
}

/* =========================
   CIC API sync
   ========================= */

const CIC_WEBHOOK_SECRET = process.env.CIC_WEBHOOK_SECRET || "";
const CIC_API_KEY = process.env.CIC_API_KEY || "";
const CIC_API_BASE_URL =
  process.env.CIC_API_BASE_URL || "https://api.cassanova.com";
const CIC_X_VERSION = process.env.CIC_X_VERSION || "1.0.0";
const CIC_PRODUCTS_PATH = process.env.CIC_PRODUCTS_PATH || "/products";

const DEBUG_CIC = false;
const CIC_PRODUCTS_LIMIT = Number(process.env.CIC_PRODUCTS_LIMIT || 200);
const CIC_PRODUCTS_SYNC_HOURS = Number(
  process.env.CIC_PRODUCTS_SYNC_HOURS || 1
);

let cicIdToSkuMap: Record<string, string> = {};
let cicProductsLastSyncAt: string | null = null;
let lastEmergencySyncMs = 0;

let cicBearerToken: string | null = null;
let cicBearerTokenExpMs: number | null = null;

function cicTokenValid() {
  return (
    !!cicBearerToken &&
    !!cicBearerTokenExpMs &&
    Date.now() < cicBearerTokenExpMs - 30_000
  );
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

async function fetchAllCicProducts(): Promise<CicCatalogRow[]> {
  if (!CIC_API_KEY) throw new Error("CIC_API_KEY mancante");

  const token = await getCicBearerToken();
  if (!token) throw new Error("Token CIC non disponibile");

  const rows: CicCatalogRow[] = [];
  let start = 0;
  let totalCount = Infinity;
  const limit = Math.max(1, Math.min(CIC_PRODUCTS_LIMIT || 200, 500));

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
      throw new Error(`CIC GET /products failed ${res.status}: ${txt}`);
    }

    const json: any = await res.json();
    const products: any[] = Array.isArray(json?.products) ? json.products : [];
    totalCount = Number(json?.totalCount ?? products.length ?? 0);

    for (const p of products) {
      const productId = String(p?.id || "").trim();
      const productName = String(
        p?.description || p?.descriptionLabel || ""
      ).trim();
      const productInternalId = String(p?.internalId || "").trim();
      const productExternalId = String(p?.externalId || "").trim();

      const category = String(
        p?.category?.description ||
          p?.category?.descriptionLabel ||
          ""
      ).trim();

      const department = String(
        p?.department?.description ||
          p?.department?.descriptionLabel ||
          ""
      ).trim();

      const productPrice =
        Array.isArray(p?.prices) && p.prices.length
          ? Number(p.prices[0]?.value ?? 0)
          : "";

      rows.push({
        type: "PRODUCT",
        productId,
        variantId: "",
        name: productName,
        internalId: productInternalId,
        externalId: productExternalId,
        barcode: "",
        category,
        department,
        price: productPrice,
      });

      const variants: any[] = Array.isArray(p?.variants) ? p.variants : [];
      for (const v of variants) {
        const variantId = String(v?.id || "").trim();
        const variantName = String(
          v?.description || v?.descriptionReceipt || productName || ""
        ).trim();
        const variantInternalId = String(v?.internalId || "").trim();
        const variantExternalId = String(v?.externalId || "").trim();

        const variantRawPrice =
  Array.isArray(v?.prices) && v.prices.length
    ? v.prices[0]?.value
    : productPrice;

const variantPrice = Number(variantRawPrice ?? 0);

        const vBarcodes: any[] =
          (Array.isArray(v?.barcodes) && v.barcodes) ||
          (Array.isArray(v?.salesBarcodes) && v.salesBarcodes) ||
          [];

        if (!vBarcodes.length) {
          rows.push({
            type: "VARIANT",
            productId,
            variantId,
            name: variantName,
            internalId: variantInternalId,
            externalId: variantExternalId,
            barcode: "",
            category,
            department,
            price: variantPrice,
          });
        } else {
          for (const b of vBarcodes) {
            rows.push({
              type: "VARIANT",
              productId,
              variantId,
              name: variantName,
              internalId: variantInternalId,
              externalId: variantExternalId,
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

    start += limit;
    if (!products.length) break;
  }

  return rows;
}
export async function syncCicProducts() {
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

     if (DEBUG_CIC && !printedSample && products.length) {
  printedSample = true;
  console.log("CIC PRODUCT SAMPLE:", JSON.stringify(products[0], null, 2));
}

      for (const p of products) {
        const productId = String(p?.id || "").trim();
        const productDesc = String(p?.description || "").trim();

        if (
  DEBUG_CIC &&
  (
    productId === "8a060ec2-5f36-4358-929a-f354e561819b" ||
    productId === "0ccea60d-737c-4a9a-a6dc-534933b79032" ||
    productDesc.toUpperCase().includes("KOZEL") ||
    productDesc.toUpperCase().includes("ACQUA")
  )
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
          const code = String(
            b?.barcode || b?.code || b?.value || b || ""
          ).trim();
          if (code && productSku) map[code] = productSku;
        }

        const variants: any[] = Array.isArray(p?.variants) ? p.variants : [];
        for (const v of variants) {
          const variantId = String(v?.id || "").trim();

         if (
  DEBUG_CIC &&
  (
    variantId === "2dbb6511-afe1-4599-a698-1673bb46ec3b" ||
    variantId === "51667f52-9f38-469a-a056-60786b1d2d4d"
  )
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
            const code = String(
              b?.barcode || b?.code || b?.value || b || ""
            ).trim();
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

/* =========================
   CIC resolve helpers
   ========================= */

export async function getItemNameBySku(sku: string) {
  const cleanSku = String(sku || "").trim();
  if (!cleanSku) return "";

  const res = await pool.query(
    `
    SELECT name
    FROM "Item"
    WHERE sku = $1
    LIMIT 1
    `,
    [cleanSku]
  );

  return String(res.rows[0]?.name || "").trim();
}

/* =========================
   App
   ========================= */

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

/* =========================
   Middleware
   ========================= */

const allowedOrigins = [
  "http://localhost:5173",
  "https://gestionale-magazzino-8cdo.onrender.com",
  "https://gestionale-magazzino-1-2dnc.onrender.com",
];

const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

function buildCicWebhookDebugDump(
  data: any,
  operation: string,
  headers: Record<string, any>
) {
  const document = data?.document ?? {};
  const rows = Array.isArray(document?.rows) ? document.rows : [];
  const payments = Array.isArray(document?.payments) ? document.payments : [];
  const orderSummary = document?.orderSummary ?? null;
  const user = document?.user ?? null;

  return {
    capturedAt: new Date().toISOString(),
    operation,
    headers,

    receiptTopLevel: {
      id: data?.id ?? null,
      number: data?.number ?? null,
      date: data?.date ?? null,
      datetime: data?.datetime ?? null,
      zNumber: data?.zNumber ?? null,
      taxCode: data?.taxCode ?? null,
      vatNumber: data?.vatNumber ?? null,
      lotteryCode: data?.lotteryCode ?? null,
    },

    documentTopLevel: {
      id: document?.id ?? null,
      description: document?.description ?? null,
      amount: document?.amount ?? null,
      change: document?.change ?? null,
      note: document?.note ?? null,
      externalId: document?.externalId ?? null,
      email: document?.email ?? null,
      confirmed: document?.confirmed ?? null,
      taxFree: document?.taxFree ?? null,
      userType: document?.userType ?? null,
      documentReason: document?.documentReason ?? null,
      date: document?.date ?? null,
      datetime: document?.datetime ?? null,
      creationDate: document?.creationDate ?? null,
      number: document?.number ?? null,
      documentNumber: document?.documentNumber ?? null,
      receiptNumber: document?.receiptNumber ?? null,
    },

    orderSummary: orderSummary
      ? {
          id: orderSummary?.id ?? null,
          openingTime: orderSummary?.openingTime ?? null,
          closingTime: orderSummary?.closingTime ?? null,
          amount: orderSummary?.amount ?? null,
          covers: orderSummary?.covers ?? null,
          idTable: orderSummary?.idTable ?? null,
          tableName: orderSummary?.tableName ?? null,
          code: orderSummary?.code ?? null,
        }
      : null,

    user: user
      ? {
          id: user?.id ?? null,
          name: user?.name ?? null,
        }
      : null,

    payments: payments.map((p: any) => ({
      paymentType: p?.paymentType ?? null,
      amount: p?.amount ?? null,
      paymentNote: p?.paymentNote ?? null,
      bankAccountHolder: p?.bankAccountHolder ?? null,
      bankAccountInstitute: p?.bankAccountInstitute ?? null,
      bankAccountIBAN: p?.bankAccountIBAN ?? null,
      change: p?.change ?? null,
      customPayment: p?.customPayment ?? null,
      ticket: p?.ticket ?? null,
    })),

    rows: rows.map((r: any) => ({
      id: r?.id ?? null,
      subtotal: r?.subtotal ?? null,
      refund: r?.refund ?? null,
      menu: r?.menu ?? null,
      composition: r?.composition ?? null,
      coverCharge: r?.coverCharge ?? null,
      idProduct: r?.idProduct ?? null,
      idProductVariant: r?.idProductVariant ?? null,
      idCategory: r?.idCategory ?? null,
      idDepartment: r?.idDepartment ?? null,
      salesType: r?.salesType ?? null,
      idTax: r?.idTax ?? null,
      idSalesMode: r?.idSalesMode ?? null,
      stockMovementEnabled: r?.stockMovementEnabled ?? null,
      idStockMovement: r?.idStockMovement ?? null,
      idOutgoingMovement: r?.idOutgoingMovement ?? null,
      rowNumber: r?.rowNumber ?? null,
      quantity: r?.quantity ?? null,
      price: r?.price ?? null,
      percentageVariation: r?.percentageVariation ?? null,
      variation: r?.variation ?? null,
      variationType: r?.variationType ?? null,
      note: r?.note ?? null,
      calculatedAmount: r?.calculatedAmount ?? null,
      shippingCost: r?.shippingCost ?? null,
      raw: r,
    })),

    rawPayload: data,
  };
}

/* =========================
   CIC webhook
   ========================= */

app.post("/admin/sales/backfill-descriptions", async (_req, res) => {
  try {
    const tenantId = String(process.env.TENANT_ID || "IMP001");

    const rowsRes = await pool.query(`
      SELECT id, sku
      FROM sales_lines
      WHERE tenant_id = $1
        AND (description IS NULL OR BTRIM(description) = '' OR sku LIKE '%-%')
      LIMIT 5000
    `, [tenantId]);

    const rows = rowsRes.rows;

    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      let rawSku = String(row.sku || "").trim();
      if (!rawSku) {
        skipped++;
        continue;
      }

      // 🔥 usa la tua logica già esistente
      let resolvedSku = cicResolveSku(rawSku);

      if (!resolvedSku || resolvedSku.includes("-")) {
        skipped++;
        continue;
      }

      // 🔍 prendi nome da Item
      const itemRes = await pool.query(
        `SELECT name FROM "Item" WHERE sku = $1 LIMIT 1`,
        [resolvedSku]
      );

      const name = String(itemRes.rows[0]?.name || "").trim();
      if (!name) {
        skipped++;
        continue;
      }

      // ✏️ aggiorna riga
      await pool.query(
        `
        UPDATE sales_lines
        SET
          sku = $1,
          description = $2
        WHERE id = $3
        `,
        [resolvedSku, name, row.id]
      );

      updated++;
    }

    res.json({
      ok: true,
      total: rows.length,
      updated,
      skipped,
    });
  } catch (err: any) {
    console.error("❌ backfill error:", err);
    res.status(500).json({
      ok: false,
      error: String(err?.message ?? err),
    });
  }
});

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

app.use((err: any, _req: any, res: any, next: any) => {
  if (err?.type === "entity.parse.failed") {
    console.error("❌ JSON parse failed:", err.message);
    return res.status(400).json({
      ok: false,
      error: "JSON non valido",
      details: err.message,
    });
  }

  if (err?.type === "entity.too.large") {
    console.error("❌ Payload too large:", err.message);
    return res.status(413).json({
      ok: false,
      error: "Payload troppo grande",
      details: err.message,
    });
  }

  return next(err);
});

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

app.get("/debug/active-bom-source", (_req, res) => {
  const dbBom = getRecipesDbCache();
  const usingDb = Object.keys(dbBom).length > 0;

  res.json({
    using: usingDb ? "RECIPES_DB" : "GOOGLE_SHEET",
    dbCount: Object.keys(dbBom).length,
    sheetCount: Object.keys(bomCache).length,
  });
});

app.get("/debug/cic-unresolved", async (_req, res) => {
  try {
    const rows = await listUnresolved();
    res.json({
      count: rows.length,
      sample: rows.slice(0, 30),
    });
  } catch (err: any) {
    console.error("GET /debug/cic-unresolved error:", err);
    res.status(500).json({
      ok: false,
      error: String(err?.message ?? err),
    });
  }
});

app.get("/debug/cic-webhook-dumps", (_req, res) => {
  const rows = loadCicWebhookDumps();
  res.json({
    count: rows.length,
    sample: rows.slice(-20),
  });
});

app.get("/debug/cic-products-full", async (_req, res) => {
  try {
    const rows = await fetchAllCicProducts();
    res.json({
      count: rows.length,
      sample: rows.slice(0, 300),
    });
  } catch (err: any) {
    res.status(500).json({
      error: String(err?.message ?? err),
    });
  }
});

app.get("/debug/recipes-db", (_req, res) => {
  const bom = getRecipesDbCache();
  res.json({
    count: Object.keys(bom).length,
    sample: Object.entries(bom).slice(0, 5),
  });
});

app.get("/debug/cic-products-export-sheet", async (_req, res) => {
  try {
    const rows = await fetchAllCicProducts();
    await pushCatalogToSheet(rows);

    res.json({
      ok: true,
      exported: rows.length,
    });
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      error: String(err?.message ?? err),
    });
  }
});

app.get("/debug/cic-pending", async (_req, res) => {
  try {
    const rows = await listPendingRows();
    res.json({
      count: rows.length,
      sample: rows.slice(-50),
    });
  } catch (err: any) {
    console.error("GET /debug/cic-pending error:", err);
    res.status(500).json({
      ok: false,
      error: String(err?.message ?? err),
    });
  }
});

app.get("/debug/cic-pending-open", async (_req, res) => {
  try {
    const rows = await listPendingRows("PENDING");
    res.json({
      count: rows.length,
      sample: rows.slice(-50),
    });
  } catch (err: any) {
    console.error("GET /debug/cic-pending-open error:", err);
    res.status(500).json({
      ok: false,
      error: String(err?.message ?? err),
    });
  }
});

app.get("/debug/sales", async (_req, res) => {
  try {
    const docs = await pool.query(`
      SELECT
        document_id,
        receipt_number,
        status,
        document_date,
        total_amount,
        tenant_id
      FROM sales_documents
      ORDER BY document_date DESC
      LIMIT 20
    `);

    const lines = await pool.query(`
      SELECT
        document_id,
        line_no,
        sku,
        description,
        qty,
        unit_price,
        line_total,
        mode,
        has_recipe,
        resolved_ok
      FROM sales_lines
      ORDER BY created_at DESC
      LIMIT 50
    `);

    res.json({
      ok: true,
      documentsCount: docs.rows.length,
      linesCount: lines.rows.length,
      documents: docs.rows,
      lines: lines.rows,
    });
  } catch (err: any) {
    console.error("GET /debug/sales error:", err);
    res.status(500).json({
      ok: false,
      error: String(err?.message ?? err),
    });
  }
});

app.get("/debug/db", async (_req, res) => {
  try {
    const nowRes = await pool.query("SELECT NOW() as now");
    const countRes = await pool.query(
      "SELECT COUNT(*)::int as count FROM movements"
    );
    const sampleRes = await pool.query(`
      SELECT id, sku, quantity, type, reason, date, note, documento, tenant_id
      FROM movements
      ORDER BY date DESC, id DESC
      LIMIT 20
    `);

    res.json({
      ok: true,
      databaseUrlPresent: !!process.env.DATABASE_URL,
      now: nowRes.rows[0]?.now ?? null,
      movementsCount: countRes.rows[0]?.count ?? 0,
      sample: sampleRes.rows,
    });
  } catch (err: any) {
    console.error("GET /debug/db error:", err);
    res.status(500).json({
      ok: false,
      error: String(err?.message ?? err),
    });
  }
});

app.post("/debug/cic-pending-reprocess", async (_req, res) => {
  try {
    const pendingRows = await listPendingRows("PENDING");

    const cicModesBySku = Object.fromEntries(
      Object.entries(cicProductModeCache).map(([_, v]) => [v.sku, v.mode])
    ) as Record<string, "RECIPE" | "IGNORE">;

    const results: any[] = [];

    for (const row of pendingRows) {
      const candidateIds = [
        String(row.variantId || "").trim(),
        String(row.productId || "").trim(),
        String(row.rawResolvedSku || "").trim(),
      ].filter(Boolean);

      let resolvedSku = "";

      for (const id of candidateIds) {
        const resolved = cicResolveSku(id);
        if (resolved && !resolved.includes("-")) {
          resolvedSku = resolved;
          break;
        }
      }

      if (!resolvedSku) {
        results.push({
          id: row.id,
          docId: row.docId,
          status: "SKIPPED",
          reason: "SKU_NOT_RESOLVED",
        });
        continue;
      }

      const mode = cicModesBySku[resolvedSku];
const activeBom = getActiveBom();
const hasRecipe =
  Array.isArray(activeBom[resolvedSku]) && activeBom[resolvedSku].length > 0;
      
      if (!mode) {
        results.push({
          id: row.id,
          docId: row.docId,
          sku: resolvedSku,
          status: "SKIPPED",
          reason: "SKU_NOT_CLASSIFIED",
        });
        continue;
      }

      if (mode === "IGNORE") {
        await markPendingRowProcessed(row.id);
        results.push({
          id: row.id,
          docId: row.docId,
          sku: resolvedSku,
          status: "PROCESSED",
          reason: "IGNORED_AS_CONFIGURED",
        });
        continue;
      }

      if (mode === "RECIPE" && !hasRecipe) {
        results.push({
          id: row.id,
          docId: row.docId,
          sku: resolvedSku,
          status: "SKIPPED",
          reason: "RECIPE_STILL_NOT_FOUND",
        });
        continue;
      }

      const inserted = await applyRecipeStock({
        docId: row.docId,
        receiptNumber: "",
        tenantId: row.tenantId,
        orderDate: new Date(row.orderDate),
        soldItems: [
          {
            sku: resolvedSku,
            qty: Number(row.qty || 0),
          },
        ],
        bom: activeBom,
        cicProductModes: cicModesBySku,
        movementSign: row.operation === "RECEIPT/DELETE" ? 1 : -1,
      });

      if (inserted > 0) {
        await markPendingRowProcessed(row.id);

        results.push({
          id: row.id,
          docId: row.docId,
          sku: resolvedSku,
          status: "PROCESSED",
          inserted,
        });
      } else {
        results.push({
          id: row.id,
          docId: row.docId,
          sku: resolvedSku,
          status: "SKIPPED",
          reason: "NO_MOVEMENTS_CREATED",
          inserted,
        });
      }
    }

    res.json({
      ok: true,
      total: pendingRows.length,
      processed: results.filter((r) => r.status === "PROCESSED").length,
      skipped: results.filter((r) => r.status === "SKIPPED").length,
      results,
    });
  } catch (err: any) {
    console.error("POST /debug/cic-pending-reprocess error:", err);
    res.status(500).json({
      ok: false,
      error: String(err?.message ?? err),
    });
  }
});

app.post("/admin/cic/sync-products", async (_req, res) => {
  try {
    await syncCicProducts();

    res.json({
      ok: true,
      message: "Prodotti CIC ricaricati",
      lastSyncAt: cicProductsLastSyncAt,
      count: Object.keys(cicIdToSkuMap).length,
    });
  } catch (err: any) {
    console.error("POST /admin/cic/sync-products error:", err);
    res.status(500).json({
      ok: false,
      error: String(err?.message ?? err),
    });
  }
});

app.post("/admin/cic/sync-product-modes", async (_req, res) => {
  try {
    await syncCicProductModes();

    res.json({
      ok: true,
      message: "PRODOTTI_CIC ricaricati",
      lastSyncAt: cicProductModeLastSyncAt,
      count: Object.keys(cicProductModeCache).length,
    });
  } catch (err: any) {
    console.error("POST /admin/cic/sync-product-modes error:", err);
    res.status(500).json({
      ok: false,
      error: String(err?.message ?? err),
    });
  }
});

app.post("/admin/cic/sync-bom", async (_req, res) => {
  try {
    await syncBom();

    res.json({
      ok: true,
      message: "BOM ricaricata",
      lastSyncAt: bomLastSyncAt,
      count: Object.keys(bomCache).length,
    });
  } catch (err: any) {
    console.error("POST /admin/cic/sync-bom error:", err);
    res.status(500).json({
      ok: false,
      error: String(err?.message ?? err),
    });
  }
});

app.post("/admin/cic/reprocess-pending", async (_req, res) => {
  try {
    const pendingRows = await listPendingRows("PENDING");

    const cicModesBySku = Object.fromEntries(
      Object.entries(cicProductModeCache).map(([_, v]) => [v.sku, v.mode])
    ) as Record<string, "RECIPE" | "IGNORE">;

    const results: any[] = [];

    for (const row of pendingRows) {
      const candidateIds = [
        String(row.variantId || "").trim(),
        String(row.productId || "").trim(),
        String(row.rawResolvedSku || "").trim(),
      ].filter(Boolean);

      let resolvedSku = "";

      for (const id of candidateIds) {
        const resolved = cicResolveSku(id);
        if (resolved && !resolved.includes("-")) {
          resolvedSku = resolved;
          break;
        }
      }

      if (!resolvedSku) {
        results.push({
          id: row.id,
          docId: row.docId,
          status: "SKIPPED",
          reason: "SKU_NOT_RESOLVED",
        });
        continue;
      }

      const mode = cicModesBySku[resolvedSku];
const activeBom = getActiveBom();
const hasRecipe =
  Array.isArray(activeBom[resolvedSku]) && activeBom[resolvedSku].length > 0;

      if (!mode) {
        results.push({
          id: row.id,
          docId: row.docId,
          sku: resolvedSku,
          status: "SKIPPED",
          reason: "SKU_NOT_CLASSIFIED",
        });
        continue;
      }

      if (mode === "IGNORE") {
        await markPendingRowProcessed(row.id);
        results.push({
          id: row.id,
          docId: row.docId,
          sku: resolvedSku,
          status: "PROCESSED",
          reason: "IGNORED_AS_CONFIGURED",
        });
        continue;
      }

      if (mode === "RECIPE" && !hasRecipe) {
        results.push({
          id: row.id,
          docId: row.docId,
          sku: resolvedSku,
          status: "SKIPPED",
          reason: "RECIPE_STILL_NOT_FOUND",
        });
        continue;
      }

      const inserted = await applyRecipeStock({
        docId: row.docId,
        receiptNumber: "",
        tenantId: row.tenantId,
        orderDate: new Date(row.orderDate),
        soldItems: [
          {
            sku: resolvedSku,
            qty: Number(row.qty || 0),
          },
        ],
        bom: activeBom,
        cicProductModes: cicModesBySku,
        movementSign: row.operation === "RECEIPT/DELETE" ? 1 : -1,
      });

      if (inserted > 0) {
        await markPendingRowProcessed(row.id);

        results.push({
          id: row.id,
          docId: row.docId,
          sku: resolvedSku,
          status: "PROCESSED",
          inserted,
        });
      } else {
        results.push({
          id: row.id,
          docId: row.docId,
          sku: resolvedSku,
          status: "SKIPPED",
          reason: "NO_MOVEMENTS_CREATED",
          inserted,
        });
      }
    }

    res.json({
      ok: true,
      message: "Rielaborazione pending completata",
      total: pendingRows.length,
      processed: results.filter((r) => r.status === "PROCESSED").length,
      skipped: results.filter((r) => r.status === "SKIPPED").length,
      results,
    });
  } catch (err: any) {
    console.error("POST /admin/cic/reprocess-pending error:", err);
    res.status(500).json({
      ok: false,
      error: String(err?.message ?? err),
    });
  }
});

app.post("/admin/sales/backfill-from-raw", async (_req, res) => {
  try {
    const tenantId = String(process.env.TENANT_ID || "IMP001");

    const docsRes = await pool.query(`
      SELECT document_id, raw_payload
      FROM sales_documents
      WHERE tenant_id = $1
      LIMIT 500
    `, [tenantId]);

    let updated = 0;
    let skipped = 0;

    for (const doc of docsRes.rows) {
      const payload =
  typeof doc.raw_payload === "string"
    ? JSON.parse(doc.raw_payload)
    : doc.raw_payload;

if (!payload?.document?.rows) continue;

      const rows = payload.document.rows;

      for (const r of rows) {
const idProduct = String(r?.idProduct || "").trim();
const idVariant = String(r?.idProductVariant || "").trim();

if (!idProduct && !idVariant) {
  skipped++;
  continue;
}

        // match su Item
const cicId = idVariant || idProduct;

const mappedSku = cicResolveSku(cicId);

if (!mappedSku || mappedSku.includes("-")) {
  skipped++;
  continue;
}

const itemRes = await pool.query(
  `
  SELECT sku, name
  FROM "Item"
  WHERE sku = $1
  LIMIT 1
  `,
  [mappedSku]
);

        if (!itemRes.rows.length) {
          skipped++;
          continue;
        }

        const { sku, name } = itemRes.rows[0];

        // aggiorna sales_lines collegate
await pool.query(
  `
  UPDATE sales_lines
  SET sku = $1,
      description = $2
  WHERE document_id = $3
  AND (sku = $4 OR sku = $5)
  `,
  [mappedSku, itemRes.rows[0].name, doc.document_id, idProduct, idVariant]
);

        updated++;
      }
    }

    res.json({
      ok: true,
      updated,
      skipped,
    });
  } catch (err: any) {
    console.error("❌ backfill raw error:", err);
    res.status(500).json({
      ok: false,
      error: String(err?.message ?? err),
    });
  }
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
  const auth = basicAuth({
    users: { [user]: pass },
    challenge: true,
    realm: "Core (staging)",
  });

  app.use((req, res, next) => {
    if (req.path === "/health") return next();
    if (req.path === "/debug/recipes") return next();
    if (req.path === "/debug/cic-product-modes") return next();
    if (req.path === "/debug/cic-unresolved") return next();
    if (req.path === "/debug/cic-webhook-dumps") return next();
    if (req.path === "/debug/cic-products-full") return next();
    if (req.path === "/debug/cic-products-export-sheet") return next();
    if (req.path === "/debug/cic-pending") return next();
    if (req.path === "/debug/cic-pending-open") return next();
    if (req.path.startsWith("/webhooks/cic")) return next();
    if (req.path === "/debug/db") return next();
    if (req.path === "/debug/sales") return next();
    return auth(req, res, next);
  });
}

/* =========================
   API routes
   ========================= */
app.get("/_top-ping", (_req, res) => {
  res.json({ ok: true, where: "server top level" });
});

app.get("/orders-test", (_req, res) => {
  res.json({ ok: true, where: "server direct /orders-test" });
});

app.get("/orders/_server-test", (_req, res) => {
  res.json({ ok: true, where: "server direct /orders/_server-test" });
});

app.use("/auth", authRouter);
app.use("/items", itemsRouter);
app.use("/movements", movementsRouter);
app.use("/stock-v2", stockV2Router);
console.log("✅ Mounting /orders router");
app.use("/orders", ordersRouter);
app.use("/suppliers", suppliersRouter);
app.use("/users", usersRouter);
app.use("/inventory", inventoryRouter);
app.use("/recipes", recipesRouter);
app.use("/cash-closures", cashClosuresRouter);
app.use("/webhooks/cic", webhooksCicRouter);
app.use("/dashboard", dashboardRouter);
app.use("/api", pendingRouter);

app.get("/dashboard/sales", async (req, res) => {
  try {
    const tenantId = String(process.env.TENANT_ID || "IMP001");
    const from = req.query.from ? String(req.query.from) : undefined;
    const to = req.query.to ? String(req.query.to) : undefined;

    const data = await getSalesFeed({
      from,
      to,
      tenantId,
    });

    res.json({
      ok: true,
      documents: data.documents,
      lines: data.lines,
    });
  } catch (err: any) {
    console.error("GET /dashboard/sales error:", err);
    res.status(500).json({
      ok: false,
      error: String(err?.message ?? err),
    });
  }
});


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

  await testDbConnection();
  await initDb();

  await syncCicProducts();
  await syncCicProductModes();
  await syncBom();
  await syncRecipesDbCache();

  const msCic = Math.max(1, CIC_PRODUCTS_SYNC_HOURS) * 60 * 60 * 1000;
  setInterval(() => syncCicProducts(), msCic);
  setInterval(() => syncBom(), 5 * 60 * 1000);
  setInterval(() => syncCicProductModes(), 5 * 60 * 1000);
  setInterval(() => syncRecipesDbCache(), 5 * 60 * 1000);
});
