import crypto from "crypto";
import { insertManyMovements } from "../data/movements.store.js";
import { findRecipeBySku } from "../data/recipes.store.js";
import { upsertPendingRow } from "../data/cicPendingRows.store.js";
import { applyRecipeStock } from "./recipeStock.service.js";
import type { Movement } from "../types/movement.js";


// =========================
// 🔥 NUOVO FLOW PRINCIPALE
// =========================
export async function processCicRow(row: any, tenantId: string) {
  const sku = row.externalId || row.productId || row.barcode;

  if (!sku) {
    return { status: "SKIP_NO_SKU" };
  }

  const recipe = await findRecipeBySku(sku, tenantId);

  // ❌ NON TROVATO
  if (!recipe) {
    await upsertPendingRow({
      tenantId,
      sku,
      reason: "UNCLASSIFIED_SKU",
      raw: row,
    });

    return { status: "PENDING_UNCLASSIFIED" };
  }

  // ⏭ IGNORE
  if (recipe.tipo_scarico === "IGNORE") {
    return { status: "IGNORED" };
  }

  // ❌ NON ATTIVO
  if (recipe.status !== "ACTIVE") {
    await upsertPendingRow({
      tenantId,
      sku,
      reason: "RECIPE_INACTIVE",
      raw: row,
    });

    return { status: "PENDING_INACTIVE" };
  }

  // ❌ NON VALIDO
  if (!recipe.last_validation_ok) {
    await upsertPendingRow({
      tenantId,
      sku,
      reason: "RECIPE_INVALID",
      raw: row,
      recipeId: recipe.id,
    });

    return { status: "PENDING_INVALID" };
  }

  // ✅ SCARICO REALE (RICETTA)
  await applyRecipeStock({
    recipeId: recipe.id,
    qty: row.quantity || 1,
    tenantId,
    reference: row.receiptNumber,
  });

  return { status: "OK" };
}


// =========================
// 🔁 VECCHIO FLOW (REPROCESS)
// =========================
export async function processPendingRow(row: any) {
  if (row.type === "IGNORE") return;

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
