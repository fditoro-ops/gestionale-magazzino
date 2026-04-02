import { getCicIdToSkuMap, getCicProductModesCache } from "../server.js";

export type CicExtractedItem = {
  sku: string | null;
  qty: number;
  total: number;
  _idProduct: string;
  _idProductVariant: string;
};

function normalize(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * Risolve uno SKU partendo da un singolo ID CIC
 */
export function cicResolveSku(id: string): string | null {
  const cleanId = normalize(id);
  if (!cleanId) return null;

  // già SKU Core
  if (cleanId.startsWith("SKU")) return cleanId;

  const cicProductModeCache = getCicProductModesCache();
  const cicIdToSkuMap = getCicIdToSkuMap();

  // 1. cache configurazione CIC
  if (cicProductModeCache[cleanId]?.sku) {
    return cicProductModeCache[cleanId].sku;
  }

  // 2. mappa diretta id -> sku
  if (cicIdToSkuMap[cleanId]) {
    return cicIdToSkuMap[cleanId];
  }

  return null;
}

/**
 * Risolve SKU usando PRIMA variantId+productId, POI i fallback singoli
 */
export function cicResolveSkuFromRow(input: {
  idProduct?: string;
  idProductVariant?: string;
}): string | null {
  const idProduct = normalize(input.idProduct);
  const idVariant = normalize(input.idProductVariant);

  const cicProductModeCache = getCicProductModesCache();
  const cicIdToSkuMap = getCicIdToSkuMap();

  const compositeKeys = [
    `${idProduct}::${idVariant}`,
    `${idVariant}::${idProduct}`,
  ].filter((k) => k !== "::");

  for (const key of compositeKeys) {
    if (cicProductModeCache[key]?.sku) {
      return cicProductModeCache[key].sku;
    }
    if (cicIdToSkuMap[key]) {
      return cicIdToSkuMap[key];
    }
  }

  // fallback: variante prima del prodotto
  return cicResolveSku(idVariant) || cicResolveSku(idProduct);
}

/**
 * Estrae gli articoli da uno scontrino CIC
 */
export function cicExtractItems(data: any): CicExtractedItem[] {
  const rows = data?.document?.rows ?? [];
  if (!Array.isArray(rows)) return [];

  return rows
    .map((r: any) => {
      const qty = Number(r?.quantity ?? 0);
      const price = Number(r?.price ?? 0);

      const idVariant = normalize(r?.idProductVariant);
      const idProduct = normalize(r?.idProduct);
      const productName = normalize(r?.description ?? r?.productName);

      const resolvedSku = cicResolveSkuFromRow({
        idProduct,
        idProductVariant: idVariant,
      });

      console.log("CIC DEBUG", {
        productName,
        idProduct,
        idVariant,
        qty,
        price,
        resolvedSku,
      });

      return {
        sku: resolvedSku || null,
        qty,
        total: qty * price,
        _idProduct: idProduct,
        _idProductVariant: idVariant,
      };
    })
    .filter((x) => x.qty > 0);
}
