°import path from "path";
import { fileURLToPath } from "url";
import basicAuth from "express-basic-auth";
import fs from "fs";
import crypto from "crypto";

import movementsRouter from "./routes/movements.js";
import stockV2Router from "./routes/stock.v2.js";
import itemsRouter from "./routes/items.js";
import ordersRouter from "./routes/orders.js";
import { applyRecipeStock } from "./services/recipeStock.service";

/* =========================
   BOM (Google Sheet) Reader
   ========================= */

type BomLine = { ingredientSku: string; qty: number; um: string };
type BomMap = Record<string, BomLine[]>;

let bomCache: BomMap = {};
let bomLastSyncAt: string | null = null;
let bomLastError: string | null = null;

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
  // Google gviz response: "google.visualization.Query.setResponse(<json>);"
  const json = JSON.parse(text.substring(47).slice(0, -2));
  const rows = json?.table?.rows ?? [];

  const recipes: BomMap = {};

  for (const r of rows) {
    const c = r?.c ?? [];

    // A: ID PRODOTTO FINITO
    // C: ID MATERIA PRIMA
    // E: UNITA UTILIZZATA
    // F: U.M. USCITA
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
   App
   ========================= */

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

// --- Cassa in Cloud ---
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

      for (const p of products) {
        const productId = String(p?.id || "");
        const productSku = String(p?.internalId || "");
        if (productId && productSku) map[productId] = productSku;

        const variants: any[] = Array.isArray(p?.variants) ? p.variants : [];
        for (const v of variants) {
          const variantId = String(v?.id || "");
          const variantSku = String(v?.internalId || v?.externalId || "");
          if (variantId && variantSku) map[variantId] = variantSku;
        }
      }

      start += limit;
      if (!products.length) break;
    }

    cicIdToSkuMap = map;
    cicProductsLastSyncAt = new Date().toISOString();
    console.log("✅ CIC prodotti sincronizzati:", Object.keys(cicIdToSkuMap).length, "lastSync:", cicProductsLastSyncAt);
  } catch (err) {
    console.error("❌ Errore sync prodotti CIC:", err);
  }
}

function cicResolveSku(id: string) {
  return cicIdToSkuMap[id] || id;
}

function cicExtractItems(data: any) {
  const rows = data?.document?.rows ?? [];
  if (!Array.isArray(rows)) return [];

  return rows
    .map((r: any) => {
      const qty = Number(r?.quantity ?? 0);
      const price = Number(r?.price ?? 0);

      const idVariant = String(r?.idProductVariant ?? "");
      const idProduct = String(r?.idProduct ?? "");

      const resolved = cicResolveSku(idVariant || idProduct);

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
   Middleware
   ========================= */

app.use(
  cors({
    origin: process.env.NODE_ENV === "production" ? true : "http://localhost:5173",
    credentials: true,
  })
);

// ✅ Webhook checks
app.get("/webhooks/cic", (_req, res) => res.status(200).send("OK"));
app.head("/webhooks/cic", (_req, res) => res.status(200).end());
app.options("/webhooks/cic", (_req, res) => res.status(200).end());

// ✅ Webhook raw
app.post("/webhooks/cic", express.raw({ type: "*/*" }), async (req, res) => {
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";

    const signature = (req.header("x-cn-signature") || "").trim();
    const operation = (req.header("x-cn-operation") || "").trim();

    console.log("CIC x-cn-operation:", operation);

    // 🔐 Firma
    if (CIC_WEBHOOK_SECRET && signature) {
      const expected = crypto.createHmac("sha1", CIC_WEBHOOK_SECRET).update(raw, "utf8").digest("hex");
      if (signature !== expected) {
        console.error("❌ CIC signature mismatch");
        return res.status(401).send("Invalid signature");
      }
    }

    // ✅ Solo scontrini
    if (!operation.startsWith("RECEIPT/")) {
      console.log("CIC skipped (not receipt):", operation);
      return res.status(200).send("OK");
    }

    // ✅ Parse body
    const data = JSON.parse(raw);

    // ✅ docId
    const docId = "CIC-" + String(data?.document?.id || data?.id || "");

    // ✅ data/ora (fallback ad adesso se non c'è)
    const orderDate = new Date(
      data?.document?.date || data?.document?.creationDate || Date.now()
    );

    // ✅ tenantId: per ora prendiamolo da ENV (poi lo rendiamo multi-tenant)
    const tenantId = process.env.TENANT_ID || "IMP001";

    // ✅ righe vendute (SKU già risolto se mappa ok)
    let items = cicExtractItems(data);

    // Se ci sono UUID non risolti, prova sync e ri-estrai
    const hasUnresolved = items.some((it) => String(it.sku).includes("-"));
    if (hasUnresolved) {
      console.log("ℹ️ CIC: trovati ID non risolti, provo sync prodotti…");
      await syncCicProducts();
      items = cicExtractItems(data);
    }

    console.log("CIC DOCID:", docId);
    console.log("CIC ITEMS (sku risolta):", items);

    // ✅ Applica ricettario (BOM)
    const inserted = applyRecipeStock({
      docId,
      tenantId,
      orderDate,
      soldItems: items.map((i: any) => ({ sku: i.sku, qty: i.qty })),
      bom: bomCache, // <-- questa è la tua cache aggiornata da syncBom()
    });

    console.log("✅ SCARICHI GENERATI:", inserted);

    return res.status(200).send("OK");
  } catch (err) {
    console.error("CIC webhook error:", err);
    return res.status(500).send("Webhook error");
  }
});

console.log("SCARICHI GENERATI:", inserted);
   
     const data = JSON.parse(raw);

    const docId = "CIC-" + String(data?.document?.id || data?.id || "");
    const items = cicExtractItems(data);

    // Se ci sono UUID non risolti, prova sync
    const hasUnresolved = items.some((it) => String(it.sku).includes("-"));
    if (hasUnresolved) {
      console.log("ℹ️ CIC: trovati ID non risolti, provo sync prodotti…");
      await syncCicProducts();
    }

    console.log("CIC DOCID:", docId);
    console.log("CIC ITEMS (sku risolta):", items);

    // 🔜 Step successivo: usare bomCache[SKU_FINITO] per generare movimenti ingredienti

    return res.status(200).send("OK");
  } catch (err) {
    console.error("CIC webhook error:", err);
    return res.status(500).send("Webhook error");
  }
});

// ✅ JSON for the rest
app.use(express.json());

/* =========================
   Debug endpoints
   ========================= */

app.get("/debug/recipes", (_req, res) => {
  res.json({
    recipesCount: Object.keys(bomCache).length,
    bomLastSyncAt,
    bomLastError,
    sample: Object.entries(bomCache).slice(0, 5),
  });
});

// --- Health (libero) ---
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "gestionale-magazzino-api",
    time: new Date().toISOString(),
    cicProducts: { mapSize: Object.keys(cicIdToSkuMap).length, lastSyncAt: cicProductsLastSyncAt },
    bom: { recipesCount: Object.keys(bomCache).length, lastSyncAt: bomLastSyncAt, lastError: bomLastError },
  });
});

// --- Basic Auth ---
const basicAuthEnabled = process.env.BASIC_AUTH_ENABLED === "true";
const user = process.env.BASIC_AUTH_USER ?? "";
const pass = process.env.BASIC_AUTH_PASS ?? "";

if (basicAuthEnabled && user && pass) {
  const auth = basicAuth({ users: { [user]: pass }, challenge: true, realm: "Core (staging)" });

  app.use((req, res, next) => {
    if (req.path === "/health") return next();
    if (req.path === "/debug/recipes") return next();
    if (req.path.startsWith("/webhooks/cic")) return next();
    return auth(req, res, next);
  });
}

// --- API routes ---
app.use("/items", itemsRouter);
app.use("/movements", movementsRouter);
app.use("/stock-v2", stockV2Router);
app.use("/orders", ordersRouter);

// --- Static frontend ---
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

app.listen(PORT, "0.0.0.0", async () => {
  console.log(`✅ Server attivo sulla porta ${PORT}`);

  // Sync iniziali
  await syncCicProducts();
  await syncBom();

  // refresh periodico CIC
  const msCic = Math.max(1, CIC_PRODUCTS_SYNC_HOURS) * 60 * 60 * 1000;
  setInterval(() => syncCicProducts(), msCic);

  // refresh BOM ogni 5 minuti (puoi cambiare)
  setInterval(() => syncBom(), 5 * 60 * 1000);
});
