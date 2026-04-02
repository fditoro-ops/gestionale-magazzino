import { Router } from "express";
import {
  listPendingRows,
  upsertPendingRow,
  markPendingRowProcessed,
} from "../data/cicPendingRows.store.js";
import { processPendingRow } from "../services/cicProcessor.service.js";
import { enrichPendingRows } from "../services/pendingEnricher.service.js";

const router = Router();

/**
 * GET /pending
 */
router.get("/", async (req, res) => {
  try {
    const tenantId = String(req.headers["x-tenant-id"] || "IMP001");

    const rows = (await listPendingRows()).filter(
      (r: any) =>
        r.reason === "UNMAPPED_PRODUCT" ||
        r.reason === "UNCLASSIFIED_SKU" ||
        r.reason === "RECIPE_NOT_FOUND"
    );

    const enriched = await enrichPendingRows(rows, tenantId);

    const visibleRows = enriched.filter((r: any) => {
      const hasCatalogSku = Boolean(String(r.catalogSku || "").trim());
      const hasRecipeSku = Boolean(String(r.recipeSku || "").trim());

      // mostra solo i pending ancora davvero irrisolti
      return !hasCatalogSku && !hasRecipeSku;
    });

    const counts = {
      total: visibleRows.length,
      pending: visibleRows.filter((r: any) => r.status === "PENDING").length,
      invalid: visibleRows.filter((r: any) => r.reason === "RECIPE_INVALID").length,
    };

    res.json({ ok: true, rows: visibleRows, counts });
  } catch (err) {
    console.error("GET /pending error", err);
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

/**
 * PATCH /pending/:id/resolve
 * assegna uno SKU manuale e lascia la riga in PENDING
 */
router.patch("/:id/resolve", async (req, res) => {
  try {
    const { id } = req.params;
    const { resolvedSku } = req.body;

    if (!resolvedSku) {
      return res.status(400).json({
        ok: false,
        error: "resolvedSku required",
      });
    }

    const rows = await listPendingRows();
    const row = rows.find((r: any) => r.id === id);

    if (!row) {
      return res.status(404).json({
        ok: false,
        error: "Not found",
      });
    }

    const updated = await upsertPendingRow({
      docId: row.docId,
      operation: row.operation,
      orderDate: row.orderDate,
      tenantId: row.tenantId,
      productId: row.productId,
      variantId: row.variantId,
      rawResolvedSku: resolvedSku,
      qty: row.qty,
      total: row.total,
      price: row.price,
      description: row.description || row.productName || null,
      reason: row.reason,
    });

    res.json({ ok: true, row: updated });
  } catch (err) {
    console.error("PATCH /pending/:id/resolve error", err);
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

/**
 * POST /pending/:id/reprocess
 */
router.post("/:id/reprocess", async (req, res) => {
  try {
    const rows = await listPendingRows();
    const row = rows.find((r: any) => r.id === req.params.id);

    if (!row) {
      return res.status(404).json({ ok: false, error: "Not found" });
    }

    if (row.status === "PROCESSED") {
      return res.status(400).json({
        ok: false,
        error: "Already processed",
      });
    }

    if (!row.rawResolvedSku) {
      return res.status(400).json({
        ok: false,
        error: "Resolve first",
      });
    }

    console.log("Processing pending row:", row.id, row.rawResolvedSku);

    await processPendingRow({
      ...row,
      resolvedSku: row.rawResolvedSku,
    });

    await markPendingRowProcessed(row.id);

    res.json({ ok: true, processed: 1 });
  } catch (err) {
    console.error("POST /pending/:id/reprocess error", err);
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

/**
 * POST /pending/reprocess-all
 */
router.post("/reprocess-all", async (_req, res) => {
  try {
    const rows = (await listPendingRows()).filter(
      (r: any) => r.status === "PENDING" && !!r.rawResolvedSku
    );

    let processed = 0;

    for (const row of rows) {
      try {
        await processPendingRow({
          ...row,
          resolvedSku: row.rawResolvedSku,
        });
        await markPendingRowProcessed(row.id);
        processed++;
      } catch (err) {
        console.error("fail row", row.id, err);
      }
    }

    res.json({ ok: true, processed });
  } catch (err) {
    console.error("POST /pending/reprocess-all error", err);
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

export default router;
