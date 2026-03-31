import { getRecipeById, updateRecipe } from "../data/recipes.store.js";
import { listRecipeIngredients } from "../data/recipeIngredients.store.js";
import { getItemBySku } from "../data/items.store.js";

export async function validateRecipe({ recipeId, tenantId }) {
  const recipe = await getRecipeById(recipeId, tenantId);

  if (!recipe) {
    return {
      ok: false,
      errors: [{ code: "RECIPE_NOT_FOUND" }],
      warnings: [],
    };
  }

  const ingredients = await listRecipeIngredients(recipeId);

  const errors = [];
  const warnings = [];

  // 1. Nessun ingrediente
  if (!ingredients.length) {
    errors.push({ code: "NO_INGREDIENTS" });
  }

  const seen = new Set();

  for (const ing of ingredients) {
    // 2. SKU mancante
    if (!ing.ingredient_sku) {
      errors.push({ code: "MISSING_INGREDIENT_SKU" });
      continue;
    }

    // 3. Quantità invalida
    if (!ing.quantity || Number(ing.quantity) <= 0) {
      errors.push({
        code: "INVALID_QUANTITY",
        sku: ing.ingredient_sku,
      });
    }

    // 4. Duplicati
    if (seen.has(ing.ingredient_sku)) {
      errors.push({
        code: "DUPLICATE_INGREDIENT",
        sku: ing.ingredient_sku,
      });
    }
    seen.add(ing.ingredient_sku);

    // 5. Esistenza item
    const item = await getItemBySku(ing.ingredient_sku, tenantId);

    if (!item) {
      errors.push({
        code: "INGREDIENT_NOT_FOUND",
        sku: ing.ingredient_sku,
      });
      continue;
    }

    // 6. Stato attivo
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

export async function updateRecipeValidationSnapshot({
  recipeId,
  tenantId,
}) {
  const result = await validateRecipe({ recipeId, tenantId });

  await updateRecipe(recipeId, tenantId, {
    last_validation_ok: result.ok,
    last_validation_error: result.errors[0]
      ? result.errors[0].code
      : null,
    last_validated_at: new Date(),
  });

  return result;
}
