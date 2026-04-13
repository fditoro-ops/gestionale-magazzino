import { pool } from "../db.js";

export type CicPendingReason =
  | "UNMAPPED_PRODUCT"
  | "UNCLASSIFIED_SKU"
  | "RECIPE_NOT_FOUND";

export type CicPendingStatus = "PENDING" | "PROCESSED";

export type CicPendingRow = {
  id: string;

  docId: string;
  operation: string;
  orderDate: string;
  tenantId: string;

  productId?: string;
  variantId?: string;
  rawResolvedSku?: string;
  resolvedSku?: string;

  qty: number;
  total: number;
  price?: number;
  description?: string;
  productName?: string;
  receiptNumber?: string;

  reason: CicPendingReason;
  status: CicPendingStatus;

  createdAt: string;
  processedAt?: string | null;

  rawRow?: any;
};

function buildPendingRowId(row: {
  docId: string;
  productId?: string;
  variantId?: string;
  reason: CicPendingReason;
}) {
  return [
    row.docId || "",
    row.productId || "",
    row.variantId || "",
    row.reason || "",
  ].join("::");
}

// =========================
// UPSERT
// =========================
export async function upsertPendingRow(
  input: Omit<CicPendingRow, "id" | "createdAt" | "status" | "processedAt">
) {
  const id = buildPendingRowId({
    docId: input.docId,
    productId: input.productId,
    variantId: input.variantId,
    reason: input.reason,
  });

  await pool.query(
    `
    INSERT INTO cic_pending_rows (
      id,
      doc_id,
      operation,
      order_date,
      tenant_id,
      product_id,
      variant_id,
      raw_resolved_sku,
      resolved_sku, -- ✅ NUOVO
      qty,
      total,
      price,
      description,
      reason,
      status,
      raw_row,
      created_at,
      processed_at
    )
    VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9,
      $10, $11, $12, $13,
      $14, 'PENDING', $15, NOW(), NULL
    )
    ON CONFLICT (id)
    DO UPDATE SET
      operation = EXCLUDED.operation,
      order_date = EXCLUDED.order_date,
      tenant_id = EXCLUDED.tenant_id,
      product_id = EXCLUDED.product_id,
      variant_id = EXCLUDED.variant_id,
      raw_resolved_sku = EXCLUDED.raw_resolved_sku,
      qty = EXCLUDED.qty,
      total = EXCLUDED.total,
      price = EXCLUDED.price,
      description = EXCLUDED.description,
      reason = EXCLUDED.reason,
      raw_row = EXCLUDED.raw_row,
      status = 'PENDING',
      processed_at = NULL
    `,
    [
      id,
      input.docId,
      input.operation,
      input.orderDate,
      input.tenantId,
      input.productId || null,
      input.variantId || null,
      input.rawResolvedSku || null,
      null, // ✅ resolved_sku iniziale
      input.qty,
      input.total,
      input.price ?? null,
      input.description ?? null,
      input.reason,
      input.rawRow ? JSON.stringify(input.rawRow) : null,
    ]
  );

  console.log("🅿️ Pending row salvata:", id);

  return {
    ...input,
    id,
    resolvedSku: input.rawResolvedSku ?? null,
    productName: input.description ?? null,
    receiptNumber:
      input.rawRow?.receiptNumber ||
      input.rawRow?.documentNumber ||
      input.rawRow?.number ||
      null,
    status: "PENDING" as const,
    createdAt: new Date().toISOString(),
    processedAt: null,
  };
}

// =========================
// LIST
// =========================
export async function listPendingRows(status?: CicPendingStatus) {
  const sql = `
    SELECT
      id,
      doc_id as "docId",
      operation,
      order_date as "orderDate",
      tenant_id as "tenantId",
      product_id as "productId",
      variant_id as "variantId",
      raw_resolved_sku as "rawResolvedSku",
      COALESCE(resolved_sku, raw_resolved_sku) as "resolvedSku", -- 🔥 FIX
      qty,
      total,
      price,
      COALESCE(
        description,
        raw_row->>'description',
        raw_row->>'descriptionReceipt',
        raw_row->>'name'
      ) as "description",
      COALESCE(
        description,
        raw_row->>'description',
        raw_row->>'descriptionReceipt',
        raw_row->>'name'
      ) as "productName",
      COALESCE(
        raw_row->>'receiptNumber',
        raw_row->>'documentNumber',
        raw_row->>'number'
      ) as "receiptNumber",
      reason,
      status,
      raw_row as "rawRow",
      created_at as "createdAt",
      processed_at as "processedAt"
    FROM cic_pending_rows
    ${status ? "WHERE status = $1" : ""}
    ORDER BY created_at ASC
  `;

  const res = status
    ? await pool.query(sql, [status])
    : await pool.query(sql);

  return res.rows;
}

// =========================
// MARK PROCESSED
// =========================
export async function markPendingRowProcessed(id: string) {
  const res = await pool.query(
    `
    UPDATE cic_pending_rows
    SET status = 'PROCESSED',
        processed_at = NOW()
    WHERE id = $1
    `,
    [id]
  );

  return (res.rowCount ?? 0) > 0;
}

// =========================
// SET MANUAL SKU 🔥
// =========================
export async function setResolvedSku(id: string, sku: string) {
  await pool.query(
    `
    UPDATE cic_pending_rows
    SET resolved_sku = $1
    WHERE id = $2
    `,
    [sku, id]
  );
}
