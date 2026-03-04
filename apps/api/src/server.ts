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

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

// --- Cassa in Cloud ---
const CIC_WEBHOOK_SECRET = process.env.CIC_WEBHOOK_SECRET || "";
const CIC_API_KEY = process.env.CIC_API_KEY || "";

const CIC_API_BASE_URL = process.env.CIC_API_BASE_URL || "https://api.cassanova.com";
const CIC_X_VERSION = process.env.CIC_X_VERSION || "1.0.0";
const CIC_PRODUCTS_PATH = process.env.CIC_PRODUCTS_PATH || "/products";

// Sync settings
const CIC_PRODUCTS_LIMIT = Number(process.env.CIC_PRODUCTS_LIMIT || 200);
const CIC_PRODUCTS_SYNC_HOURS = Number(process.env.CIC_PRODUCTS_SYNC_HOURS || 6);

// Cache: UUID (product.id OR variant.id) -> internalId (SKU000xxx)
let cicIdToSkuMap: Record<string, string> = {};
let cicProductsLastSyncAt: string | null = null;

// Token cache
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

        // ✅ IMPORTANT: mappa anche le varianti (nel webhook spesso arriva idProductVariant)
        const variants: any[] = Array.isArray(p?.variants) ? p.variants : [];
        for (const v of variants) {
          const variantId = String(v?.id || "");
          const variantSku = String(v?.internalId || v?.externalId || "");
          if (variantId && variantSku) map[variantId] = variantSku;
        }
      }

      start += limit;
      if (!products.length) break; // safety
    }

    cicIdToSkuMap = map;
    cicProductsLastSyncAt = new Date().toISOString();
    console.log("✅ CIC prodotti sincronizzati:", Object.keys(cicIdToSkuMap).length, "lastSync:", cicProductsLastSyncAt);
  } catch (err) {
    console.error("❌ Errore sync prodotti CIC:", err);
  }
}

function cicResolveSku(id: string) {
  return cicIdToSkuMap[id] || id; // fallback: UUID se non risolto
}

// --- CORS ---
app.use(
  cors({
    origin: process.env.NODE_ENV === "production" ? true : "http://localhost:5173",
    credentials: true,
  })
);

// ✅ Webhook Cassa in Cloud: rispondi 200 anche a verifiche GET/HEAD/OPTIONS
app.get("/webhooks/cic", (_req, res) => res.status(200).send("OK"));
app.head("/webhooks/cic", (_req, res) => res.status(200).end());
app.options("/webhooks/cic", (_req, res) => res.status(200).end());

// ✅ Webhook Cassa in Cloud (RAW BODY)
app.post("/webhooks/cic", express.raw({ type: "*/*" }), async (req, res) => {
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";

    const signature = (req.header("x-cn-signature") || "").trim();
    const operation = (req.header("x-cn-operation") || "").trim();

    console.log("CIC x-cn-operation:", operation);

    // 🔐 Verifica firma HMAC SHA-1
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

    const data = JSON.parse(raw);

    const docId = "CIC-" + String(data?.document?.id || data?.id || "");
    const items = cicExtractItems(data);

    console.log("CIC DOCID:", docId);
    console.log("CIC ITEMS (sku risolta):", items);

    // Se vediamo UUID non risolti, proviamo una sync al volo (best effort)
    const hasUnresolved = items.some((it) => it.sku.includes("-")); // UUID contiene "-"
    if (hasUnresolved) {
      console.log("ℹ️ CIC: trovati ID non risolti, provo sync prodotti…");
      await syncCicProducts();
    }

    // TODO: qui scrivi Movimentazione DB-SCARICO usando it.sku = SKU000xxx
    // Esempio idempotenza: usa docId + sku

    return res.status(200).send("OK");
  } catch (err) {
    console.error("CIC webhook error:", err);
    return res.status(500).send("Webhook error");
  }
});

function cicExtractItems(data: any) {
  const rows = data?.document?.rows ?? [];
  if (!Array.isArray(rows)) return [];

  return rows
    .map((r: any) => {
      const qty = Number(r?.quantity ?? 0);
      const price = Number(r?.price ?? 0);

      // Nel webhook arrivano entrambi, spesso variant è quello che vuoi
      const idVariant = String(r?.idProductVariant ?? "");
      const idProduct = String(r?.idProduct ?? "");

      const resolved = cicResolveSku(idVariant || idProduct);

      return {
        sku: resolved,                 // ✅ SKU000xxx quando la mappa è ok
        qty,
        total: qty * price,
        _idProduct: idProduct,         // debug
        _idProductVariant: idVariant,  // debug
      };
    })
    .filter((x: any) => x.sku && x.qty);
}

// ✅ JSON per il resto delle API
app.use(express.json());

// --- Health (libero) ---
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "gestionale-magazzino-api",
    time: new Date().toISOString(),
    cicProducts: {
      mapSize: Object.keys(cicIdToSkuMap).length,
      lastSyncAt: cicProductsLastSyncAt,
    },
  });
});

// --- Basic Auth (PRIMA di routes e static) ---
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
    if (req.path.startsWith("/webhooks/cic")) return next();
    return auth(req, res, next);
  });
}

// --- API routes ---
app.use("/items", itemsRouter);
app.use("/movements", movementsRouter);
app.use("/stock-v2", stockV2Router);
app.use("/orders", ordersRouter);

// --- Static frontend in produzione/staging ---
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

  // prima sync
  await syncCicProducts();

  // refresh periodico
  const ms = Math.max(1, CIC_PRODUCTS_SYNC_HOURS) * 60 * 60 * 1000;
  setInterval(() => {
    syncCicProducts();
  }, ms);
});
