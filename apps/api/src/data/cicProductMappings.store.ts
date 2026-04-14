import { pool } from "../db.js";

export type CicMappingMode = "RECIPE" | "IGNORE";

export type CicProductMappingRow = {
  id: number;
  tenantId: string;
  productId: string | null;
  variantId: string | null;
  sku: string | null;
  mode: CicMappingMode;
  createdAt: string;
  updatedAt: string;
};

function normalize(value: unknown): string {
  return String(value ?? "").trim();
}

export async function upsertCicProductMapping(input: {
  tenantId: string;
  productId?: string | null;
  variantId?: string | null;
  sku?: string | null;
  mode: CicMappingMode;
}) {
  const tenantId = normalize(input.tenantId);
  const productId = normalize(input.productId) || null;
  const variantId = normalize(input.variantId) || null;
  const sku = normalize(input.sku).toUpperCase() || null;
  const mode = input.mode;

  if (!tenantId) throw new Error("tenantId required");
  if (!productId && !variantId) {
    throw new Error("productId or variantId required");
  }
  if (mode === "RECIPE" && !sku) {
    throw new Error("sku required for RECIPE");
  }

  let res;

  if (variantId) {
    res = await pool.query(
      `
      UPDATE cic_product_mappings
      SET
        product_id = $3,
        sku = $4,
        mode = $5,
        updated_at = NOW()
      WHERE tenant_id = $1
        AND variant_id = $2
      RETURNING
        id,
        tenant_id as "tenantId",
        product_id as "productId",
        variant_id as "variantId",
        sku,
        mode,
        created_at as "createdAt",
        updated_at as "updatedAt"
      `,
      [tenantId, variantId, productId, sku, mode]
    );

    if (res.rows[0]) {
      return res.rows[0] as CicProductMappingRow;
    }

    res = await pool.query(
      `
      INSERT INTO cic_product_mappings (
        tenant_id,
        product_id,
        variant_id,
        sku,
        mode,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING
        id,
        tenant_id as "tenantId",
        product_id as "productId",
        variant_id as "variantId",
        sku,
        mode,
        created_at as "createdAt",
        updated_at as "updatedAt"
      `,
      [tenantId, productId, variantId, sku, mode]
    );

    return res.rows[0] as CicProductMappingRow;
  }

  res = await pool.query(
    `
    UPDATE cic_product_mappings
    SET
      sku = $3,
      mode = $4,
      updated_at = NOW()
    WHERE tenant_id = $1
      AND product_id = $2
      AND (variant_id IS NULL OR BTRIM(variant_id) = '')
    RETURNING
      id,
      tenant_id as "tenantId",
      product_id as "productId",
      variant_id as "variantId",
      sku,
      mode,
      created_at as "createdAt",
      updated_at as "updatedAt"
    `,
    [tenantId, productId, sku, mode]
  );

  if (res.rows[0]) {
    return res.rows[0] as CicProductMappingRow;
  }

  res = await pool.query(
    `
    INSERT INTO cic_product_mappings (
      tenant_id,
      product_id,
      variant_id,
      sku,
      mode,
      created_at,
      updated_at
    )
    VALUES ($1, $2, NULL, $3, $4, NOW(), NOW())
    RETURNING
      id,
      tenant_id as "tenantId",
      product_id as "productId",
      variant_id as "variantId",
      sku,
      mode,
      created_at as "createdAt",
      updated_at as "updatedAt"
    `,
    [tenantId, productId, sku, mode]
  );

  return res.rows[0] as CicProductMappingRow;
}

export async function findCicProductMapping(params: {
  tenantId: string;
  productId?: string | null;
  variantId?: string | null;
}) {
  const tenantId = normalize(params.tenantId);
  const productId = normalize(params.productId) || null;
  const variantId = normalize(params.variantId) || null;

  if (!tenantId) return null;
  if (!productId && !variantId) return null;

  if (variantId) {
    const byVariant = await pool.query(
      `
      SELECT
        id,
        tenant_id as "tenantId",
        product_id as "productId",
        variant_id as "variantId",
        sku,
        mode,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM cic_product_mappings
      WHERE tenant_id = $1
        AND variant_id = $2
      LIMIT 1
      `,
      [tenantId, variantId]
    );

    if (byVariant.rows[0]) {
      return byVariant.rows[0] as CicProductMappingRow;
    }
  }

  if (productId) {
    const byProduct = await pool.query(
      `
      SELECT
        id,
        tenant_id as "tenantId",
        product_id as "productId",
        variant_id as "variantId",
        sku,
        mode,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM cic_product_mappings
      WHERE tenant_id = $1
        AND product_id = $2
        AND (variant_id IS NULL OR BTRIM(variant_id) = '')
      LIMIT 1
      `,
      [tenantId, productId]
    );

    if (byProduct.rows[0]) {
      return byProduct.rows[0] as CicProductMappingRow;
    }
  }

  return null;
}
