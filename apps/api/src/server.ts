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

// --- Cassa in Cloud (Webhook + API) ---
const CIC_WEBHOOK_SECRET = process.env.CIC_WEBHOOK_SECRET || "";
const CIC_API_KEY = process.env.CIC_API_KEY || "";

// Metti qui la base URL corretta dell'API CIC (così non hardcodiamo e la puoi cambiare su Render)
const CIC_API_BASE_URL = process.env.CIC_API_BASE_URL || "https://api.cassanova.com";
// Endpoint prodotti (placeholder: lo confermiamo al primo test)
const CIC_PRODUCTS_PATH = process.env.CIC_PRODUCTS_PATH || "/v1/products";

// Cache: idProduct(UUID) -> internalId(SKU000xxx)
let cicProductMap: Record<string, string> = {};
let cicProductsLastSyncAt: string | null = null;

function cicResolveSku(idProduct: string) {
  return cicProductMap[idProduct] || idProduct; // fallback: lascia UUID se non mappato
}

async function syncCicProducts() {
  if (!CIC_API_KEY) {
    console.log("⚠️ CIC_API_KEY mancante: sync prodotti disattivata");
    return;
  }

  const url = `${CIC_API_BASE_URL}${CIC_PRODUCTS_PATH}`;
  try {
    console.log("🔄 CIC sync prodotti:", url);

    const res = await fetch(url, {
      method: "GET",
      headers: {
        // Se la tua API usa un header diverso, lo adattiamo dopo il primo test
        Authorization: `Bearer ${CIC_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const txt = await res.text();
      console.log("❌ CIC sync prodotti fallita:", res.status, txt);
      return;
    }

    const data = await res.json();

    // Ci aspettiamo o un array o un wrapper { data: [...] }
    const arr: any[] = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];

    if (!arr.length) {
      console.log("⚠️ CIC sync prodotti: risposta senza prodotti (formato inatteso?)");
      console.log("CIC products raw sample:", JSON.stringify(data)?.slice(0, 500));
      return;
    }

    const map: Record<string, string> = {};
    for (const p of arr) {
      const id = String(p?.id || "");
      const internalId = String(p?.internalId || p?.internal_id || "");
      if (id && internalId) map[id] = internalId;
    }

    cicProductMap = map;
    cicProductsLastSyncAt = new Date().toISOString();

    console.log("✅ CIC prodotti sincronizzati:", Object.keys(cicProductMap).length, "lastSync:", cicProductsLastSyncAt);
  } catch (err) {
    console.error("❌ Errore sync prodotti CIC:", err);
  }
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
    console.log("CIC x-cn-signature:", signature);

    // 🔐 Verifica firma HMAC SHA-1
    if (CIC_WEBHOOK_SECRET && signature) {
      const expected = crypto
        .createHmac("sha1", CIC_WEBHOOK_SECRET)
        .update(raw, "utf8")
        .digest("hex");

      if (signature !== expected) {
        console.error("❌ CIC signature mismatch", { received: signature, expected });
        return res.status(401).send("Invalid signature");
      }
    }

    const data = JSON.parse(raw);

    // ✅ Aggiorniamo magazzino SOLO su scontrini/documenti fiscali
    // (Se vuoi includere altri eventi, li aggiungiamo dopo)
    if (!operation.startsWith("RECEIPT/")) {
      console.log("CIC skipped (not receipt):", operation);
      return res.status(200).send("OK");
    }

    const docId = "CIC-" + String(data?.document?.id || data?.id || "");
    const items = cicExtractItems(data);

    console.log("CIC DOCID:", docId);
    console.log("CIC ITEMS NORMALIZZATI:", items);

    // Se qualche prodotto non è mappato, proviamo a sincronizzare una volta (best effort)
    const hasUnknown = items.some((it) => it.sku && it.sku.includes("-")); // UUID contiene "-"
    if (hasUnknown && Object.keys(cicProductMap).length === 0) {
      console.log("ℹ️ CIC map vuota: provo sync prodotti al volo…");
      await syncCicProducts();
    }

    // TODO: qui: scrittura Movimentazione (DB-SCARICO) usando items già convertiti in SKU000xxx
    // Per ora lasciamo solo log (così verifichi che la mappa funziona)

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
      const idProduct = String(r?.idProduct ?? "");

      const mappedSku = cicResolveSku(idProduct);

      return {
        sku: mappedSku, // ✅ ora sarà SKU000xxx se la mappa è pronta
        name: "",       // il nome non arriva nel webhook
        qty,
        total: qty * price,
        _idProduct: idProduct, // utile per debug (puoi rimuoverlo dopo)
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
      mapSize: Object.keys(cicProductMap).length,
      lastSyncAt: cicProductsLastSyncAt,
    },
  });
});

// --- Basic Auth (PRIMA di routes e static) ---
const basicAuthEnabled = process.env.BASIC_AUTH_ENABLED === "true";
const user = process.env.BASIC_AUTH_USER ?? "";
const pass = process.env.BASIC_AUTH_PASS ?? "";

console.log("🔐 BASIC_AUTH_ENABLED =", basicAuthEnabled);
console.log("🔐 BASIC_AUTH_USER set =", Boolean(user));
console.log("🔐 BASIC_AUTH_PASS set =", Boolean(pass));

if (basicAuthEnabled) {
  if (!user || !pass) {
    console.warn("⚠️ BASIC_AUTH_ENABLED=true ma mancano BASIC_AUTH_USER/PASS");
  } else {
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

    console.log("🔐 Basic Auth ATTIVA");
  }
} else {
  console.log("🔓 Basic Auth DISATTIVA");
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
  console.log("📦 Static path:", webPath);

  const indexHtml = path.join(webPath, "index.html");

  if (fs.existsSync(indexHtml)) {
    app.use(express.static(webPath));

    app.get("*", (req, res, next) => {
      const accept = req.headers.accept ?? "";
      if (!accept.includes("text/html")) return next();
      res.sendFile(indexHtml);
    });

    console.log("✅ Frontend static attivo");
  } else {
    console.warn("⚠️ Frontend build non trovato: manca", indexHtml);
  }
}

app.listen(PORT, "0.0.0.0", async () => {
  console.log(`✅ Server attivo sulla porta ${PORT}`);

  // 🔄 Prima sync prodotti all'avvio (best effort)
  await syncCicProducts();

  // 🔁 Refresh periodico (es. ogni 6 ore)
  const hours = Number(process.env.CIC_PRODUCTS_SYNC_HOURS || 6);
  const ms = Math.max(1, hours) * 60 * 60 * 1000;

  setInterval(() => {
    syncCicProducts();
  }, ms);
});
