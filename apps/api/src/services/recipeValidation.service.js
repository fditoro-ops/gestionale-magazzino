export async function validateRecipe({ recipeId, tenantId }) {
  // 1. carica ricetta
  const recipe = await getRecipeById(recipeId, tenantId);
  if (!recipe) {
    return {
      ok: false,
      errors: [{ code: "RECIPE_NOT_FOUND" }],
      warnings: [],
    };
  }

  // 2. carica ingredienti
  const ingredients = await listRecipeIngredients(recipeId);

  const errors = [];
  const warnings = [];

  // 3. check base
  if (!ingredients.length) {
    errors.push({ code: "NO_INGREDIENTS" });
  }

  // 4. controlli ingredienti
  const seen = new Set();

  for (const ing of ingredients) {
    if (!ing.ingredient_sku) {
      errors.push({ code: "MISSING_INGREDIENT_SKU" });
      continue;
    }

    if (!ing.quantity || Number(ing.quantity) <= 0) {
      errors.push({
        code: "INVALID_QUANTITY",
        sku: ing.ingredient_sku,
      });
    }

    if (seen.has(ing.ingredient_sku)) {
      errors.push({
        code: "DUPLICATE_INGREDIENT",
        sku: ing.ingredient_sku,
      });
    }
    seen.add(ing.ingredient_sku);

    // check esistenza + stato in items
    const item = await getItemBySku(ing.ingredient_sku, tenantId);

    if (!item) {
      errors.push({
        code: "INGREDIENT_NOT_FOUND",
        sku: ing.ingredient_sku,
      });
      continue;
    }

    if (!item.active) {
      errors.push({
        code: "INGREDIENT_INACTIVE",
        sku: ing.ingredient_sku,
      });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}
