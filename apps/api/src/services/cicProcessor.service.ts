import { applyRecipeStock } from "./recipeStock.service.js";
import { getActiveBom, getCicProductModesCache } from "../server.js";

export async function processCicRow(_row: any, _tenantId: string) {
  return { status: "DISABLED" };
}

export async function processPendingRow(row: any) {
  const tenantId = String(row.tenantId || row.tenant_id || "IMP001");
  const docId = String(row.docId || row.doc_id || "").trim();
  const resolvedSku = String(row.resolvedSku || row.resolved_sku || "").trim().toUpperCase();
  const qty = Number(row.qty || 0) || 0;

  if (!resolvedSku) {
    throw new Error("resolvedSku missing");
  }

  if (!qty || qty <= 0) {
    throw new Error("qty missing or invalid");
  }

  const bom = getActiveBom();
  const cicModes = getCicProductModesCache();

  const cicProductModes = Object.fromEntries(
    Object.entries(cicModes).map(([_, v]: any) => [v.sku, v.mode])
  );

  const hasRecipe =
    Array.isArray((bom as any)[resolvedSku]) &&
    (bom as any)[resolvedSku].length > 0;

  if (!hasRecipe) {
    throw new Error(`Recipe/BOM not found for SKU ${resolvedSku}`);
  }

  const orderDateRaw = row.orderDate || row.order_date || row.createdAt || row.created_at;
  const orderDate = orderDateRaw ? new Date(orderDateRaw) : new Date();

  await applyRecipeStock({
    docId: docId || `PENDING-${row.id}`,
    receiptNumber: null,
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
    movementSign: -1,
  });

  return { status: "PROCESSED" };
}
