import { Router } from "express";
import { pool } from "../db.js";
import { reprocessSinglePending } from "../services/pendingReprocess.service.js";

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

export default router;
