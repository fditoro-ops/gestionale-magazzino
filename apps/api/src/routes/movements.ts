import { Router } from "express";
import { randomUUID } from "crypto";
import type { Movement } from "../types/movement.js";
import { loadMovements, saveMovements } from "../data/movements.store.js";
import { CreateMovementSchema } from "../schemas/movement.schema.js";
import { getItemBySku } from "../services/items.service.js";

const router = Router();

/**
 * GET /movements
 */
router.get("/", (_req, res) => {
  const movements = loadMovements([]);
  res.json(movements);
});

function getCurrentQtyForSku(sku: string) {
  const movements = loadMovements([]);

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
router.post("/", (req, res) => {
  const parsed = CreateMovementSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation error",
      details: parsed.error.format(),
    });
  }

  const movements = loadMovements([]);

  const sku = parsed.data.sku.toUpperCase().trim();
  const { quantity, type, reason, note } = parsed.data;

  const item = getItemBySku(sku);

  if (!item) {
    return res.status(400).json({
      error: `SKU ${sku} non esistente in anagrafica`,
    });
  }

  if (item.active === false) {
    return res.status(400).json({
      error: `SKU ${sku} è disattivato`,
    });
  }

  const finalReason = type === "INVENTORY" ? "INVENTARIO" : reason;

  const currentQty = getCurrentQtyForSku(sku);

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

  movements.push(movement);
  saveMovements(movements);

  return res.status(201).json(movement);
});

export default router;
