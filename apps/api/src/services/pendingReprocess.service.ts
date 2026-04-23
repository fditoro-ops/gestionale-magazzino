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
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const pendingRes = await client.query(
      `
      SELECT *
      FROM cic_pending_rows
      WHERE id = $1
      FOR UPDATE
      `,
      [pendingId]
    );

    if (!pendingRes.rows.length) {
      throw new Error("Pending row non trovata");
    }

    const row = pendingRes.rows[0];

    if (String(row.status || "") !== "PENDING") {
      await client.query("COMMIT");
      return {
        ok: true,
        status: "SKIPPED",
        reason: "ROW_NOT_PENDING",
        pendingId,
      };
    }

    const tenantId = String(row.tenant_id || "IMP001");
    const docId = String(row.doc_id || "").trim();

    if (!docId) {
      throw new Error("DOC_ID mancante nel pending");
    }

    const candidateIds = [
      String(row.variant_id || "").trim(),
      String(row.product_id || "").trim(),
    ].filter(Boolean);

    let resolvedSku: string | null = null;

    for (const id of candidateIds) {
      const resolved = cicResolveSku(id);
      if (resolved) {
        resolvedSku = String(resolved).trim();
        break;
      }
    }

    if (!resolvedSku) {
      await client.query("COMMIT");
      return {
        ok: true,
        status: "SKIPPED",
        reason: "SKU_NOT_RESOLVED",
        pendingId,
      };
    }

    const cicProductModeCache = getCicProductModesCache();

    const cicModesBySku = Object.fromEntries(
      Object.entries(cicProductModeCache).map(([_, v]: [string, any]) => [
        String(v?.sku || "").trim(),
        v?.mode,
      ])
    ) as Record<string, "RECIPE" | "IGNORE">;

    const mode = cicModesBySku[resolvedSku] || "";

    const activeBom = getActiveBom();

    const hasRecipe =
      Array.isArray(activeBom[resolvedSku]) &&
      activeBom[resolvedSku].length > 0;

    if (!mode) {
      await client.query("COMMIT");
      return {
        ok: true,
        status: "SKIPPED",
        reason: "SKU_NOT_CLASSIFIED",
        pendingId,
        sku: resolvedSku,
      };
    }

    // 1) aggiorno sales_lines PRIMA di tutto
    // provo a matchare la riga specifica per variant_id / product_id
    const updateRes = await client.query(
      `
      UPDATE sales_lines
      SET
        sku = $1,
        mode = $2,
        has_recipe = $3,
        resolved_ok = true,
        updated_at = NOW()
      WHERE tenant_id = $4
        AND document_id = $5
        AND (
          ($6 <> '' AND variant_id = $6)
          OR
          ($7 <> '' AND product_id = $7)
        )
      `,
      [
        resolvedSku,
        mode,
        hasRecipe,
        tenantId,
        docId,
        String(row.variant_id || "").trim(),
        String(row.product_id || "").trim(),
      ]
    );

    // Se non trova nulla, non continuo "alla cieca"
    if ((updateRes.rowCount ?? 0) === 0) {
      await client.query("COMMIT");
      return {
        ok: true,
        status: "SKIPPED",
        reason: "SALES_LINE_NOT_FOUND",
        pendingId,
        sku: resolvedSku,
        docId,
      };
    }

    if (mode === "IGNORE") {
      await client.query(
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

      await client.query("COMMIT");

      return {
        ok: true,
        status: "PROCESSED",
        reason: "IGNORED_AS_CONFIGURED",
        pendingId,
        sku: resolvedSku,
        inserted: 0,
        updatedSalesLines: updateRes.rowCount ?? 0,
      };
    }

    if (mode === "RECIPE" && !hasRecipe) {
      await client.query("COMMIT");
      return {
        ok: true,
        status: "SKIPPED",
        reason: "RECIPE_NOT_FOUND",
        pendingId,
        sku: resolvedSku,
      };
    }

    // 2) applico scarico solo ora
    const inserted = await applyRecipeStock({
      docId,
      receiptNumber: "",
      tenantId,
      orderDate: row.order_date ? new Date(row.order_date) : new Date(),
      soldItems: [
        {
          sku: resolvedSku,
          qty: Number(row.qty || 0),
        },
      ],
      bom: activeBom,
      cicProductModes: cicModesBySku,
      movementSign:
        String(row.operation || "") === "RECEIPT/DELETE" ? 1 : -1,
    });

    // 3) segno processed
    await client.query(
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

    await client.query("COMMIT");

    return {
      ok: true,
      status: "PROCESSED",
      reason: inserted > 0 ? "MOVEMENTS_CREATED" : "NO_MOVEMENTS_CREATED",
      pendingId,
      sku: resolvedSku,
      inserted,
      updatedSalesLines: updateRes.rowCount ?? 0,
    };
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("❌ reprocessSinglePending error:", err);
    throw err;
  } finally {
    client.release();
  }
}
