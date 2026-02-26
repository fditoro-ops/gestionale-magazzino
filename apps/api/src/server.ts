import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import basicAuth from "express-basic-auth";

import movementsRouter from "./routes/movements.js";
import stockV2Router from "./routes/stock.v2.js";
import itemsRouter from "./routes/items.js";
import ordersRouter from "./routes/orders.js";

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

// --- CORS ---
app.use(
  cors({
    origin: process.env.NODE_ENV === "production" ? true : "http://localhost:5173",
    credentials: true,
  })
);

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
      // lascia libero health
      if (req.path === "/health") return next();
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

  // __dirname = apps/api/dist/src
  // ../../../web/dist => apps/web/dist ✅
  const webPath = path.resolve(__dirname, "../../../web/dist");
  console.log("📦 Static path:", webPath);

  app.use(express.static(webPath));

  app.get("*", (_req, res) => {
    res.sendFile(path.join(webPath, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server attivo sulla porta ${PORT}`);
});