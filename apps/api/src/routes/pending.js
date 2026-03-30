import { Router } from "express";
import {
  listPendingRows,
  updatePendingRow,
  markPendingRowProcessed,
  getPendingRowById,
} from "../data/cicPendingRows.store.js";

import { processPendingRow } from "../services/cicProcessor.service.js";

const router = Router();

/**
 * GET /pending
 * Lista tutte le righe pending
 */
router.get("/", async (_req, res) => {
  try {
    const rows = await listPendingRows();
    res.json({ ok: true, rows });
  } catch (err) {
    console.error("GET /pending error", err);
    res.status(500).json({ ok: false });
  }
});

/**
 * PATCH /pending/:id/resolve
 * Risolve manualmente una riga
 */
router.patch("/:id/resolve", async (req, res) => {
  try {
    const { id } = req.params;
    const { resolvedSku, type } = req.body;

    const updated = await updatePendingRow(id, {
      resolvedSku,
      type, // RECIPE | IGNORE
      status: "RESOLVED",
    });

    res.json({ ok: true, row: updated });
  } catch (err) {
    console.error("PATCH resolve error", err);
    res.status(500).json({ ok: false });
  }
});

/**
 * POST /pending/:id/reprocess
 */
router.post("/:id/reprocess", async (req, res) => {
  try {
    const { id } = req.params;

    const row = await getPendingRowById(id);
    if (!row) {
      return res.status(404).json({ ok: false, error: "Not found" });
    }

    await processPendingRow(row);

    await markPendingRowProcessed(id);

    res.json({ ok: true });
  } catch (err) {
    console.error("reprocess error", err);
    res.status(500).json({ ok: false });
  }
});

/**
 * POST /pending/reprocess-all
 */
router.post("/reprocess-all", async (_req, res) => {
  try {
    const rows = await listPendingRows();

    for (const row of rows) {
      try {
        await processPendingRow(row);
        await markPendingRowProcessed(row.id);
      } catch (err) {
        console.error("row failed", row.id);
      }
    }

    res.json({ ok: true, processed: rows.length });
  } catch (err) {
    console.error("reprocess-all error", err);
    res.status(500).json({ ok: false });
  }
});

export default router;
