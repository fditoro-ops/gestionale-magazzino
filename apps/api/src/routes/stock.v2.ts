import { Router } from "express";
import { buildStockView } from "../services/stock.service.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const showInactive = req.query.showInactive === "true";

    const rows = await buildStockView(showInactive);

    return res.json({ rows });
  } catch (err) {
    console.error("GET /stock-v2 error:", err);
    return res.status(500).json({ error: "Errore caricamento magazzino" });
  }
});

export default router;
