import crypto from "crypto";
import { upsertPendingRow } from "../data/cicPendingRows.store.js";
import { saveSalesDocumentWithLines } from "../data/sales.store.js";
import { applyRecipeStock } from "./recipeStock.service.js";
import { cicExtractItemsWithDb } from "./cicMapping.service.js";
import { pool } from "../db.js";
import { getRecipeByProductSku } from "../data/recipes.store.js";

import {
  syncCicProducts,
  getItemNameBySku,
  getActiveBom,
  getCicProductModesCache,
  getLastEmergencySyncMs,
  setLastEmergencySyncMs,
} from "../server.js";
import { getCicCatalogMap } from "../server.js";

const CIC_WEBHOOK_SECRET = process.env.CIC_WEBHOOK_SECRET || "";

// =========================
// DEBUG DUMP
// =========================
function buildCicWebhookDebugDump(
  data: any,
  operation: string,
  headers: Record<string, any>
) {
  const document = data?.document ?? {};
  const rows = Array.isArray(document?.rows) ? document.rows : [];
  const payments = Array.isArray(document?.payments) ? document.payments : [];

  return {
    capturedAt: new Date().toISOString(),
    operation,
    headers,
    rawPayload: data,
    rows,
    payments,
  };
}

// =========================
// DESCRIPTION HELPER
// =========================
function extractCicRowDescription(
  rawRow: any,
  cicProduct?: { name?: string } | null
) {
  return (
    rawRow?.description ||
    rawRow?.descriptionReceipt ||
    rawRow?.name ||
    rawRow?.raw?.description ||
    rawRow?.raw?.descriptionReceipt ||
    rawRow?.raw?.name ||
    cicProduct?.name ||
    null
  );
}

function isIgnorableCicRow(rawRow: any, it: any) {
  const productId = String(it?._idProduct || rawRow?.idProduct || "").trim();
  const variantId = String(
    it?._idProductVariant || rawRow?.idVariant || rawRow?.idProductVariant || ""
  ).trim();

  const description = String(
    rawRow?.description ||
      rawRow?.descriptionReceipt ||
      rawRow?.name ||
      rawRow?.raw?.description ||
      rawRow?.raw?.descriptionReceipt ||
      rawRow?.raw?.name ||
      ""
  )
    .trim()
    .toUpperCase();

  const qty = Number(rawRow?.quantity ?? it?.qty ?? 0) || 0;
  const price = Number(rawRow?.price ?? 0) || 0;

  // subtotal / righe contabili / righe vuote
  if (rawRow?.subtotal === true) return true;

  // righe senza riferimenti prodotto e con solo importo/quota
  if (!productId && !variantId) {
    if (
      !description ||
      description.includes("CONTO SEPARATO") ||
      description.includes("QUOTA") ||
      description.includes("DIVISIONE") ||
      description.includes("SPLIT")
    ) {
      return true;
    }


  }

  return false;
}

// =========================
// MAIN WEBHOOK
// =========================
export async function processCicWebhook(req: any, res: any) {
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";

    const signature = (req.header("x-cn-signature") || "").trim();
    const operation = (req.header("x-cn-operation") || "").trim();

    console.log("CIC operation:", operation);

    // =========================
    // SIGNATURE CHECK
    // =========================
    if (CIC_WEBHOOK_SECRET && signature) {
      const expected = crypto
        .createHmac("sha1", CIC_WEBHOOK_SECRET)
        .update(raw, "utf8")
        .digest("hex");

      if (signature !== expected) {
        console.error("❌ CIC signature mismatch");
        return res.status(401).send("Invalid signature");
      }
    }

    // =========================
    // SOLO RECEIPT
    // =========================
    if (!operation.startsWith("RECEIPT/")) {
      return res.status(200).send("OK");
    }

    const data = JSON.parse(raw);

    // =========================
    // IGNORA TEST
    // =========================
    if (String(data?.document?.id || "").startsWith("TEST")) {
      return res.status(200).send("TEST_OK");
    }

    // =========================
    // DEBUG SAVE
    // =========================
    const debugDump = buildCicWebhookDebugDump(data, operation, {
      "x-cn-operation": req.header("x-cn-operation") || "",
    });

    await pool.query(
      `
      INSERT INTO cic_webhook_dumps (id, operation, payload, captured_at)
      VALUES ($1, $2, $3, NOW())
      `,
      [crypto.randomUUID(), operation, JSON.stringify(debugDump)]
    );

    // =========================
    // DATI BASE
    // =========================
    const docId = "CIC-" + String(data?.document?.id || data?.id || "");

    const receiptNumber = String(
      data?.document?.documentNumber ||
        data?.document?.number ||
        data?.number ||
        ""
    ).trim();

    const orderDate = new Date(
      data?.document?.date ||
        data?.document?.creationDate ||
        data?.date ||
        Date.now()
    );

    const tenantId = process.env.TENANT_ID || "IMP001";

    let items = await cicExtractItemsWithDb({
      tenantId,
      data,
    });

    const cicCatalogMap = getCicCatalogMap();

    const rawRows = Array.isArray(data?.document?.rows)
      ? data.document.rows
      : [];

    const payments = Array.isArray(data?.document?.payments)
      ? data.document.payments
      : [];

    const documentAmount =
      Number(data?.document?.amount ?? data?.amount ?? 0) || 0;

    const paymentsTotal = payments.reduce(
      (sum: number, p: any) => sum + (Number(p?.amount ?? 0) || 0),
      0
    );

    // =========================
    // AUTO SYNC CIC
    // =========================
    const hasUnresolved = items.some((it: any) => !it.sku);

    if (hasUnresolved && Date.now() - getLastEmergencySyncMs() > 60_000) {
      await syncCicProducts();
      setLastEmergencySyncMs(Date.now());

      items = await cicExtractItemsWithDb({
        tenantId,
        data,
      });
    }

    const bom = getActiveBom();
    const cicModes = getCicProductModesCache();

    const cicModesBySku = Object.fromEntries(
      Object.entries(cicModes).map(([_, v]: any) => [v.sku, v.mode])
    );

    // =========================
    // 1️⃣ SALVA SALES
    // =========================
    const finalItems: Array<{ sku: string; qty: number }> = [];
    const salesLines: any[] = [];

    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx];

      const rawRow = rawRows[idx];
      const productId = String(it._idProduct || "").trim() || undefined;
      const variantId = String(it._idProductVariant || "").trim() || undefined;

      const cicProduct =
        cicCatalogMap[variantId || ""] || cicCatalogMap[productId || ""];

      let sku = String(it.sku || "").trim();
      const resolvedMode = String(it.mode || "").trim() || "";
      const resolvedSource = it.source || "NONE";

      let description =
        String(extractCicRowDescription(rawRow, cicProduct) || "").trim() || "";

      if (!description && sku) {
        description = await getItemNameBySku(sku);
      }

      const qty = Number(rawRow?.quantity ?? it.qty ?? 0) || 0;
      const unitPrice = Number(rawRow?.price ?? 0) || 0;
      const lineTotal =
        Number(it.total || 0) || qty * unitPrice;

      if (isIgnorableCicRow(rawRow, it)) {
        console.log("↪️ CIC row ignored (split/import/non-stock)", {
          docId,
          idx,
          productId,
          variantId,
          description,
          qty,
          unitPrice,
        });

        salesLines.push({
          lineNo: idx + 1,
          sku,
          description,
          qty,
          unitPrice,
          lineTotal,
          productId,
          variantId,
          mode: resolvedMode,
          tenantId,
          hasRecipe: false,
          resolvedOk: Boolean(sku),
        });

        continue;
      }

      if (!description) {
        console.log("CIC PENDING DEBUG", {
          productId,
          variantId,
          rawDescription: rawRow?.description,
          rawDescriptionReceipt: rawRow?.descriptionReceipt,
          rawName: rawRow?.name,
          rawNestedDescription: rawRow?.raw?.description,
          rawNestedDescriptionReceipt: rawRow?.raw?.descriptionReceipt,
          rawNestedName: rawRow?.raw?.name,
          catalogName: cicProduct?.name,
          finalDescription: description,
        });
      }

      let mode = resolvedMode || cicModesBySku[sku] || "";
      let hasRecipe = false;
      let resolvedOk = false;

      if (resolvedSource === "DB_MAPPING" && resolvedMode === "IGNORE") {
        resolvedOk = true;
        mode = "IGNORE";
      } else if (!sku) {
        resolvedOk = false;

        await upsertPendingRow({
          docId,
          operation,
          orderDate: orderDate.toISOString(),
          tenantId,
          productId,
          variantId,
          rawResolvedSku: "",
          qty,
          total: lineTotal,
          price: unitPrice || undefined,
          description,
          reason: "UNMAPPED_PRODUCT",
          rawRow: rawRow || null,
        });
      } else {
        const recipe = await getRecipeByProductSku(tenantId, sku);
        hasRecipe =
          Array.isArray((bom as any)[sku]) && (bom as any)[sku].length > 0;

        if (!recipe) {
          resolvedOk = false;

          await upsertPendingRow({
            docId,
            operation,
            orderDate: orderDate.toISOString(),
            tenantId,
            productId,
            variantId,
            rawResolvedSku: sku,
            qty,
            total: lineTotal,
            price: unitPrice || undefined,
            description,
            reason: "UNCLASSIFIED_SKU",
            rawRow: rawRow || null,
          });
        } else if (recipe.status !== "ACTIVE") {
          resolvedOk = false;

          await upsertPendingRow({
            docId,
            operation,
            orderDate: orderDate.toISOString(),
            tenantId,
            productId,
            variantId,
            rawResolvedSku: sku,
            qty,
            total: lineTotal,
            price: unitPrice || undefined,
            description,
            reason: "UNCLASSIFIED_SKU",
            rawRow: rawRow || null,
          });
        } else if (!mode) {
          resolvedOk = false;

          await upsertPendingRow({
            docId,
            operation,
            orderDate: orderDate.toISOString(),
            tenantId,
            productId,
            variantId,
            rawResolvedSku: sku,
            qty,
            total: lineTotal,
            price: unitPrice || undefined,
            description,
            reason: "UNCLASSIFIED_SKU",
            rawRow: rawRow || null,
          });
        } else if (mode === "IGNORE") {
          resolvedOk = true;
        } else if (mode === "RECIPE" && !hasRecipe) {
          resolvedOk = false;

          await upsertPendingRow({
            docId,
            operation,
            orderDate: orderDate.toISOString(),
            tenantId,
            productId,
            variantId,
            rawResolvedSku: sku,
            qty,
            total: lineTotal,
            price: unitPrice || undefined,
            description,
            reason: "RECIPE_NOT_FOUND",
            rawRow: rawRow || null,
          });
        } else {
          resolvedOk = true;

          finalItems.push({
            sku,
            qty,
          });
        }
      }

      salesLines.push({
        lineNo: idx + 1,
        sku,
        description,
        qty,
        unitPrice,
        lineTotal,
        productId,
        variantId,
        mode,
        tenantId,
        hasRecipe,
        resolvedOk,
      });
    }

    await saveSalesDocumentWithLines(
      {
        tenantId,
        documentId: docId,
        receiptNumber,
        source: "CIC",
        documentDate: orderDate,
        totalAmount: documentAmount || paymentsTotal,
        paymentsTotal,
        status: operation === "RECEIPT/DELETE" ? "VOID" : "VALID",
        rawPayload: data,
      },
      salesLines
    );

    // =========================
    // 3️⃣ SCARICO
    // =========================
    const movementSign = operation === "RECEIPT/DELETE" ? 1 : -1;

    await applyRecipeStock({
      docId,
      receiptNumber,
      tenantId,
      orderDate,
      soldItems: finalItems,
      bom,
      cicProductModes: cicModesBySku,
      movementSign,
    });

    console.log("✅ MOVIMENTI OK");

    return res.status(200).send("OK");
  } catch (err) {
    console.error("❌ CIC webhook error:", err);
    return res.status(500).send("Webhook error");
  }
}
