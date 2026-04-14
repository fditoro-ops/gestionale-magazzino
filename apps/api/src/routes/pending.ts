import { Router } from "express";
import {
  listPendingRows,
  markPendingRowProcessed,
  setResolvedSku,
  bulkResolvePendingRowsByProductVariant,
  bulkMarkPendingRowsIgnoredByProductVariant,
} from "../data/cicPendingRows.store.js";
import { processPendingRow } from "../services/cicProcessor.service.js";
import { enrichPendingRows } from "../services/pendingEnricher.service.js";
import { upsertCicProductMapping } from "../data/cicProductMappings.store.js";

const router = Router();

/**
 * GET /pending
 */
router.get("/", async (req, res) => {
  try {
    const tenantId = String(req.headers["x-tenant-id"] || "IMP001");

    const status =
      req.query.status && typeof req.query.status === "string"
        ? (req.query.status as "PENDING" | "PROCESSED")
        : undefined;

    const reason =
      req.query.reason && typeof req.query.reason === "string"
        ? req.query.reason.trim()
        : "";

    const q =
      req.query.q && typeof req.query.q === "string"
        ? req.query.q.trim().toLowerCase()
        : "";

    let rows = await listPendingRows(status);

    rows = rows.filter(
      (r: any) =>
        r.reason === "UNMAPPED_PRODUCT" ||
        r.reason === "UNCLASSIFIED_SKU" ||
        r.reason === "RECIPE_NOT_FOUND" ||
        r.reason === "RECIPE_INVALID"
    );

    if (reason) {
      rows = rows.filter((r: any) => r.reason === reason);
    }

    const enriched = await enrichPendingRows(rows, tenantId);

    let visibleRows = enriched;

    if (q) {
      visibleRows = enriched.filter((r: any) => {
        const haystack = [
          r.id,
          r.docId,
          r.productId,
          r.variantId,
          r.description,
          r.productName,
          r.cicProductName,
          r.cicVariantName,
          r.catalogSku,
          r.recipeSku,
          r.rawResolvedSku,
          r.resolvedSku,
          r.receiptNumber,
        ]
          .map((v) => String(v || "").toLowerCase())
          .join(" ");

        return haystack.includes(q);
      });
    }

    const counts = {
      total: visibleRows.length,
      pending: visibleRows.filter((r: any) => r.status === "PENDING").length,
      invalid: visibleRows.filter((r: any) => r.reason === "RECIPE_INVALID").length,
    };

    return res.json({
      ok: true,
      rows: visibleRows,
      counts,
    });
  } catch (err) {
    console.error("GET /pending error", err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Internal error",
    });
  }
});

/**
 * PATCH /pending/:id/resolve
 * salva mapping globale + aggiorna pending simili
 */
router.patch("/:id/resolve", async (req, res) => {
  try {
    const tenantId = String(req.headers["x-tenant-id"] || "IMP001");
    const { id } = req.params;

    const resolvedSku = String(req.body?.resolvedSku || "")
      .trim()
      .toUpperCase();

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

    const productId = String(row.productId || "").trim() || null;
    const variantId = String(row.variantId || "").trim() || null;

    if (!productId && !variantId) {
      return res.status(400).json({
        ok: false,
        error: "Pending row has no productId or variantId",
      });
    }

    const mapping = await upsertCicProductMapping({
      tenantId,
      productId,
      variantId,
      sku: resolvedSku,
      mode: "RECIPE",
    });

    const updatedCount = await bulkResolvePendingRowsByProductVariant({
      tenantId,
      productId,
      variantId,
      resolvedSku,
    });

    await setResolvedSku(id, resolvedSku);

    return res.json({
      ok: true,
      mapping,
      updatedPendingRows: updatedCount,
      row: {
        ...row,
        resolvedSku,
      },
    });
  } catch (err) {
    console.error("PATCH /pending/:id/resolve error", err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Internal error",
    });
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
      return res.status(404).json({
        ok: false,
        error: "Not found",
      });
    }

    if (row.status === "PROCESSED") {
      return res.status(400).json({
        ok: false,
        error: "Already processed",
      });
    }

    const resolvedSku = String(row.resolvedSku || "").trim();

    if (!resolvedSku) {
      return res.status(400).json({
        ok: false,
        error: "Resolve first",
      });
    }

    await processPendingRow({
      ...row,
      resolvedSku,
    });

    await markPendingRowProcessed(row.id);

    return res.json({
      ok: true,
      processed: 1,
    });
  } catch (err) {
    console.error("POST /pending/:id/reprocess error", err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Internal error",
    });
  }
});

/**
 * POST /pending/:id/ignore
 * salva mapping IGNORE + chiude pending simili
 */
router.post("/:id/ignore", async (req, res) => {
  try {
    const tenantId = String(req.headers["x-tenant-id"] || "IMP001");
    const { id } = req.params;

    const rows = await listPendingRows();
    const row = rows.find((r: any) => r.id === id);

    if (!row) {
      return res.status(404).json({
        ok: false,
        error: "Not found",
      });
    }

    const productId = String(row.productId || "").trim() || null;
    const variantId = String(row.variantId || "").trim() || null;

    if (!productId && !variantId) {
      return res.status(400).json({
        ok: false,
        error: "Pending row has no productId or variantId",
      });
    }

    const mapping = await upsertCicProductMapping({
      tenantId,
      productId,
      variantId,
      sku: null,
      mode: "IGNORE",
    });

    const updatedCount = await bulkMarkPendingRowsIgnoredByProductVariant({
      tenantId,
      productId,
      variantId,
    });

    return res.json({
      ok: true,
      mapping,
      updatedPendingRows: updatedCount,
    });
  } catch (err) {
    console.error("POST /pending/:id/ignore error", err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Internal error",
    });
  }
});

/**
 * POST /pending/reprocess-all
 */
router.post("/reprocess-all", async (_req, res) => {
  try {
    const rows = (await listPendingRows("PENDING")).filter(
      (r: any) => !!String(r.resolvedSku || "").trim()
    );

    let processed = 0;

    for (const row of rows) {
      try {
        const resolvedSku = String(row.resolvedSku || "").trim();
        if (!resolvedSku) continue;

        await processPendingRow({
          ...row,
          resolvedSku,
        });

        await markPendingRowProcessed(row.id);
        processed++;
      } catch (err) {
        console.error("fail row", row.id, err);
      }
    }

    return res.json({
      ok: true,
      processed,
    });
  } catch (err) {
    console.error("POST /pending/reprocess-all error", err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Internal error",
    });
  }
});

export default router;
