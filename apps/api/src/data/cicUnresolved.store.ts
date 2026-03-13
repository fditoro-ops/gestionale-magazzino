import { pool } from "../db.js";

export type CicUnresolvedRow = {
  id: string;
  productId?: string;
  variantId?: string;
  rawSku?: string;
  docId?: string;
  operation?: string;
  total?: number;
  createdAt?: string;
};

function buildUnresolvedId(input: {
  docId?: string;
  productId?: string;
  variantId?: string;
}) {
  return [
    input.docId || "",
    input.productId || "",
    input.variantId || "",
  ].join("::");
}

export async function upsertUnresolved(input: {
  productId?: string;
  variantId?: string;
  rawSku?: string;
  docId?: string;
  operation?: string;
  total?: number;
}) {
  const id = buildUnresolvedId({
    docId: input.docId,
    productId: input.productId,
    variantId: input.variantId,
  });

  await pool.query(
    `
    INSERT INTO cic_unresolved (
      id,
      product_id,
      variant_id,
      raw_sku,
      doc_id,
      operation,
      total,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    ON CONFLICT (id)
    DO UPDATE SET
      raw_sku = EXCLUDED.raw_sku,
      operation = EXCLUDED.operation,
      total = EXCLUDED.total
    `,
    [
      id,
      input.productId || null,
      input.variantId || null,
      input.rawSku || null,
      input.docId || null,
      input.operation || null,
      input.total ?? null,
    ]
  );

  console.log("🧩 Unresolved salvato su DB:", {
    id,
    docId: input.docId,
    productId: input.productId,
    variantId: input.variantId,
    rawSku: input.rawSku,
  });

  return {
    id,
    ...input,
  };
}

export async function listUnresolved() {
  const res = await pool.query(`
    SELECT
      id,
      product_id as "productId",
      variant_id as "variantId",
      raw_sku as "rawSku",
      doc_id as "docId",
      operation,
      total,
      created_at as "createdAt"
    FROM cic_unresolved
    ORDER BY created_at DESC
  `);

  return res.rows;
}
