import { Router } from "express";
import {
  listPendingRows,
  upsertPendingRow,
  markPendingRowProcessed,
} from "../data/cicPendingRows.store.js";

import { processPendingRow } from "../services/cicProcessor.service.js";

const router = Router();

/**
 * GET /pending
 */
router.get("/", async (_req, res) => {
  const rows = await listPendingRows();
  res.json({ ok: true, rows });
});

/**
 * PATCH resolve
 */
router.patch("/:id/resolve", async (req, res) => {
  const { id } = req.params;
  const { resolvedSku, type } = req.body;

  const updated = await upsertPendingRow({
    id,
    resolvedSku,
    type,
    status: "RESOLVED",
  });

  res.json({ ok: true, row: updated });
});

/**
 * POST reprocess singolo
 */
router.post("/:id/reprocess", async (req, res) => {
  const rows = await listPendingRows();
  const row = rows.find((r) => r.id === req.params.id);

  if (!row) return res.status(404).json({ ok: false });

  await processPendingRow(row);
  await markPendingRowProcessed(row.id);

  res.json({ ok: true });
});

/**
 * POST reprocess all
 */
router.post("/reprocess-all", async (_req, res) => {
  const rows = await listPendingRows();

  for (const row of rows) {
    try {
      await processPendingRow(row);
      await markPendingRowProcessed(row.id);
    } catch (err) {
      console.error("fail row", row.id);
    }
  }

  res.json({ ok: true });
});

export default router;
