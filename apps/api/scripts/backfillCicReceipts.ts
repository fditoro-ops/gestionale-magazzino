import { pool } from "../src/db.js";
import { cicExtractItems } from "../src/services/cicMapping.service.js";
import { saveSalesDocumentWithLines } from "../src/data/sales.store.js";
import { applyRecipeStock } from "../src/services/recipeStock.service.js";
import {
  getActiveBom,
  getCicProductModesCache,
} from "../src/server.js";

const CIC_API_BASE_URL =
  process.env.CIC_API_BASE_URL || "https://api.cassanova.com";
const CIC_API_KEY = process.env.CIC_API_KEY || "";
const CIC_X_VERSION = process.env.CIC_X_VERSION || "1.0";

async function getCicToken() {
  const res = await fetch(`${CIC_API_BASE_URL}/apikey/token`, {
    method: "POST",
    headers: {
      apikey: CIC_API_KEY,
      "X-Version": CIC_X_VERSION,
    },
  });

  const json = await res.json();
  return json.token;
}

async function fetchReceiptsByRange(
  token: string,
  fromIso: string,
  toIso: string
) {
  const url =
    `${CIC_API_BASE_URL}/documents/receipts` +
    `?startDate=${encodeURIComponent(fromIso)}` +
    `&endDate=${encodeURIComponent(toIso)}` +
    `&limit=500`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Version": CIC_X_VERSION,
    },
  });

  if (!res.ok) {
    throw new Error(`CIC receipts fetch failed ${res.status}`);
  }

  return res.json();
}

async function run() {
  const tenantId = process.env.TENANT_ID || "IMP001";

  const from = "2026-03-27T21:39:00+01:00";
  const to = "2026-03-28T05:24:00+01:00";

  console.log("🚀 BACKFILL START", { from, to });

  const token = await getCicToken();
  const data = await fetchReceiptsByRange(token, from, to);

  const receipts = Array.isArray(data) ? data : data?.documents ?? [];
  console.log(`📦 Ricevuti ${receipts.length} scontrini da CIC`);

  const bom = getActiveBom();
  const cicProductModeCache = getCicProductModesCache();

  const cicModesBySku = Object.fromEntries(
    Object.entries(cicProductModeCache).map(([_, v]: [string, any]) => [
      v.sku,
      v.mode,
    ])
  ) as Record<string, "RECIPE" | "IGNORE">;

  for (const receipt of receipts) {
    const docId =
      "CIC-" + String(receipt?.document?.id || receipt?.id || "");

    const exists = await pool.query(
      `SELECT 1 FROM sales_documents WHERE document_id = $1 LIMIT 1`,
      [docId]
    );

    if (exists.rowCount) {
      console.log("⏭ già presente", docId);
      continue;
    }

    const items = cicExtractItems(receipt);

    const rawRows = Array.isArray(receipt?.document?.rows)
      ? receipt.document.rows
      : [];

    const salesLinesToSave = items.map((it: any, idx: number) => {
      const rawRow = rawRows.find((r: any) => {
        return (
          String(r?.idProductVariant || "").trim() ===
            String(it._idProductVariant || "").trim() ||
          String(r?.idProduct || "").trim() ===
            String(it._idProduct || "").trim()
        );
      });

      return {
        lineNo: idx + 1,
        sku: String(it.sku || "").trim(),
        description: String(rawRow?.description || "").trim(),
        qty: Number(it.qty || 0),
        unitPrice: Number(rawRow?.price ?? 0),
        lineTotal:
          Number(rawRow?.calculatedAmount ?? 0) ||
          Number(rawRow?.subtotal ?? 0) ||
          Number(it.total ?? 0),
        productId: String(it._idProduct || ""),
        variantId: String(it._idProductVariant || ""),
        mode: it.sku ? cicModesBySku[it.sku] || "" : "",
        hasRecipe: true,
        resolvedOk: Boolean(it.sku),
        tenantId,
      };
    });

    await saveSalesDocumentWithLines(
      {
        documentId: docId,
        receiptNumber: String(
          receipt?.document?.documentNumber ||
            receipt?.document?.number ||
            ""
        ),
        source: "CIC_BACKFILL",
        status: "VALID",
        documentDate: new Date(
          receipt?.document?.date || Date.now()
        ),
        totalAmount: Number(
          receipt?.document?.amount ?? 0
        ),
        paymentsTotal: Number(
          receipt?.document?.amount ?? 0
        ),
        tenantId,
        rawPayload: receipt,
      },
      salesLinesToSave
    );

    const soldItems = items
      .filter((x) => x.sku)
      .map((x) => ({
        sku: String(x.sku),
        qty: Number(x.qty || 0),
      }));

    await applyRecipeStock({
      docId,
      receiptNumber: String(
        receipt?.document?.documentNumber ||
          receipt?.document?.number ||
          ""
      ),
      tenantId,
      orderDate: new Date(receipt?.document?.date || Date.now()),
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
