import { getCicIdToSkuMap, getCicProductModesCache } from "../server.js";
import { findCicProductMapping } from "../data/cicProductMappings.store.js";

export type CicExtractedItem = {
  sku: string | null;
  qty: number;
  total: number;
  _idProduct: string;
  _idProductVariant: string;
};

export type CicResolvedSkuResult = {
  sku: string | null;
  mode: "RECIPE" | "IGNORE" | null;
  source: "DB_MAPPING" | "CACHE" | "NONE";
};

export type CicExtractedItemWithDb = {
  sku: string | null;
  mode: "RECIPE" | "IGNORE" | null;
  source: "DB_MAPPING" | "CACHE" | "NONE";
  qty: number;
  total: number;
  _idProduct: string;
  _idProductVariant: string;
};

function normalize(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * Fallback sync: cache in memoria / mapping esistenti
 */
export function cicResolveSku(value: string): string | null {
  const id = normalize(value);
  if (!id) return null;
  if (id.startsWith("SKU")) return id;

  const modes = getCicProductModesCache();
  const map = getCicIdToSkuMap();

  return modes[id]?.sku?.trim() || map[id]?.trim() || null;
}

/**
 * Resolver con priorità DB:
 * 1) variantId
 * 2) productId
 * 3) fallback cache/map esistenti
 */
export async function cicResolveSkuWithDb(input: {
  tenantId: string;
  idProduct?: string;
  idProductVariant?: string;
  internalId?: string;
}): Promise<CicResolvedSkuResult> {
  const tenantId = normalize(input.tenantId);
  const idProduct = normalize(input.idProduct);
  const idProductVariant = normalize(input.idProductVariant);
  const internalId = normalize(input.internalId);

  if (!tenantId) {
    throw new Error("tenantId required");
  }

  // 0. Se arriva già uno SKU vero, usalo subito
  // Il mode NON va forzato qui: lo decide dopo il webhook
  if (internalId.startsWith("SKU")) {
    return {
      sku: internalId,
      mode: null,
      source: "CACHE",
    };
  }

  // 1. Priorità a mapping DB per variantId
  if (idProductVariant) {
    const byVariant = await findCicProductMapping({
      tenantId,
      productId: null,
      variantId: idProductVariant,
    });

    if (byVariant) {
      return {
        sku: byVariant.sku || null,
        mode: byVariant.mode,
        source: "DB_MAPPING",
      };
    }
  }

  // 2. Poi mapping DB per productId
  if (idProduct) {
    const byProduct = await findCicProductMapping({
      tenantId,
      productId: idProduct,
      variantId: null,
    });

    if (byProduct) {
      return {
        sku: byProduct.sku || null,
        mode: byProduct.mode,
        source: "DB_MAPPING",
      };
    }
  }

  // 3. Fallback alla logica attuale
  const fallbackSku =
    cicResolveSku(internalId) ||
    cicResolveSku(idProductVariant) ||
    cicResolveSku(idProduct);

  if (fallbackSku) {
    return {
      sku: fallbackSku,
      mode: null,
      source: "CACHE",
    };
  }

  return {
    sku: null,
    mode: null,
    source: "NONE",
  };
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

/**
 * Versione sync legacy
 */
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
    .filter((row: CicExtractedItem) => row.qty > 0);
}

/**
 * Versione async che usa anche il mapping DB
 */
export async function cicExtractItemsWithDb(params: {
  tenantId: string;
  data: any;
}): Promise<CicExtractedItemWithDb[]> {
  const { tenantId, data } = params;
  const rows = Array.isArray(data?.document?.rows) ? data.document.rows : [];
  if (!rows.length) return [];

  const out: CicExtractedItemWithDb[] = [];

  for (const r of rows) {
    const qty = Number(r?.quantity ?? 0) || 0;
    const price = Number(r?.price ?? 0) || 0;

    if (qty <= 0) continue;

    const idProduct = normalize(r?.idProduct);
    const idProductVariant = normalize(r?.idProductVariant);

    const internalId = normalize(
      r?.internalId ||
        r?.idInternal ||
        r?.productInternalId ||
        r?.variantInternalId
    );

    const resolved = await cicResolveSkuWithDb({
      tenantId,
      idProduct,
      idProductVariant,
      internalId,
    });

    out.push({
      sku: resolved.sku || null,
      mode: resolved.mode,
      source: resolved.source,
      qty,
      total: qty * price,
      _idProduct: idProduct,
      _idProductVariant: idProductVariant,
    });
  }

  return out;
}
