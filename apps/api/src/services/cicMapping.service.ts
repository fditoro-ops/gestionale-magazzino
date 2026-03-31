import { getCicIdToSkuMap, getCicProductModesCache } from "../server.js";

export type CicExtractedItem = {
  sku: string | null;
  qty: number;
  total: number;
  _idProduct: string;
  _idProductVariant: string;
};

/**
 * Risolve uno SKU partendo da un ID CIC (product / variant / barcode)
 */
export function cicResolveSku(id: string): string | null {
  if (!id) return null;

  const cleanId = String(id).trim();

  // ✅ già uno SKU Core
  if (cleanId.startsWith("SKU")) return cleanId;

  const cicProductModeCache = getCicProductModesCache();
  const cicIdToSkuMap = getCicIdToSkuMap();

  // 1️⃣ mapping da configurazione CIC (più affidabile)
  if (cicProductModeCache[cleanId]?.sku) {
    return cicProductModeCache[cleanId].sku;
  }

  // 2️⃣ mapping diretto ID → SKU
  if (cicIdToSkuMap[cleanId]) {
    return cicIdToSkuMap[cleanId];
  }

  // ❌ non risolto
  return null;
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

      const idVariant = String(r?.idProductVariant ?? "").trim();
      const idProduct = String(r?.idProduct ?? "").trim();
      const productName = String(r?.description ?? r?.productName ?? "").trim();

      const resolvedSku =
        cicResolveSku(idVariant) ||
        cicResolveSku(idProduct);

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
