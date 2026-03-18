import { randomUUID } from "crypto";
import { pool } from "../db.js";

export type RecipeIngredient = {
  id: string;
  recipe_id: string;
  ingredient_sku: string;
  ingredient_name_snapshot: string | null;
  quantity: number;
  um: string;
  sort_order: number;
  is_optional: boolean;
  waste_pct: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export async function listRecipeIngredients(
  recipeId: string
): Promise<RecipeIngredient[]> {
  const res = await pool.query(
    `
    SELECT *
    FROM recipe_ingredients
    WHERE recipe_id = $1
    ORDER BY sort_order ASC, created_at ASC
    `,
    [recipeId]
  );

  return res.rows;
}

export async function addRecipeIngredient(input: {
  recipe_id: string;
  ingredient_sku: string;
  ingredient_name_snapshot?: string | null;
  quantity: number;
  um: string;
  sort_order?: number;
  is_optional?: boolean;
  waste_pct?: number | null;
  notes?: string | null;
}): Promise<RecipeIngredient> {
  const id = randomUUID();

  const res = await pool.query(
    `
    INSERT INTO recipe_ingredients (
      id,
      recipe_id,
      ingredient_sku,
      ingredient_name_snapshot,
      quantity,
      um,
      sort_order,
      is_optional,
      waste_pct,
      notes
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING *
    `,
    [
      id,
      input.recipe_id,
      input.ingredient_sku,
      input.ingredient_name_snapshot ?? null,
      input.quantity,
      input.um,
      input.sort_order ?? 0,
      input.is_optional ?? false,
      input.waste_pct ?? null,
      input.notes ?? null,
    ]
  );

  return res.rows[0];
}

export async function updateRecipeIngredient(
  id: string,
  input: {
    ingredient_sku?: string;
    ingredient_name_snapshot?: string | null;
    quantity?: number;
    um?: string;
    sort_order?: number;
    is_optional?: boolean;
    waste_pct?: number | null;
    notes?: string | null;
  }
): Promise<RecipeIngredient | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (input.ingredient_sku !== undefined) {
    fields.push(`ingredient_sku = $${i++}`);
    values.push(input.ingredient_sku);
  }

  if (input.ingredient_name_snapshot !== undefined) {
    fields.push(`ingredient_name_snapshot = $${i++}`);
    values.push(input.ingredient_name_snapshot);
  }

  if (input.quantity !== undefined) {
    fields.push(`quantity = $${i++}`);
    values.push(input.quantity);
  }

  if (input.um !== undefined) {
    fields.push(`um = $${i++}`);
    values.push(input.um);
  }

  if (input.sort_order !== undefined) {
    fields.push(`sort_order = $${i++}`);
    values.push(input.sort_order);
  }

  if (input.is_optional !== undefined) {
    fields.push(`is_optional = $${i++}`);
    values.push(input.is_optional);
  }

  if (input.waste_pct !== undefined) {
    fields.push(`waste_pct = $${i++}`);
    values.push(input.waste_pct);
  }

  if (input.notes !== undefined) {
    fields.push(`notes = $${i++}`);
    values.push(input.notes);
  }

  if (fields.length === 0) return null;

  values.push(id);

  const res = await pool.query(
    `
    UPDATE recipe_ingredients
    SET ${fields.join(", ")}, updated_at = NOW()
    WHERE id = $${i}
    RETURNING *
    `,
    values
  );

  return res.rows[0] ?? null;
}

export async function deleteRecipeIngredient(id: string): Promise<boolean> {
  const res = await pool.query(
    `
    DELETE FROM recipe_ingredients
    WHERE id = $1
    `,
    [id]
  );

  return (res.rowCount ?? 0) > 0;
}
