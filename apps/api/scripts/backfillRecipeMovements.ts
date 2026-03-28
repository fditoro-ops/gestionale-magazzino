import { pool } from "../src/db.js";
import { applyRecipeStock } from "../src/services/recipeStock.service.js";

async function run() {
  const tenantId = process.env.TENANT_ID || "IMP001";

  const from = "2026-03-27T21:39:00+01:00";
  const to = "2026-03-28T05:24:00+01:00";

  console.log("🚀 BACKFILL MOVIMENTI START", { from, to });

  const docsRes = await pool.query(`
  SELECT document_id, receipt_number, document_date
  FROM sales_documents
  WHERE source = 'CIC_BACKFILL'
  ORDER BY document_date ASC
`);

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

    if (!soldItems.length) continue;

    await applyRecipeStock({
      docId: doc.document_id,
      receiptNumber: doc.receipt_number || "",
      tenantId,
      orderDate: new Date(doc.document_date),
      soldItems,
      bom: {},
      cicProductModes: {},
      movementSign: -1,
    });

    console.log("✅ movimenti creati", doc.document_id);
  }

  console.log("🎉 BACKFILL MOVIMENTI COMPLETATO");
}

run().catch(console.error);
