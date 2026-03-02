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

const CIC_WEBHOOK_SECRET = process.env.CIC_WEBHOOK_SECRET || "";

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
// ✅ Webhook Cassa in Cloud: DEVE stare prima di express.json()
app.post("/webhooks/cic", express.raw({ type: "*/*" }), (req, res) => {
  // Rispondi subito 200
  res.status(200).send("OK");

  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
    console.log("CIC RAW:", raw);

    // Verifica firma (se presente)
    const signature = (req.header("x-cn-signature") || "").trim();
    if (CIC_WEBHOOK_SECRET && signature) {
      const computed = crypto
        .createHmac("sha256", CIC_WEBHOOK_SECRET)
        .update(raw)
        .digest("hex");

      if (!timingSafeEqualHex(computed, signature)) {
        console.error("CIC webhook: signature mismatch");
        return;
      }
    }

    const data = JSON.parse(raw);
    console.log("CIC JSON:", data);

    // TODO: qui dopo mappiamo items -> Movimentazione
  } catch (err) {
    console.error("CIC webhook error:", err);
  }
});

function timingSafeEqualHex(a: string, b: string) {
  try {
    const ab = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

// ✅ JSON per il resto delle API
app.use(express.json());

// --- Health (libero) ---
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "gestionale-magazzino-api",
    time: new Date().toISOString(),
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server attivo sulla porta ${PORT}`);
});