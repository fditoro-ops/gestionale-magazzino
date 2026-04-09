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
export function cicResolveSku(value: string): string | null {
  const id = String(value || "").trim();
  if (!id) return null;
  if (id.startsWith("SKU")) return id;

  const modes = getCicProductModesCache();
  const map = getCicIdToSkuMap();

  return modes[id]?.sku?.trim() || map[id]?.trim() || null;
}

/**
 * Risolve SKU usando PRIMA variantId+productId, POI i fallback singoli
 */

export function cicResolveSkuFromRow(input: {
  idProduct?: string;
  idProductVariant?: string;
  internalId?: string;
}): string | null {
  return (
    cicResolveSku(input.internalId || "") ||
    cicResolveSku(input.idProductVariant || "") ||
    cicResolveSku(input.idProduct || "")
  );
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
