import { applyRecipeStock } from "./recipeStock.service.js";
import {
  getActiveBom,
  getCicProductModesCache,
} from "../server.js";

/**
 * Placeholder per eventuale uso futuro (non attivo)
 */
export async function processCicRow(_row: any, _tenantId: string) {
  return { status: "DISABLED" };
}

/**
 * Reprocess di una riga pending CIC
 * - usa SKU risolto
 * - valida presenza ricetta (BOM)
 * - genera movimenti come il webhook
 */
export async function processPendingRow(row: any) {
  // =========================
  // NORMALIZZAZIONE DATI
  // =========================
  const tenantId = String(
    row.tenantId || row.tenant_id || "IMP001"
  );

  const docId = String(
    row.docId || row.doc_id || `PENDING-${row.id}`
  ).trim();

  const resolvedSku = String(
    row.resolvedSku || row.resolved_sku || ""
  )
    .trim()
    .toUpperCase();

  const qty = Number(row.qty || 0) || 0;

  if (!resolvedSku) {
    throw new Error("processPendingRow: resolvedSku missing");
  }

  if (!qty || qty <= 0) {
    throw new Error("processPendingRow: qty invalid");
  }

  // =========================
  // BOM + MODES
  // =========================
  const bom = getActiveBom();
  const cicModes = getCicProductModesCache();

  const cicProductModes = Object.fromEntries(
    Object.entries(cicModes).map(([_, v]: any) => [
      v.sku,
      v.mode,
    ])
  );

  const hasRecipe =
    Array.isArray((bom as any)[resolvedSku]) &&
    (bom as any)[resolvedSku].length > 0;

  if (!hasRecipe) {
    throw new Error(
      `processPendingRow: recipe/BOM not found for SKU ${resolvedSku}`
    );
  }

  // =========================
  // DATA DOCUMENTO
  // =========================
  const orderDateRaw =
    row.orderDate ||
    row.order_date ||
    row.createdAt ||
    row.created_at;

  const orderDate = orderDateRaw
    ? new Date(orderDateRaw)
    : new Date();

  // =========================
  // DEBUG LOG
  // =========================
  console.log("🔁 REPROCESS PENDING", {
    id: row.id,
    docId,
    sku: resolvedSku,
    qty,
    orderDate,
  });

  // =========================
  // SCRITTURA MOVIMENTI
  // =========================
  await applyRecipeStock({
    docId,
    receiptNumber: row.receiptNumber || null,
    tenantId,
    orderDate,
    soldItems: [
      {
        sku: resolvedSku,
        qty,
      },
    ],
    bom,
    cicProductModes,
    movementSign: -1, // vendita → scarico
  });

  console.log("✅ REPROCESS MOVEMENTS OK", {
    docId,
    sku: resolvedSku,
    qty,
  });

  return {
    status: "PROCESSED",
  };
}
