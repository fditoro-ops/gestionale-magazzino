import { findCicCatalogByIds } from "../data/cicProductsCatalog.store.js";
import { getRecipeByProductSku } from "../data/recipes.store.js";

export async function enrichPendingRows(rows: any[], tenantId: string) {
  const enriched = [];

  for (const row of rows) {
    const cic = await findCicCatalogByIds({
      tenantId,
      productId: row.productId,
      variantId: row.variantId,
    });

    const catalogSku = cic?.sku || null;
    const cicName = cic?.name || null;
    const cicVariant = cic?.variant_name || null;

    let recipe = null;

    if (catalogSku) {
      recipe = await getRecipeByProductSku(tenantId, catalogSku);
    }

    enriched.push({
      ...row,
      cicProductName: cicName,
      cicVariantName: cicVariant,
      catalogSku,
      recipeSku: recipe?.product_sku || null,
      recipeName: recipe?.name || null,
    });
  }

  return enriched;
}
