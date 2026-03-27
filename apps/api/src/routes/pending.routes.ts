import { Router } from "express";
import { pool } from "../db.js";
import { reprocessSinglePending } from "../services/pendingReprocess.service.js";
import { getActiveBom, getCicProductModesCache } from "../server.js";
import { cicResolveSku } from "../services/cicMapping.service.js";

const router = Router();

/**
 * POST /pending/:id/reprocess
 * Riprocessa una singola riga
 */
router.post("/pending/:id/reprocess", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await reprocessSinglePending({
      pendingId: id,
    });

    return res.json(result);
  } catch (err: any) {
    console.error("❌ reprocess error:", err);

    return res.status(500).json({
      ok: false,
      error: "REPROCESS_FAILED",
      message: err.message,
    });
  }
});

/**
 * POST /pending/reprocess-all
 * Riprocessa tutte le pending
 */
router.post("/pending/reprocess-all", async (_req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT id
      FROM cic_pending_rows
      WHERE status = 'PENDING'
      ORDER BY created_at ASC
      LIMIT 200
      `
    );

    const rows = result.rows;

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (const r of rows) {
      try {
        const out = await reprocessSinglePending({
          pendingId: r.id,
        });

        if (out.status === "PROCESSED") processed++;
        else skipped++;
      } catch (err) {
        console.error("❌ row error:", r.id, err);
        errors++;
      }
    }

    return res.json({
      ok: true,
      total: rows.length,
      processed,
      skipped,
      errors,
    });
  } catch (err: any) {
    console.error("❌ reprocess-all error:", err);

    return res.status(500).json({
      ok: false,
      error: "REPROCESS_ALL_FAILED",
      message: err.message,
    });
  }
});
/**
 * GET /pending
 * Lista pending con reason calcolata
 */
router.get("/pending", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM cic_pending_rows
      WHERE status = 'PENDING'
      ORDER BY created_at DESC
      LIMIT 200
    `);

    const rows = result.rows;

    const cicProductModeCache = getCicProductModesCache();
    const activeBom = getActiveBom();

    const cicModesBySku = Object.fromEntries(
      Object.entries(cicProductModeCache).map(([_, v]: [string, any]) => [
        v.sku,
        v.mode,
      ])
    ) as Record<string, "RECIPE" | "IGNORE">;

    const enriched = rows.map((row: any) => {
      // 🔧 resolve SKU (logica coerente con il tuo sistema)
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

      let reason = "UNKNOWN";

      if (!resolvedSku) {
        reason = "UNMAPPED_PRODUCT";
      } else {
        const mode = cicModesBySku[resolvedSku];

        if (!mode) {
          reason = "SKU_NOT_CLASSIFIED";
        } else if (mode === "IGNORE") {
          reason = "IGNORED";
        } else {
          const hasRecipe =
            Array.isArray(activeBom[resolvedSku]) &&
            activeBom[resolvedSku].length > 0;

          if (!hasRecipe) {
            reason = "RECIPE_NOT_FOUND";
          } else {
            reason = "READY";
          }
        }
      }

      return {
        id: row.id,
        skuResolved: resolvedSku,
        rawProductId: row.product_id,
        rawVariantId: row.variant_id,
        qty: Number(row.qty || 0),
        reason,
        canProcess: reason === "READY",
        createdAt: row.created_at,
      };
    });

    // 📊 summary utile per UI
    const summary = enriched.reduce((acc: any, r: any) => {
      acc[r.reason] = (acc[r.reason] || 0) + 1;
      return acc;
    }, {});

    return res.json({
      ok: true,
      total: enriched.length,
      summary,
      rows: enriched,
    });
  } catch (err: any) {
    console.error("❌ GET /pending error:", err);

    return res.status(500).json({
      ok: false,
      error: "PENDING_LIST_FAILED",
      message: err.message,
    });
  }
});
router.post("/pending/reprocess-ready", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM cic_pending_rows
      WHERE status = 'PENDING'
      ORDER BY created_at ASC
      LIMIT 200
    `);

    const rows = result.rows;

    let processed = 0;
    let skipped = 0;

    for (const row of rows) {
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

      if (!resolvedSku) continue;

      const cicProductModeCache = getCicProductModesCache();
      const activeBom = getActiveBom();

      const cicModesBySku = Object.fromEntries(
        Object.entries(cicProductModeCache).map(([_, v]: [string, any]) => [
          v.sku,
          v.mode,
        ])
      ) as Record<string, "RECIPE" | "IGNORE">;

      const mode = cicModesBySku[resolvedSku];

      const hasRecipe =
        Array.isArray(activeBom[resolvedSku]) &&
        activeBom[resolvedSku].length > 0;

      if (mode === "RECIPE" && hasRecipe) {
        try {
          await reprocessSinglePending({ pendingId: row.id });
          processed++;
        } catch {
          skipped++;
        }
      }
    }

    return res.json({
      ok: true,
      processed,
      skipped,
    });
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
});

export default router;
