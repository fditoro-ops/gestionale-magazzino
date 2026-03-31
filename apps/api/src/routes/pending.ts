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
  try {
    const rows = (await listPendingRows()).filter(
      (r: any) =>
        r.reason === "UNMAPPED_PRODUCT" ||
        r.reason === "UNCLASSIFIED_SKU" ||
        r.reason === "RECIPE_NOT_FOUND"
    );

    res.json({ ok: true, rows });
  } catch (err) {
    console.error("GET /pending error", err);
    res.status(500).json({ ok: false });
  }
});

/**
 * PATCH /pending/:id/resolve
 */
router.patch("/:id/resolve", async (req, res) => {
  try {
    const { id } = req.params;
    const { resolvedSku, type } = req.body;

    if (!resolvedSku) {
      return res.status(400).json({
        ok: false,
        error: "resolvedSku required",
      });
    }

    const rows = await listPendingRows();
    const row = rows.find((r) => r.id === id);

    if (!row) {
      return res.status(404).json({
        ok: false,
        error: "Not found",
      });
    }

    const updated = await upsertPendingRow({
      ...row,
      resolvedSku,
      type,
      status: "RESOLVED",
    });

    res.json({ ok: true, row: updated });
  } catch (err) {
    console.error("PATCH /pending/:id/resolve error", err);
    res.status(500).json({ ok: false });
  }
});

/**
 * POST /pending/:id/reprocess
 */
router.post("/:id/reprocess", async (req, res) => {
  try {
    const rows = await listPendingRows();
    const row = rows.find((r) => r.id === req.params.id);

    if (!row) {
      return res.status(404).json({ ok: false });
    }

    if (row.status === "PROCESSED") {
      return res.status(400).json({
        ok: false,
        error: "Already processed",
      });
    }

    if (row.status !== "RESOLVED") {
      return res.status(400).json({
        ok: false,
        error: "Resolve first",
      });
    }

    console.log("Processing pending row:", row.id, row.resolvedSku);

    await processPendingRow(row);
    await markPendingRowProcessed(row.id);

    res.json({ ok: true, processed: 1 });
  } catch (err) {
    console.error("POST /pending/:id/reprocess error", err);
    res.status(500).json({ ok: false });
  }
});

/**
 * POST /pending/reprocess-all
 */
router.post("/reprocess-all", async (_req, res) => {
  try {
    const rows = (await listPendingRows()).filter(
      (r) => r.status === "RESOLVED"
    );

    let processed = 0;

    for (const row of rows) {
      try {
        console.log("Processing row:", row.id);

        await processPendingRow(row);
        await markPendingRowProcessed(row.id);

        processed++;
      } catch (err) {
        console.error("fail row", row.id);
      }
    }

    res.json({ ok: true, processed });
  } catch (err) {
    console.error("POST /pending/reprocess-all error", err);
    res.status(500).json({ ok: false });
  }
});

export default router;
