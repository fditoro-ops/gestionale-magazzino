import crypto from "crypto";
import { appendCicWebhookDump } from "../data/cicWebhookDump.store.js";
import { upsertUnresolved } from "../data/cicUnresolved.store.js";
import { upsertPendingRow } from "../data/cicPendingRows.store.js";
import { saveSalesDocumentWithLines } from "../data/sales.store.js";
import { applyRecipeStock } from "./recipeStock.service.js";
import { cicExtractItems } from "./cicMapping.service.js";

import {
  syncCicProducts,
  getItemNameBySku,
  getActiveBom,
  getCicProductModesCache,
  getLastEmergencySyncMs,
  setLastEmergencySyncMs,
} from "../server.js";

const CIC_WEBHOOK_SECRET = process.env.CIC_WEBHOOK_SECRET || "";

function buildCicWebhookDebugDump(
  data: any,
  operation: string,
  headers: Record<string, any>
) {
  const document = data?.document ?? {};
  const rows = Array.isArray(document?.rows) ? document.rows : [];
  const payments = Array.isArray(document?.payments) ? document.payments : [];
  const orderSummary = document?.orderSummary ?? null;
  const user = document?.user ?? null;

  return {
    capturedAt: new Date().toISOString(),
    operation,
    headers,

    receiptTopLevel: {
      id: data?.id ?? null,
      number: data?.number ?? null,
      date: data?.date ?? null,
      datetime: data?.datetime ?? null,
      zNumber: data?.zNumber ?? null,
      taxCode: data?.taxCode ?? null,
      vatNumber: data?.vatNumber ?? null,
      lotteryCode: data?.lotteryCode ?? null,
    },

    documentTopLevel: {
      id: document?.id ?? null,
      description: document?.description ?? null,
      amount: document?.amount ?? null,
      change: document?.change ?? null,
      note: document?.note ?? null,
      externalId: document?.externalId ?? null,
      email: document?.email ?? null,
      confirmed: document?.confirmed ?? null,
      taxFree: document?.taxFree ?? null,
      userType: document?.userType ?? null,
      documentReason: document?.documentReason ?? null,
      date: document?.date ?? null,
      datetime: document?.datetime ?? null,
      creationDate: document?.creationDate ?? null,
      number: document?.number ?? null,
      documentNumber: document?.documentNumber ?? null,
      receiptNumber: document?.receiptNumber ?? null,
    },

    orderSummary: orderSummary
      ? {
          id: orderSummary?.id ?? null,
          openingTime: orderSummary?.openingTime ?? null,
          closingTime: orderSummary?.closingTime ?? null,
          amount: orderSummary?.amount ?? null,
          covers: orderSummary?.covers ?? null,
          idTable: orderSummary?.idTable ?? null,
          tableName: orderSummary?.tableName ?? null,
          code: orderSummary?.code ?? null,
        }
      : null,

    user: user
      ? {
          id: user?.id ?? null,
          name: user?.name ?? null,
        }
      : null,

    payments: payments.map((p: any) => ({
      paymentType: p?.paymentType ?? null,
      amount: p?.amount ?? null,
      paymentNote: p?.paymentNote ?? null,
      bankAccountHolder: p?.bankAccountHolder ?? null,
      bankAccountInstitute: p?.bankAccountInstitute ?? null,
      bankAccountIBAN: p?.bankAccountIBAN ?? null,
      change: p?.change ?? null,
      customPayment: p?.customPayment ?? null,
      ticket: p?.ticket ?? null,
    })),

    rows: rows.map((r: any) => ({
      id: r?.id ?? null,
      subtotal: r?.subtotal ?? null,
      refund: r?.refund ?? null,
      menu: r?.menu ?? null,
      composition: r?.composition ?? null,
      coverCharge: r?.coverCharge ?? null,
      idProduct: r?.idProduct ?? null,
      idProductVariant: r?.idProductVariant ?? null,
      idCategory: r?.idCategory ?? null,
      idDepartment: r?.idDepartment ?? null,
      salesType: r?.salesType ?? null,
      idTax: r?.idTax ?? null,
      idSalesMode: r?.idSalesMode ?? null,
      stockMovementEnabled: r?.stockMovementEnabled ?? null,
      idStockMovement: r?.idStockMovement ?? null,
      idOutgoingMovement: r?.idOutgoingMovement ?? null,
      rowNumber: r?.rowNumber ?? null,
      quantity: r?.quantity ?? null,
      price: r?.price ?? null,
      percentageVariation: r?.percentageVariation ?? null,
      variation: r?.variation ?? null,
      variationType: r?.variationType ?? null,
      note: r?.note ?? null,
      calculatedAmount: r?.calculatedAmount ?? null,
      shippingCost: r?.shippingCost ?? null,
      raw: r,
    })),

    rawPayload: data,
  };
}

export async function processCicWebhook(req: any, res: any) {
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";

    const signature = (req.header("x-cn-signature") || "").trim();
    const operation = (req.header("x-cn-operation") || "").trim();
    console.log("CIC x-cn-operation:", operation);

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

    if (!operation.startsWith("RECEIPT/")) {
      console.log("CIC skipped (not receipt):", operation);
      return res.status(200).send("OK");
    }

    const data = JSON.parse(raw);

    const debugDump = buildCicWebhookDebugDump(data, operation, {
      "x-cn-operation": req.header("x-cn-operation") || "",
      "x-cn-signature": req.header("x-cn-signature") || "",
      "content-type": req.header("content-type") || "",
    });

    await appendCicWebhookDump(debugDump);

    const docId = "CIC-" + String(data?.document?.id || data?.id || "");
    const receiptNumber = String(
      data?.document?.documentNumber ||
        data?.document?.number ||
        data?.document?.receiptNumber ||
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

    let items = cicExtractItems(data);

    const rawRows = Array.isArray(data?.document?.rows) ? data.document.rows : [];
    const payments = Array.isArray(data?.document?.payments)
      ? data.document.payments
      : [];

    const documentAmount =
      Number(data?.document?.amount ?? data?.amount ?? 0) || 0;

    const paymentsTotal = payments.reduce(
      (sum: number, p: any) => sum + (Number(p?.amount ?? 0) || 0),
      0
    );

   const hasUnresolved = items.some((it: any) => !it.sku);

    if (hasUnresolved && Date.now() - getLastEmergencySyncMs() > 60_000) {
      console.log("ℹ️ CIC: trovati ID non risolti, provo sync prodotti…");
      await syncCicProducts();
      setLastEmergencySyncMs(Date.now());
      items = cicExtractItems(data);
    }

   const bom = getActiveBom();
    const cicProductModeCache = getCicProductModesCache();

    const cicModesBySku = Object.fromEntries(
      Object.entries(cicProductModeCache).map(([_, v]: [string, any]) => [v.sku, v.mode])
    ) as Record<string, "RECIPE" | "IGNORE">;

    const salesLinesToSave = await Promise.all(
      items.map(async (it: any, idx: number) => {
        const sku = String(it.sku || "").trim();

        const rawRow = rawRows.find((r: any) => {
          const rowVariant = String(r?.idProductVariant ?? "").trim();
          const rowProduct = String(r?.idProduct ?? "").trim();

          return (
            rowVariant === String(it._idProductVariant || "").trim() ||
            rowProduct === String(it._idProduct || "").trim()
          );
        });

        const resolvedOk = Boolean(sku) && !sku.includes("-");
        const mode = resolvedOk ? cicModesBySku[sku] || "" : "";
        const hasRecipe =
          resolvedOk && Array.isArray((bom as any)[sku]) && (bom as any)[sku].length > 0;

        let description = String(
          rawRow?.description ||
            rawRow?.descriptionReceipt ||
            rawRow?.name ||
            ""
        ).trim();

        if (!description && sku) {
          description = await getItemNameBySku(sku);
        }

        const qty = Number(rawRow?.quantity ?? it.qty ?? 0) || 0;
        const unitPrice = Number(rawRow?.price ?? 0) || 0;

        const rawCalculatedAmount = Number(rawRow?.calculatedAmount ?? NaN);
        const rawSubtotal = Number(rawRow?.subtotal ?? NaN);
        const extractedTotal = Number(it.total ?? NaN);
        const fallbackTotal = qty * unitPrice;

        const lineTotal =
          Number.isFinite(rawCalculatedAmount) && rawCalculatedAmount > 0
            ? rawCalculatedAmount
            : Number.isFinite(rawSubtotal) && rawSubtotal > 0
            ? rawSubtotal
            : Number.isFinite(extractedTotal) && extractedTotal > 0
            ? extractedTotal
            : fallbackTotal;

        return {
          lineNo: idx + 1,
          sku,
          description,
          qty,
          unitPrice,
          lineTotal,
          productId: String(it._idProduct || "").trim(),
          variantId: String(it._idProductVariant || "").trim(),
          mode,
          hasRecipe,
          resolvedOk,
          tenantId,
        };
      })
    );

    await saveSalesDocumentWithLines(
      {
        documentId: docId,
        receiptNumber,
        source: "CIC",
        status: operation === "RECEIPT/DELETE" ? "VOID" : "VALID",
        documentDate: orderDate,
        totalAmount: documentAmount,
        paymentsTotal,
        tenantId,
        rawPayload: data,
      },
      salesLinesToSave
    );

    const finalResolvedItems: Array<{ sku: string; qty: number }> = [];

    for (const it of items) {
      const sku = String(it.sku || "").trim();
      const mode = cicModesBySku[sku];
      const hasRecipe = Array.isArray((bom as any)[sku]) && (bom as any)[sku].length > 0;

      const rawRow = rawRows.find((r: any) => {
        const rowVariant = String(r?.idProductVariant ?? "").trim();
        const rowProduct = String(r?.idProduct ?? "").trim();

        return (
          rowVariant === String(it._idProductVariant || "").trim() ||
          rowProduct === String(it._idProduct || "").trim()
        );
      });

      if (!sku || sku.includes("-")) {
        console.warn("❗CIC UNMAPPED PRODUCT:", {
          productId: it._idProduct,
          variantId: it._idProductVariant,
          rawSku: sku,
        });

        await upsertPendingRow({
          docId,
          operation,
          orderDate: orderDate.toISOString(),
          tenantId,
          productId: it._idProduct || undefined,
          variantId: it._idProductVariant || undefined,
          rawResolvedSku: sku,
          qty: Number(it.qty || 0),
          total: Number(it.total || 0),
          price: Number(rawRow?.price ?? 0),
          description:
            String(
              rawRow?.description ||
                rawRow?.descriptionReceipt ||
                rawRow?.name ||
                ""
            ).trim() || undefined,
          reason: "UNMAPPED_PRODUCT",
          rawRow: rawRow || null,
        });

        await upsertUnresolved({
          productId: it._idProduct || undefined,
          variantId: it._idProductVariant || undefined,
          rawSku: String(sku),
          docId,
          operation,
          total: it.total,
        });

        continue;
      }

      if (!mode) {
        console.log("⚠️ SKU non classificato in PRODOTTI_CIC:", sku);

        await upsertPendingRow({
          docId,
          operation,
          orderDate: orderDate.toISOString(),
          tenantId,
          productId: it._idProduct || undefined,
          variantId: it._idProductVariant || undefined,
          rawResolvedSku: sku,
          qty: Number(it.qty || 0),
          total: Number(it.total || 0),
          price: Number(rawRow?.price ?? 0),
          description:
            String(
              rawRow?.description ||
                rawRow?.descriptionReceipt ||
                rawRow?.name ||
                ""
            ).trim() || undefined,
          reason: "UNCLASSIFIED_SKU",
          rawRow: rawRow || null,
        });

        continue;
      }

      if (mode === "IGNORE") {
        console.log("⏭ SKU ignorato da PRODOTTI_CIC:", sku);
        continue;
      }

      if (mode === "RECIPE" && !hasRecipe) {
        console.log("⚠️ Ricetta non trovata per SKU RECIPE:", sku);

        await upsertPendingRow({
          docId,
          operation,
          orderDate: orderDate.toISOString(),
          tenantId,
          productId: it._idProduct || undefined,
          variantId: it._idProductVariant || undefined,
          rawResolvedSku: sku,
          qty: Number(it.qty || 0),
          total: Number(it.total || 0),
          price: Number(rawRow?.price ?? 0),
          description:
            String(
              rawRow?.description ||
                rawRow?.descriptionReceipt ||
                rawRow?.name ||
                ""
            ).trim() || undefined,
          reason: "RECIPE_NOT_FOUND",
          rawRow: rawRow || null,
        });

        continue;
      }

      finalResolvedItems.push({
        sku,
        qty: Number(it.qty || 0),
      });
    }

    const movementSign = operation === "RECEIPT/DELETE" ? 1 : -1;

    const inserted = await applyRecipeStock({
      docId,
      receiptNumber,
      tenantId,
      orderDate,
      soldItems: finalResolvedItems,
      bom,
      cicProductModes: cicModesBySku,
      movementSign,
    });

    console.log("✅ SCARICHI GENERATI:", inserted);
    return res.status(200).send("OK");
  } catch (err) {
    console.error("❌ CIC webhook error:", err);
    return res.status(500).send("Webhook error");
  }
}
