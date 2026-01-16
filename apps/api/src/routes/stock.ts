import { Router } from "express";
import { movements } from "../data/movements.js";
import { calculateStock } from "../services/stock.js";

const router = Router();

router.get("/", (_req, res) => {
  const stock = calculateStock(movements);
  res.json(stock);
});

export default router;

