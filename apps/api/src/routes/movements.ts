import { Router } from "express";
import { randomUUID } from "crypto";
import type { Movement } from "../types/movement.js";
import {
  loadMovements,
  insertMovement,
} from "../data/movements.store.js";
import { CreateMovementSchema } from "../schemas/movement.schema.js";
import {
  getItemBySku,
  assertItemCoreReady,
} from "../services/items.service.js";

const router = Router();

/**
 * GET /movements
 */
router.get("/", async (_req, res) => {
  try {
    const movements = await loadMovements([]);

    movements.sort(
      (a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    res.json(movements);
  } catch (err) {
    console.error("GET /movements error:", err);
    res.status(500).json({ error: "Errore caricamento movimenti" });
  }
});

async function getCurrentQtyForSku(sku: string) {
  const movements = await loadMovements([]);

  return movements
    .filter((m: any) => m.sku === sku)
    .reduce((sum, m: any) => {
      if (m.type === "IN") return sum + m.quantity;
      if (m.type === "OUT" || m.type === "ADJUST") return sum - m.quantity;
      if (m.type === "INVENTORY") return m.quantity;
      return sum;
    }, 0);
}

/**
 * POST /movements
 */
router.post("/", async (req, res) => {
  try {
    const parsed = CreateMovementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation error",
        details: parsed.error.format(),
      });
    }

    const sku = parsed.data.sku.toUpperCase().trim();
    const { quantity, type, reason, note } = parsed.data;

    const item = await getItemBySku(sku);

    if (!item) {
      return res.status(400).json({
        error: `SKU ${sku} non esistente in anagrafica`,
      });
    }

    try {
      assertItemCoreReady(item);
    } catch (e: any) {
      return res.status(400).json({
        error: e?.message ?? `SKU ${sku} non configurato correttamente`,
      });
    }

    const finalReason = type === "INVENTORY" ? "INVENTARIO" : reason;

    const currentQty = await getCurrentQtyForSku(sku);

    let nextQty = currentQty;
    if (type === "IN") nextQty = currentQty + quantity;
    if (type === "OUT" || type === "ADJUST") nextQty = currentQty - quantity;
    if (type === "INVENTORY") nextQty = quantity;

    if ((type === "OUT" || type === "ADJUST") && nextQty < 0) {
      return res.status(400).json({
        error: `Stock negativo non consentito per ${sku}`,
        disponibile: currentQty,
        tentativo: nextQty,
      });
    }

    const movement: Movement = {
      id: randomUUID(),
      sku,
      quantity,
      type,
      reason: finalReason,
      date: new Date().toISOString(),
      note,
    };

    await insertMovement(movement);

    return res.status(201).json(movement);
  } catch (err) {
    console.error("POST /movements error:", err);
    return res.status(500).json({ error: "Errore salvataggio movimento" });
  }
});

export default router;
