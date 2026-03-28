import { pool } from "../src/db.js";
import { applyRecipeStock } from "../src/services/recipeStock.service.js";
import { getActiveBom, getCicProductModesCache } from "../src/server.js";

async function run() {
  const tenantId = process.env.TENANT_ID || "IMP001";

  const from = "2026-03-27T21:39:00+01:00";
  const to = "2026-03-28T05:24:00+01:00";

  console.log("🚀 BACKFILL MOVIMENTI START", { from, to });

  const bom = getActiveBom();
  const cicProductModeCache = getCicProductModesCache();

  const cicModesBySku = Object.fromEntries(
    Object.entries(cicProductModeCache).map(([_, v]: [string, any]) => [
      v.sku,
      v.mode,
    ])
  ) as Record<string, "RECIPE" | "IGNORE">;

  const docsRes = await pool.query(
    `
    SELECT *
    FROM sales_documents
    WHERE source = 'CIC_BACKFILL'
      AND document_date BETWEEN $1 AND $2
    ORDER BY document_date ASC
    `,
    [from, to]
  );

  console.log(`📦 Documenti trovati: ${docsRes.rows.length}`);

  let i = 0;

  for (const doc of docsRes.rows) {
    i++;
    console.log(`⏳ ${i}/${docsRes.rows.length} ${doc.document_id}`);

    const linesRes = await pool.query(
      `
      SELECT sku, qty
      FROM sales_lines
      WHERE document_id = $1
        AND sku IS NOT NULL
        AND sku <> ''
      `,
      [doc.document_id]
    );

    const soldItems = linesRes.rows.map((r: any) => ({
      sku: String(r.sku),
      qty: Number(r.qty || 0),
    }));

    if (!soldItems.length) {
      console.log("⏭ nessuna riga con sku", doc.document_id);
      continue;
    }

    await applyRecipeStock({
      docId: doc.document_id,
      receiptNumber: doc.receipt_number || "",
      tenantId,
      orderDate: new Date(doc.document_date),
      soldItems,
      bom,
      cicProductModes: cicModesBySku,
      movementSign: -1,
    });

    console.log("✅ movimenti creati", doc.document_id);
  }

  console.log("🎉 BACKFILL MOVIMENTI COMPLETATO");
}

run().catch(console.error);
