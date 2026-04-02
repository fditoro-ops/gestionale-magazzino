import { pool } from "../db.js";

export type CicCatalogRowInput = {
  tenantId: string;
  productId?: string | null;
  variantId?: string | null;
  sku?: string | null;
  name?: string | null;
  variantName?: string | null;
  mode?: string | null;
  rawProduct?: any;
  rawVariant?: any;
};

function buildId(productId?: string | null, variantId?: string | null) {
  return `${String(productId || "").trim()}::${String(variantId || "").trim()}`;
}

export async function upsertCicCatalogRow(input: CicCatalogRowInput) {
  const id = buildId(input.productId, input.variantId);

  await pool.query(
    `
    INSERT INTO cic_products_catalog (
      id,
      tenant_id,
      product_id,
      variant_id,
      sku,
      name,
      variant_name,
      mode,
      raw_product,
      raw_variant,
      created_at,
      updated_at
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW()
    )
    ON CONFLICT (id)
    DO UPDATE SET
      tenant_id = EXCLUDED.tenant_id,
      product_id = EXCLUDED.product_id,
      variant_id = EXCLUDED.variant_id,
      sku = EXCLUDED.sku,
      name = EXCLUDED.name,
      variant_name = EXCLUDED.variant_name,
      mode = EXCLUDED.mode,
      raw_product = EXCLUDED.raw_product,
      raw_variant = EXCLUDED.raw_variant,
      updated_at = NOW()
    `,
    [
      id,
      input.tenantId,
      input.productId || null,
      input.variantId || null,
      input.sku || null,
      input.name || null,
      input.variantName || null,
      input.mode || null,
      input.rawProduct ? JSON.stringify(input.rawProduct) : null,
      input.rawVariant ? JSON.stringify(input.rawVariant) : null,
    ]
  );
}

export async function findCicCatalogByIds(input: {
  productId?: string | null;
  variantId?: string | null;
  tenantId: string;
}) {
  const productId = String(input.productId || "").trim();
  const variantId = String(input.variantId || "").trim();
  const id = buildId(productId, variantId);

  const byComposite = await pool.query(
    `
    SELECT *
    FROM cic_products_catalog
    WHERE tenant_id = $1
      AND id = $2
    LIMIT 1
    `,
    [input.tenantId, id]
  );

  if (byComposite.rows[0]) return byComposite.rows[0];

  if (variantId) {
    const byVariant = await pool.query(
      `
      SELECT *
      FROM cic_products_catalog
      WHERE tenant_id = $1
        AND variant_id = $2
      ORDER BY updated_at DESC
      LIMIT 1
      `,
      [input.tenantId, variantId]
    );
    if (byVariant.rows[0]) return byVariant.rows[0];
  }

  if (productId) {
    const byProduct = await pool.query(
      `
      SELECT *
      FROM cic_products_catalog
      WHERE tenant_id = $1
        AND product_id = $2
      ORDER BY updated_at DESC
      LIMIT 1
      `,
      [input.tenantId, productId]
    );
    if (byProduct.rows[0]) return byProduct.rows[0];
  }

  return null;
}
