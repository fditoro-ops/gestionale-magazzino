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

export async function upsertCicProductMapping(input: {
  tenantId: string;
  productId?: string | null;
  variantId?: string | null;
  sku?: string | null;
  mode: CicMappingMode;
}) {
  const tenantId = String(input.tenantId || "").trim();
  const productId = String(input.productId || "").trim() || null;
  const variantId = String(input.variantId || "").trim() || null;
  const sku = String(input.sku || "").trim().toUpperCase() || null;
  const mode = input.mode;

  if (!tenantId) throw new Error("tenantId required");
  if (!productId && !variantId) {
    throw new Error("productId or variantId required");
  }
  if (mode === "RECIPE" && !sku) {
    throw new Error("sku required for RECIPE");
  }

  const res = await pool.query(
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
    ON CONFLICT (
      tenant_id,
      COALESCE(product_id, ''),
      COALESCE(variant_id, '')
    )
    DO UPDATE SET
      sku = EXCLUDED.sku,
      mode = EXCLUDED.mode,
      updated_at = NOW()
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

export async function findCicProductMapping(params: {
  tenantId: string;
  productId?: string | null;
  variantId?: string | null;
}) {
  const tenantId = String(params.tenantId || "").trim();
  const productId = String(params.productId || "").trim() || null;
  const variantId = String(params.variantId || "").trim() || null;

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
