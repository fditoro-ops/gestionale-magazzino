import { getRecipeById, updateRecipe } from "../data/recipes.store.js";
import { listRecipeIngredients } from "../data/recipeIngredients.store.js";
import { getItemBySku } from "../data/items.store.js";

type ValidationError = {
  code: string;
  sku?: string;
};

type ValidationResult = {
  ok: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
};

export async function validateRecipe({
  recipeId,
  tenantId,
}: {
  recipeId: string;
  tenantId: string;
}): Promise<ValidationResult> {
  const recipe = await getRecipeById(recipeId, tenantId);

  if (!recipe) {
    return {
      ok: false,
      errors: [{ code: "RECIPE_NOT_FOUND" }],
      warnings: [],
    };
  }

  const ingredients = await listRecipeIngredients(recipeId);

  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // ❌ nessun ingrediente
  if (!ingredients.length) {
    errors.push({ code: "NO_INGREDIENTS" });
  }

  const seen = new Set<string>();

  for (const ing of ingredients) {
    const sku = ing.ingredient_sku;

    // ❌ sku mancante
    if (!sku) {
      errors.push({ code: "MISSING_INGREDIENT_SKU" });
      continue;
    }

    // ❌ quantità invalida
    if (!ing.quantity || Number(ing.quantity) <= 0) {
      errors.push({
        code: "INVALID_QUANTITY",
        sku,
      });
    }

    // ❌ duplicati
    if (seen.has(sku)) {
      errors.push({
        code: "DUPLICATE_INGREDIENT",
        sku,
      });
    }
    seen.add(sku);

    // 🔍 check item
    const item = await getItemBySku(sku, tenantId);

    if (!item) {
      errors.push({
        code: "INGREDIENT_NOT_FOUND",
        sku,
      });
      continue;
    }

    if (!item.active) {
      errors.push({
        code: "INGREDIENT_INACTIVE",
        sku,
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
}: {
  recipeId: string;
  tenantId: string;
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
