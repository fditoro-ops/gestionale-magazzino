import { Router } from "express";
import { buildWarehouseView } from "../services/stock.v2.js";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const rows = await buildWarehouseView();
    return res.json({ rows });
  } catch (err) {
    console.error("GET /stock-v2 error:", err);
    return res.status(500).json({ error: "Errore caricamento magazzino" });
  }
});

export default router;
