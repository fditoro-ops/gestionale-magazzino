import { pool } from "../src/db.js";
import { applyRecipeStock } from "../src/services/recipeStock.service.js";
import {
  getActiveBom,
  getCicProductModesCache,
} from "../src/server.js";

async function run() {
  const tenantId = process.env.TENANT_ID || "IMP001";

  const from = "2026-03-27T21:39:00+01:00";
  const to = "2026-03-28T05:24:00+01:00";

  console.log("🚀 BACKFILL MOVIMENTI START", { from, to });

  const bom = getActiveBom();
  const cicProductModeCache = getCicProductModesCache();

  const cicModesBySku = Object.fromEntries(
    Object.entries(cicProductModeCache).map(([_, v]: [string, any]) => [
      String(v?.sku || "").trim(),
      v?.mode,
    ])
  ) as Record<string, "RECIPE" | "IGNORE">;

  const docsRes = await pool.query(
    `
    SELECT
      document_id,
      receipt_number,
      document_date,
      source,
      status
    FROM sales_documents
    WHERE source IN ('CIC', 'CIC_BACKFILL')
      AND status = 'VALID'
      AND document_date >= $1
      AND document_date <= $2
    ORDER BY document_date ASC
    `,
    [from, to]
  );

  const docs = docsRes.rows;
  console.log(`📦 Documenti trovati: ${docs.length}`);

  let createdDocs = 0;
  let skippedAlreadyPresent = 0;
  let skippedNoLines = 0;
  let skippedNoRecipeItems = 0;

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const docId = String(doc.document_id || "").trim();

    console.log(`🔎 ${i + 1}/${docs.length} ${docId}`);

    const existingMovements = await pool.query(
      `
      SELECT 1
      FROM movements
      WHERE documento = $1
      LIMIT 1
      `,
      [docId]
    );

   if ((existingMovements.rowCount ?? 0) > 0) {
  skippedAlreadyPresent++;
  console.log(`⏭ già presenti movimenti per ${docId}`);
  continue;
}

    const linesRes = await pool.query(
      `
      SELECT
        sku,
        qty,
        mode,
        has_recipe,
        resolved_ok
      FROM sales_lines
      WHERE document_id = $1
      ORDER BY line_no ASC
      `,
      [docId]
    );

    const lines = linesRes.rows;

    if (!lines.length) {
      skippedNoLines++;
      console.log(`⚠️ nessuna sales_line per ${docId}`);
      continue;
    }

    const soldItems = lines
      .map((line) => ({
        sku: String(line.sku || "").trim(),
        qty: Number(line.qty || 0),
        mode: String(line.mode || "").trim(),
        hasRecipe: Boolean(line.has_recipe),
        resolvedOk: Boolean(line.resolved_ok),
      }))
      .filter((line) => {
        if (!line.sku) return false;
        if (line.qty <= 0) return false;

        const mode = line.mode || cicModesBySku[line.sku] || "";
        const hasRecipe =
          line.hasRecipe ||
          (Array.isArray((bom as any)[line.sku]) &&
            (bom as any)[line.sku].length > 0);

        if (mode !== "RECIPE") return false;
        if (!hasRecipe) return false;

        return true;
      })
      .map((line) => ({
        sku: line.sku,
        qty: line.qty,
      }));

    if (!soldItems.length) {
      skippedNoRecipeItems++;
      console.log(`⚠️ nessuna riga RECIPE valida per ${docId}`);
      continue;
    }

    const inserted = await applyRecipeStock({
      docId,
      receiptNumber: String(doc.receipt_number || "").trim(),
      tenantId,
      orderDate: new Date(doc.document_date),
      soldItems,
      bom,
      cicProductModes: cicModesBySku,
      movementSign: -1,
    });

    createdDocs++;
    console.log(`✅ movimenti creati ${docId}:`, inserted);
  }

  console.log("🎉 BACKFILL MOVIMENTI COMPLETATO");
  console.log({
    totalDocs: docs.length,
    createdDocs,
    skippedAlreadyPresent,
    skippedNoLines,
    skippedNoRecipeItems,
  });

  process.exit(0);
}

run().catch((err) => {
  console.error("❌ BACKFILL MOVIMENTI ERROR:", err);
  process.exit(1);
});
