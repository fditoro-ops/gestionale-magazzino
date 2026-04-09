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

export function cicResolveSku(value: string): string | null {
  const id = normalize(value);
  if (!id) return null;
  if (id.startsWith("SKU")) return id;

  const modes = getCicProductModesCache();
  const map = getCicIdToSkuMap();

  return modes[id]?.sku?.trim() || map[id]?.trim() || null;
}

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

export function cicExtractItems(data: any): CicExtractedItem[] {
  const rows = Array.isArray(data?.document?.rows) ? data.document.rows : [];
  if (!rows.length) return [];

  return rows
    .map((r: any) => {
      const qty = Number(r?.quantity ?? 0) || 0;
      const price = Number(r?.price ?? 0) || 0;

      const idProduct = normalize(r?.idProduct);
      const idProductVariant = normalize(r?.idProductVariant);

      const internalId = normalize(
        r?.internalId ||
          r?.idInternal ||
          r?.productInternalId ||
          r?.variantInternalId
      );

      const resolvedSku = cicResolveSkuFromRow({
        idProduct,
        idProductVariant,
        internalId,
      });

      return {
        sku: resolvedSku || null,
        qty,
        total: qty * price,
        _idProduct: idProduct,
        _idProductVariant: idProductVariant,
      };
    })
    .filter((row) => row.qty > 0);
}
