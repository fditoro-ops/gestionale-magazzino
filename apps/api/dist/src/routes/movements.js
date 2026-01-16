import { Router } from "express";
import { randomUUID } from "crypto";
const router = Router();
// finto DB in memoria
const movements = [];
// GET /movements
router.get("/", (_req, res) => {
    res.json(movements);
});
// POST /movements
router.post("/", (req, res) => {
    const { sku, quantity, type, note } = req.body;
    const movement = {
        id: randomUUID(),
        sku,
        quantity,
        type,
        date: new Date().toISOString(),
        note,
    };
    movements.push(movement);
    res.status(201).json(movement);
});
export default router;
