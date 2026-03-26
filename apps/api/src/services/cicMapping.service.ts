import { getCicIdToSkuMap, getCicProductModesCache } from "../server.js";

export type CicExtractedItem = {
  sku: string;
  qty: number;
  total: number;
  _idProduct: string;
  _idProductVariant: string;
};

export function cicResolveSku(id: string) {
  if (!id) return id;

  if (id.startsWith("SKU")) return id;

  const cicProductModeCache = getCicProductModesCache();
  const cicIdToSkuMap = getCicIdToSkuMap();

  if (cicProductModeCache[id]) {
    return cicProductModeCache[id].sku;
  }

  if (cicIdToSkuMap[id]) {
    return cicIdToSkuMap[id];
  }

  return id;
}

export function cicExtractItems(data: any): CicExtractedItem[] {
  const rows = data?.document?.rows ?? [];
  if (!Array.isArray(rows)) return [];

  return rows
    .map((r: any) => {
      const qty = Number(r?.quantity ?? 0);
      const price = Number(r?.price ?? 0);

      const idVariant = String(r?.idProductVariant ?? "").trim();
      const idProduct = String(r?.idProduct ?? "").trim();

      let resolved = "";

      if (idVariant) {
        resolved = cicResolveSku(idVariant);
      }

      if (!resolved || resolved.includes("-")) {
        resolved = cicResolveSku(idProduct);
      }

      return {
        sku: resolved,
        qty,
        total: qty * price,
        _idProduct: idProduct,
        _idProductVariant: idVariant,
      };
    })
    .filter((x: any) => x.sku && x.qty);
}
