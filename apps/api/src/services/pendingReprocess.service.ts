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

    // 🔒 Lock riga per evitare doppio processamento
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

    // 🚫 già processata → skip
    if (String(row.status || "") !== "PENDING") {
      await client.query("COMMIT");
      return {
        ok: true,
        status: "SKIPPED",
        reason: "ROW_NOT_PENDING",
        pendingId,
      };
    }

    // ✅ resolve SKU corretto (async)
const candidateIds = [
  String(row.variant_id || "").trim(),
  String(row.product_id || "").trim(),
  String(row.barcode || "").trim(),
].filter(Boolean);

let resolvedSku: string | null = null;

for (const id of candidateIds) {
  const resolved = cicResolveSku(id);
  if (resolved) {
    resolvedSku = resolved;
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

    // 📦 cache modalità CIC
    const cicProductModeCache = getCicProductModesCache();

    const cicModesBySku = Object.fromEntries(
      Object.entries(cicProductModeCache).map(([_, v]: [string, any]) => [
        v.sku,
        v.mode,
      ])
    ) as Record<string, "RECIPE" | "IGNORE">;

    const mode = cicModesBySku[resolvedSku];

    // 📖 BOM attivo
    const activeBom = getActiveBom();

    const hasRecipe =
      Array.isArray(activeBom[resolvedSku]) &&
      activeBom[resolvedSku].length > 0;

    // 🚫 non classificato
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

    // 🟡 IGNORE → segno processato senza movimenti
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
      };
    }

    // 🚫 RECIPE ma non esiste
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

    // ⚙️ applico scarico ricetta
    const inserted = await applyRecipeStock({
      docId: row.doc_id || `REPROCESS:${pendingId}`,
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
      movementSign:
        String(row.operation || "") === "RECEIPT/DELETE" ? 1 : -1,
    });

    // ✅ se ha creato movimenti → segno processato
    if (inserted > 0) {
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
        reason: "MOVEMENTS_CREATED",
        pendingId,
        sku: resolvedSku,
        inserted,
      };
    }

    // ⚠️ nessun movimento creato
    await client.query("COMMIT");

    return {
      ok: true,
      status: "SKIPPED",
      reason: "NO_MOVEMENTS_CREATED",
      pendingId,
      sku: resolvedSku,
      inserted: 0,
    };
  } catch (err: any) {
    await client.query("ROLLBACK");

    console.error("❌ reprocessSinglePending error:", err);

    throw err;
  } finally {
    client.release();
  }
}
