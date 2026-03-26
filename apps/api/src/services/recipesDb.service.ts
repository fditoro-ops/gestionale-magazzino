import { pool } from "../db.js";

export type BomLine = {
  ingredientSku: string;
  qty: number;
  um: string;
};

export type BomMap = Record<string, BomLine[]>;

let recipesDbCache: BomMap = {};
let recipesDbLastSyncAt: string | null = null;
let recipesDbLastError: string | null = null;

export async function loadBomFromDb(): Promise<BomMap> {
  const res = await pool.query(
    `
    SELECT
      r.product_sku,
      ri.ingredient_sku,
      ri.quantity,
      ri.um
    FROM recipes r
    JOIN recipe_ingredients ri
      ON ri.recipe_id = r.id
    WHERE r.status = 'ACTIVE'
    ORDER BY r.product_sku, ri.sort_order, ri.created_at
    `
  );

  const bom: BomMap = {};

  for (const row of res.rows) {
    const productSku = String(row.product_sku || "").trim();
    const ingredientSku = String(row.ingredient_sku || "").trim();
    const qty = Number(row.quantity || 0);
    const um = String(row.um || "").trim().toUpperCase();

    if (!productSku || !ingredientSku) continue;
    if (!qty || qty <= 0) continue;

    if (!bom[productSku]) bom[productSku] = [];
    bom[productSku].push({
      ingredientSku,
      qty,
      um,
    });
  }

  return bom;
}

export async function syncRecipesDbCache() {
  try {
    const bom = await loadBomFromDb();
    recipesDbCache = bom;
    recipesDbLastSyncAt = new Date().toISOString();
    recipesDbLastError = null;

    console.log(
      "✅ RECIPES DB sync OK:",
      Object.keys(recipesDbCache).length,
      "prodotti"
    );
  } catch (err: any) {
    recipesDbLastError = String(err?.message ?? err);
    console.error("❌ RECIPES DB sync error:", recipesDbLastError);
  }
}

export function getRecipesDbCache() {
  return recipesDbCache;
}

export function getRecipesDbSyncInfo() {
  return {
    lastSyncAt: recipesDbLastSyncAt,
    lastError: recipesDbLastError,
    count: Object.keys(recipesDbCache).length,
  };
}

export function hasRecipeInDb(productSku: string) {
  const sku = String(productSku || "").trim();
  return Array.isArray(recipesDbCache[sku]) && recipesDbCache[sku].length > 0;
}
