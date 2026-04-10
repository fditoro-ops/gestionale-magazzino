import { pool } from "../db.js";
import { randomUUID } from "crypto";

export type Recipe = {
  id: string;
  tenant_id: string;
  product_sku: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  selling_price: string | number | null;
  cic_product_id?: string | null;
  cic_variant_id?: string | null;
  cic_mode?: string | null;
  created_at: string;
  updated_at: string;
};

// =========================
// GET ALL
// =========================
export async function listRecipes(tenantId: string): Promise<Recipe[]> {
  const res = await pool.query(
    `
    SELECT *
    FROM recipes
    WHERE tenant_id = $1
    ORDER BY created_at DESC
    `,
    [tenantId]
  );

  return res.rows;
}

// =========================
// GET BY ID
// =========================
export async function getRecipeById(id: string): Promise<Recipe | null> {
  const res = await pool.query(
    `
    SELECT *
    FROM recipes
    WHERE id = $1
    LIMIT 1
    `,
    [id]
  );

  return res.rows[0] ?? null;
}

// =========================
// GET BY PRODUCT SKU
// =========================
export async function getRecipeByProductSku(
  tenantId: string,
  productSku: string
): Promise<Recipe | null> {
  const res = await pool.query(
    `
    SELECT *
    FROM recipes
    WHERE tenant_id = $1
      AND product_sku = $2
    LIMIT 1
    `,
    [tenantId, productSku]
  );

  return res.rows[0] ?? null;
}

// =========================
// CREATE
// =========================
export async function createRecipe(input: {
  tenant_id: string;
  product_sku: string;
  name: string;
  selling_price?: number | null;
  cic_product_id?: string | null;
  cic_variant_id?: string | null;
  cic_mode?: string | null;
}) {
  const id = randomUUID();

  const res = await pool.query(
    `
INSERT INTO recipes (
  id,
  tenant_id,
  product_sku,
  name,
  status,
  selling_price,
  cic_product_id,
  cic_variant_id,
  cic_mode
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
    `,
    [
  id,
  input.tenant_id,
  input.product_sku,
  input.name,
  "INACTIVE",
  input.selling_price ?? null,
  input.cic_product_id ?? null,
  input.cic_variant_id ?? null,
  input.cic_mode ?? null,
]
  );

  return res.rows[0];
}

// =========================
// UPDATE
// =========================
export async function updateRecipe(
  id: string,
  input: {
    name?: string;
    product_sku?: string;
    selling_price?: number | null;
    cic_product_id?: string | null;
    cic_variant_id?: string | null;
    cic_mode?: string | null;
  }
) {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (input.name !== undefined) {
    fields.push(`name = $${i++}`);
    values.push(input.name);
  }

  if (input.product_sku !== undefined) {
    fields.push(`product_sku = $${i++}`);
    values.push(input.product_sku);
  }

  if (input.selling_price !== undefined) {
    fields.push(`selling_price = $${i++}`);
    values.push(input.selling_price);
  }

  if (input.cic_product_id !== undefined) {
    fields.push(`cic_product_id = $${i++}`);
    values.push(input.cic_product_id);
  }

  if (input.cic_variant_id !== undefined) {
    fields.push(`cic_variant_id = $${i++}`);
    values.push(input.cic_variant_id);
  }

  if (input.cic_mode !== undefined) {
    fields.push(`cic_mode = $${i++}`);
    values.push(input.cic_mode);
  }

  if (fields.length === 0) return null;

  values.push(id);

  const res = await pool.query(
    `
    UPDATE recipes
    SET ${fields.join(", ")}, updated_at = NOW()
    WHERE id = $${i}
    RETURNING *
    `,
    values
  );

  return res.rows[0] ?? null;
}

// =========================
// FIND BY SKU (alias per webhook)
// =========================
export async function findRecipeBySku(
  sku: string,
  tenantId: string
): Promise<Recipe | null> {
  return getRecipeByProductSku(tenantId, sku);
}

// =========================
// UPDATE STATUS
// =========================
export async function updateRecipeStatus(
  id: string,
  status: "ACTIVE" | "INACTIVE"
) {
  const res = await pool.query(
    `
    UPDATE recipes
    SET status = $1, updated_at = NOW()
    WHERE id = $2
    RETURNING *
    `,
    [status, id]
  );

  return res.rows[0] ?? null;
}
