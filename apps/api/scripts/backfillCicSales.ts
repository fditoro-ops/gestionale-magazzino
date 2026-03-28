import { pool } from "../src/db.js";
import { cicGetToken, cicFetchDocumentsByRange } from "../src/services/cicApi.service.js";
import { saveSalesDocumentWithLines } from "../src/data/sales.store.js";
import { applyRecipeStock } from "../src/services/recipeStock.service.js";
import {
  getActiveBom,
  getCicProductModesCache,
} from "../src/server.js";

async function run() {
  const from = new Date("2026-03-27T21:39:00+01:00");
  const to = new Date("2026-03-28T05:24:00+01:00");

  console.log("🚀 BACKFILL CIC", { from, to });

  const docs = await cicFetchDocumentsByRange(from, to);
  console.log(`📦 trovati ${docs.length} documenti`);

  const bom = getActiveBom();
  const cicModesBySku = Object.fromEntries(
    Object.values(getCicProductModesCache()).map((v: any) => [v.sku, v.mode])
  );

  for (const data of docs) {
    const docId = "CIC-" + String(data?.document?.id || data?.id || "");

    const exists = await pool.query(
      `SELECT 1 FROM sales_documents WHERE document_id = $1 LIMIT 1`,
      [docId]
    );

    if (exists.rowCount) {
      console.log("⏭ già presente", docId);
      continue;
    }

    const rawRows = Array.isArray(data?.document?.rows)
      ? data.document.rows
      : [];

    const salesLines = rawRows.map((r: any, idx: number) => ({
      lineNo: idx + 1,
      sku: String(r.sku || "").trim(),
      description: r.description || "",
      qty: Number(r.quantity || 0),
      unitPrice: Number(r.price || 0),
      lineTotal:
        Number(r.calculatedAmount || 0) ||
        Number(r.subtotal || 0) ||
        Number(r.quantity || 0) * Number(r.price || 0),
      productId: String(r.idProduct || ""),
      variantId: String(r.idProductVariant || ""),
      mode: cicModesBySku[r.sku] || "",
      hasRecipe: true,
      resolvedOk: true,
      tenantId: "IMP001",
    }));

    await saveSalesDocumentWithLines(
      {
        documentId: docId,
        receiptNumber: String(data?.document?.documentNumber || ""),
        source: "CIC_BACKFILL",
        status: "VALID",
        documentDate: new Date(data.document.date),
        totalAmount: Number(data.document.amount || 0),
        paymentsTotal: Number(data.document.amount || 0),
        tenantId: "IMP001",
        rawPayload: data,
      },
      salesLines
    );

    const soldItems = salesLines
      .filter((l) => l.sku)
      .map((l) => ({
        sku: l.sku,
        qty: l.qty,
      }));

    await applyRecipeStock({
      docId,
      receiptNumber: String(data?.document?.documentNumber || ""),
      tenantId: "IMP001",
      orderDate: new Date(data.document.date),
      soldItems,
      bom,
      cicProductModes: cicModesBySku,
      movementSign: -1,
    });

    console.log("✅ recuperato", docId);
  }

  console.log("🎉 BACKFILL COMPLETATO");
}

run().catch(console.error);
