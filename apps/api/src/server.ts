import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import movementsRouter from "./routes/movements.js";
import stockV2Router from "./routes/stock.v2.js";
import itemsRouter from "./routes/items.js";
import ordersRouter from "./routes/orders.js";

const app = express();

// 🔹 Porta dinamica (fondamentale per Render)
const PORT = process.env.PORT || 3001;

// 🔹 CORS dinamico
app.use(
  cors({
    origin: process.env.NODE_ENV === "production"
      ? true
      : "http://localhost:5173",
  })
);

app.use(express.json());

// 🔹 API routes
app.use("/items", itemsRouter);
app.use("/movements", movementsRouter);
app.use("/stock-v2", stockV2Router);
app.use("/orders", ordersRouter);

// 🔹 Health check
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "gestionale-magazzino-api",
    time: new Date().toISOString(),
  });
});

// 🔹 Se in produzione/staging serve il frontend buildato
if (process.env.NODE_ENV !== "development") {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const webPath = path.join(__dirname, "../../../web/dist");

  app.use(express.static(webPath));

  app.get("*", (_req, res) => {
    res.sendFile(path.join(webPath, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Server attivo sulla porta ${PORT}`);
});
