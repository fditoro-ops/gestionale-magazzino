import { getCicProductModesCache } from "../server.js";
import { getRecipeByProductSku } from "../data/recipes.store.js";

export async function enrichPendingRows(rows: any[], tenantId: string) {
  const cicCache = getCicProductModesCache();

  // indicizza per productId+variantId
  const cicIndex: Record<string, any> = {};

  Object.values(cicCache).forEach((v: any) => {
    const key = `${v.productId || ""}::${v.variantId || ""}`;
    cicIndex[key] = v;
  });

  const enriched = [];

  for (const row of rows) {
    const key = `${row.productId || ""}::${row.variantId || ""}`;
    const cic = cicIndex[key];

    const catalogSku = cic?.sku || null;
    const cicName = cic?.name || null;
    const cicVariant = cic?.variantName || null;

    let recipe = null;

    if (catalogSku) {
      recipe = await getRecipeByProductSku(tenantId, catalogSku);
    }

    enriched.push({
      ...row,

      // CIC
      cicProductName: cicName,
      cicVariantName: cicVariant,
      catalogSku,

      // recipe
      recipeSku: recipe?.product_sku || null,
      recipeName: recipe?.name || null,
    });
  }

  return enriched;
}
