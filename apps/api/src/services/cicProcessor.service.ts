import crypto from "crypto";
import { insertManyMovements } from "../data/movements.store.js";
import { getRecipeByProductSku } from "../data/recipes.store.js";
import { upsertPendingRow } from "../data/cicPendingRows.store.js";
import type { Movement } from "../types/movement.js";

// =========================
// PROCESS CIC ROW
// =========================
export async function processCicRow(_row: any, _tenantId: string) {
  return { status: "DISABLED" };
}

export async function processPendingRow(_row: any) {
  return;
}
  const recipe = await getRecipeByProductSku(tenantId, sku);

  // ❌ NON TROVATO
  if (!recipe) {
    await upsertPendingRow({
      tenantId,
      rawResolvedSku: sku,
      qty: Number(row.quantity || 1),
      total: Number(row.total || 0),
      reason: "UNCLASSIFIED_SKU",
    });

    return { status: "PENDING_UNCLASSIFIED" };
  }

  // ❌ NON ATTIVO
  if (recipe.status !== "ACTIVE") {
    await upsertPendingRow({
      tenantId,
      rawResolvedSku: sku,
      qty: Number(row.quantity || 1),
      total: Number(row.total || 0),
      reason: "UNCLASSIFIED_SKU",
    });

    return { status: "PENDING_INACTIVE" };
  }

  // ✅ fallback semplice → movimento diretto
  const movement: Movement = {
    id: crypto.randomUUID(),
    sku,
    quantity: -Math.abs(row.quantity || 1),
    type: "OUT",
    reason: "SCARICO_RICETTA_CIC",
    date: new Date().toISOString(),
  };

  await insertManyMovements([movement]);

  return { status: "OK" };
}

// =========================
// REPROCESS
// =========================
export async function processPendingRow(row: any) {
  if (!row.resolvedSku) {
    throw new Error("Missing SKU");
  }

  const movement: Movement = {
    id: crypto.randomUUID(),
    sku: row.resolvedSku,
    quantity: -Math.abs(row.qty || 1),
    type: "OUT",
    reason: "SCARICO_RICETTA_CIC",
    date: new Date().toISOString(),
  };

  await insertManyMovements([movement]);
}
