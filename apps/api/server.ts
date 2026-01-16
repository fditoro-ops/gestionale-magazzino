import express from "express";
import movementsRouter from "./src/routes/movements.js";
import stockRouter from "./src/routes/stock.js";


const app = express();
app.use(express.json());
app.use("/movements", movementsRouter);
app.use("/stock", stockRouter);


// Endpoint di salute (fondamentale)
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "gestionale-magazzino-api",
    time: new Date().toISOString(),
  });
});

// Root
app.get("/", (req, res) => {
  res.send("API Gestione Magazzino online ✅");
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`API in ascolto su http://localhost:${PORT}`);
});
    