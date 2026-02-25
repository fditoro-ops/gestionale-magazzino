import { Router } from "express";
import { randomUUID } from "crypto";
import type { Movement } from "../types/movement.js";
import { movements } from "../data/movements.js";
import { saveMovements } from "../data/movements.store.js";
import { CreateMovementSchema } from "../schemas/movement.schema.js";
import { getItemBySku } from "../services/items.service.js";

const router = Router();

/**
 * GET /movements
 */
router.get("/", (_req, res) => {
  res.json(movements);
});

/**
 * Helper: calcola stock corrente per uno SKU (dalla lista movimenti)
 * Nota: assumiamo che lo SKU arrivi già normalizzato (UPPER+trim)
 */
function getCurrentQtyForSku(sku: string) {
  return movements
    .filter((m) => m.sku === sku)
    .reduce((sum, m) => {
      if (m.type === "IN") return sum + m.quantity;
      if (m.type === "OUT" || m.type === "ADJUST") return sum - m.quantity;
      if (m.type === "INVENTORY") return m.quantity; // reset
      return sum;
    }, 0);
}

/**
 * POST /movements
 */
router.post("/", (req, res) => {
  // 1) VALIDAZIONE INPUT (ZOD)
  const parsed = CreateMovementSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation error",
      details: parsed.error.format(),
    });
  }

  // 2) NORMALIZZA SKU (fonte di verità)
  const sku = parsed.data.sku.toUpperCase().trim();
  const { quantity, type, reason, note } = parsed.data;

  // 3) CONTROLLO SKU ESISTENTE IN ANAGRAFICA (STORE)
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

  // 4) LOGICA INVENTORY (reason forzata)
  const finalReason = type === "INVENTORY" ? "INVENTARIO" : reason;

  // 5) CALCOLO STOCK (currentQty + nextQty)
  const currentQty = getCurrentQtyForSku(sku);

  let nextQty = currentQty;
  if (type === "IN") nextQty = currentQty + quantity;
  if (type === "OUT" || type === "ADJUST") nextQty = currentQty - quantity;
  if (type === "INVENTORY") nextQty = quantity;

  // 6) BLOCCO STOCK NEGATIVO (solo per movimenti che scaricano)
  if ((type === "OUT" || type === "ADJUST") && nextQty < 0) {
    return res.status(400).json({
      error: `Stock negativo non consentito per ${sku}`,
      disponibile: currentQty,
      tentativo: nextQty,
    });
  }

  // 7) CREAZIONE MOVIMENTO
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
