import { upsertCicCatalogRow } from "../data/cicProductsCatalog.store.js";
import { getCicProductModesCache } from "../server.js";

export async function syncCicCatalogToDb(input: {
  tenantId?: string;
  products: any[];
}) {
  const tenantId = input.tenantId || "IMP001";
  const modesCache = getCicProductModesCache();

  for (const product of input.products) {
    const productId = String(product?.id || "").trim();
    const productName = String(
      product?.description ||
      product?.name ||
      ""
    ).trim();

    const variants = Array.isArray(product?.variants) ? product.variants : [];

    if (!variants.length) {
      const modeEntry =
        modesCache[productId] ||
        null;

      await upsertCicCatalogRow({
        tenantId,
        productId,
        variantId: null,
        sku: modeEntry?.sku || null,
        name: productName || null,
        variantName: null,
        mode: modeEntry?.mode || null,
        rawProduct: product,
        rawVariant: null,
      });

      continue;
    }

    for (const variant of variants) {
      const variantId = String(variant?.id || "").trim();
      const variantName = String(
        variant?.description ||
        variant?.name ||
        ""
      ).trim();

      const compositeKey = `${productId}::${variantId}`;
      const modeEntry =
        modesCache[compositeKey] ||
        modesCache[variantId] ||
        modesCache[productId] ||
        null;

      await upsertCicCatalogRow({
        tenantId,
        productId,
        variantId,
        sku: modeEntry?.sku || null,
        name: productName || null,
        variantName: variantName || null,
        mode: modeEntry?.mode || null,
        rawProduct: product,
        rawVariant: variant,
      });
    }
  }
}
