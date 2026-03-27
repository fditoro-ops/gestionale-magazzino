import { pool } from "../db.js";
import { applyRecipeStock } from "./recipeStock.service.js";
import { cicResolveSku } from "./cicMapping.service.js";
import { getActiveBom, getCicProductModesCache } from "../server.js";

type ReprocessSinglePendingParams = {
  pendingId: string;
};

export async function reprocessSinglePending({
  pendingId,
}: ReprocessSinglePendingParams) {
  const pendingRes = await pool.query(
    `
    SELECT *
    FROM cic_pending_rows
    WHERE id = $1
    LIMIT 1
    `,
    [pendingId]
  );

  if (!pendingRes.rows.length) {
    throw new Error("Pending row non trovata");
  }

  const row = pendingRes.rows[0];

  if (String(row.status || "") !== "PENDING") {
    return {
      ok: true,
      status: "SKIPPED",
      reason: "ROW_NOT_PENDING",
      pendingId,
    };
  }

  const candidateIds = [
    String(row.variant_id || "").trim(),
    String(row.product_id || "").trim(),
    String(row.raw_resolved_sku || "").trim(),
  ].filter(Boolean);

  let resolvedSku = "";

  for (const id of candidateIds) {
    const resolved = cicResolveSku(id);
    if (resolved && !resolved.includes("-")) {
      resolvedSku = resolved;
      break;
    }
  }

  if (!resolvedSku) {
    return {
      ok: true,
      status: "SKIPPED",
      reason: "SKU_NOT_RESOLVED",
      pendingId,
    };
  }

  const cicProductModeCache = getCicProductModesCache();

  const cicModesBySku = Object.fromEntries(
    Object.entries(cicProductModeCache).map(([_, v]: [string, any]) => [v.sku, v.mode])
  ) as Record<string, "RECIPE" | "IGNORE">;

  const mode = cicModesBySku[resolvedSku];
  const activeBom = getActiveBom();

  const hasRecipe =
    Array.isArray(activeBom[resolvedSku]) && activeBom[resolvedSku].length > 0;

  if (!mode) {
    return {
      ok: true,
      status: "SKIPPED",
      reason: "SKU_NOT_CLASSIFIED",
      pendingId,
      sku: resolvedSku,
    };
  }

  if (mode === "IGNORE") {
    await pool.query(
      `
      UPDATE cic_pending_rows
      SET
        status = 'PROCESSED',
        processed_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      `,
      [pendingId]
    );

    return {
      ok: true,
      status: "PROCESSED",
      reason: "IGNORED_AS_CONFIGURED",
      pendingId,
      sku: resolvedSku,
      inserted: 0,
    };
  }

  if (mode === "RECIPE" && !hasRecipe) {
    return {
      ok: true,
      status: "SKIPPED",
      reason: "RECIPE_NOT_FOUND",
      pendingId,
      sku: resolvedSku,
    };
  }

  const inserted = await applyRecipeStock({
    docId: String(row.doc_id || ""),
    receiptNumber: "",
    tenantId: String(row.tenant_id || "IMP001"),
    orderDate: row.order_date ? new Date(row.order_date) : new Date(),
    soldItems: [
      {
        sku: resolvedSku,
        qty: Number(row.qty || 0),
      },
    ],
    bom: activeBom,
    cicProductModes: cicModesBySku,
    movementSign: String(row.operation || "") === "RECEIPT/DELETE" ? 1 : -1,
  });

  if (inserted > 0) {
    await pool.query(
      `
      UPDATE cic_pending_rows
      SET
        status = 'PROCESSED',
        processed_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      `,
      [pendingId]
    );

    return {
      ok: true,
      status: "PROCESSED",
      reason: "MOVEMENTS_CREATED",
      pendingId,
      sku: resolvedSku,
      inserted,
    };
  }

  return {
    ok: true,
    status: "SKIPPED",
    reason: "NO_MOVEMENTS_CREATED",
    pendingId,
    sku: resolvedSku,
    inserted: 0,
  };
}
