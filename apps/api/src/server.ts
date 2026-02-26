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
const PORT = process.env.PORT || 3001;

// =====================================================
// CORS
// =====================================================
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? true
        : "http://localhost:5173",
    credentials: true,
  })
);

app.use(express.json());

// =====================================================
// HEALTH CHECK (sempre libero)
// =====================================================
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "gestionale-magazzino-api",
    time: new Date().toISOString(),
  });
});

// =====================================================
// BASIC AUTH (staging / produzione opzionale)
// =====================================================
const basicAuthEnabled =
  (process.env.BASIC_AUTH_ENABLED ?? "")
    .trim()
    .toLowerCase() === "true";

const basicAuthUser = (process.env.BASIC_AUTH_USER ?? "").trim();
const basicAuthPass = (process.env.BASIC_AUTH_PASS ?? "").trim();

// Log utili nei log Render
console.log("🔐 BASIC_AUTH_ENABLED =", basicAuthEnabled);
console.log("🔐 BASIC_AUTH_USER set =", Boolean(basicAuthUser));
console.log("🔐 BASIC_AUTH_PASS set =", Boolean(basicAuthPass));

if (basicAuthEnabled) {
  if (!basicAuthUser || !basicAuthPass) {
    console.warn(
      "⚠️ BASIC_AUTH_ENABLED=true ma mancano BASIC_AUTH_USER/PASS"
    );
  } else {
    const authMiddleware = basicAuth({
      users: { [basicAuthUser]: basicAuthPass },
      challenge: true,
      realm: "Core (staging)",
    });

    // Applica auth a TUTTO tranne /health
    app.use((req, res, next) => {
      if (req.path === "/health") {
        return next();
      }
      return authMiddleware(req, res, next);
    });

    console.log("🔐 Basic Auth ATTIVA");
  }
} else {
  console.log("🔓 Basic Auth DISABILITATA");
}

// =====================================================
// API ROUTES
// =====================================================
app.use("/items", itemsRouter);
app.use("/movements", movementsRouter);
app.use("/stock-v2", stockV2Router);
app.use("/orders", ordersRouter);

// =====================================================
// STATIC FRONTEND (solo prod/staging)
// =====================================================
if (process.env.NODE_ENV !== "development") {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Da apps/api/dist/src/server.js → apps/web/dist
  const webPath = path.resolve(__dirname, "../../web/dist");

  console.log("📦 Static path:", webPath);

  app.use(express.static(webPath));

  app.get("*", (_req, res) => {
    res.sendFile(path.join(webPath, "index.html"));
  });
}

// =====================================================
// START SERVER
// =====================================================
app.listen(PORT, () => {
  console.log(`✅ Server attivo sulla porta ${PORT}`);
});