import express from "express";

const app = express();
app.use(express.json());

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
    