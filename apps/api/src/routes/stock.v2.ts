// src/routes/stock.v2.ts
import { Router } from "express";
import { buildWarehouseView } from "../services/stock.v2.js";

const router = Router();

router.get("/", (_req, res) => {
  const rows = buildWarehouseView();
  return res.json({ rows });
});

export default router;
