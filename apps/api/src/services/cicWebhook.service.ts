import crypto from "crypto";
import { pool } from "../../db.js";

import { applyRecipeStock } from "../recipeStock.service.js";
import { upsertUnresolved } from "../../data/cicUnresolved.store.js";
import { appendCicWebhookDump } from "../../data/cicWebhookDump.store.js";
import {
  upsertPendingRow,
} from "../../data/cicPendingRows.store.js";

import {
  cicExtractItems,
  cicResolveSku,
} from "./cicMapping.service.js"; // 👈 lo creeremo dopo

import { getBomCache } from "../sheets/bomSheet.service.js";
import { getCicProductModes } from "../sheets/cicProductModesSheet.service.js";

const CIC_WEBHOOK_SECRET = process.env.CIC_WEBHOOK_SECRET || "";

export async function processCicWebhook(req: any, res: any) {
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";

    const signature = (req.header("x-cn-signature") || "").trim();
    const operation = (req.header("x-cn-operation") || "").trim();

    console.log("CIC x-cn-operation:", operation);

    // 🔐 SIGNATURE CHECK
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
      return res.status(200).send("OK");
    }

    const data = JSON.parse(raw);

    await appendCicWebhookDump({
      capturedAt: new Date().toISOString(),
      operation,
      rawPayload: data,
    });

    const tenantId = process.env.TENANT_ID || "IMP001";

    const docId = "CIC-" + String(data?.document?.id || data?.id || "");
    const receiptNumber = String(
      data?.document?.documentNumber ||
      data?.document?.number ||
      data?.number ||
      ""
    ).trim();

    const orderDate = new Date(
      data?.document?.date ||
      data?.date ||
      Date.now()
    );

    let items = cicExtractItems(data);

    const bom = getBomCache();
    const cicModes = getCicProductModes();

    const finalItems: Array<{ sku: string; qty: number }> = [];

    for (const it of items) {
      const sku = String(it.sku || "").trim();

      if (!sku || sku.includes("-")) {
        console.warn("❗ UNMAPPED SKU:", it);

        await upsertPendingRow({
          docId,
          operation,
          tenantId,
          productId: it._idProduct,
          variantId: it._idProductVariant,
          rawResolvedSku: sku,
          qty: it.qty,
          total: it.total,
          reason: "UNMAPPED_PRODUCT",
        });

        await upsertUnresolved({
          productId: it._idProduct,
          variantId: it._idProductVariant,
          rawSku: sku,
          docId,
          operation,
          total: it.total,
        });

        continue;
      }

      const mode = cicModes[sku];

      if (mode === "IGNORE") continue;

      if (mode === "RECIPE" && !bom[sku]) {
        console.warn("⚠️ RECIPE NON TROVATA:", sku);
        continue;
      }

      finalItems.push({
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
      soldItems: finalItems,
      bom,
      cicProductModes: cicModes,
      movementSign,
    });

    console.log("✅ SCARICHI:", inserted);

    return res.status(200).send("OK");
  } catch (err) {
    console.error("❌ CIC webhook error:", err);
    return res.status(500).send("Webhook error");
  }
}
