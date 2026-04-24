import { getCicIdToSkuMap, getCicProductModesCache } from "../server.js";
import { findCicProductMapping } from "../data/cicProductMappings.store.js";
import { pool } from "../db.js";

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

export type CicExtractedItemWithDb = CicExtractedItem & {
  mode: "RECIPE" | "IGNORE" | null;
  source: "DB_MAPPING" | "CACHE" | "NONE";
};

function normalize(value: unknown): string {
  return String(value ?? "").trim();
}

function extractVariantId(r: any): string {
  return normalize(r?.idProductVariant || r?.idVariant);
}

export function cicResolveSku(value: string): string | null {
  const id = normalize(value);
  if (!id) return null;
  if (id.startsWith("SKU")) return id;

  const modes = getCicProductModesCache();
  const map = getCicIdToSkuMap();

  return modes[id]?.sku?.trim() || map[id]?.trim() || null;
}

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

  if (!tenantId) throw new Error("tenantId required");

  if (internalId.startsWith("SKU")) {
    return { sku: internalId, mode: null, source: "CACHE" };
  }

  if (idProduct || idProductVariant) {
    const exact = await findCicProductMapping({
      tenantId,
      productId: idProduct || null,
      variantId: idProductVariant || null,
    });

    if (exact) {
      return {
        sku: exact.sku || null,
        mode: exact.mode,
        source: "DB_MAPPING",
      };
    }
  }

  if (idProductVariant) {
    const byVariant = await pool.query(
      `
      SELECT sku, mode
      FROM cic_product_mappings
      WHERE tenant_id = $1
        AND variant_id = $2
      ORDER BY updated_at DESC
      LIMIT 1
      `,
      [tenantId, idProductVariant]
    );

    if (byVariant.rows.length) {
      return {
        sku: String(byVariant.rows[0].sku || "").trim() || null,
        mode: byVariant.rows[0].mode,
        source: "DB_MAPPING",
      };
    }
  }

  if (idProduct) {
    const byProduct = await pool.query(
      `
      SELECT sku, mode
      FROM cic_product_mappings
      WHERE tenant_id = $1
        AND product_id = $2
      ORDER BY updated_at DESC
      LIMIT 1
      `,
      [tenantId, idProduct]
    );

    if (byProduct.rows.length) {
      return {
        sku: String(byProduct.rows[0].sku || "").trim() || null,
        mode: byProduct.rows[0].mode,
        source: "DB_MAPPING",
      };
    }
  }

  const fallbackSku =
    cicResolveSku(internalId) ||
    cicResolveSku(idProductVariant) ||
    cicResolveSku(idProduct);

  if (fallbackSku) {
    return { sku: fallbackSku, mode: null, source: "CACHE" };
  }

  return { sku: null, mode: null, source: "NONE" };
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
      const idProductVariant = extractVariantId(r);

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
    const idProductVariant = extractVariantId(r);

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
