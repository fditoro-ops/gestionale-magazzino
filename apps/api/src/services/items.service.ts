import { pool } from "../db.js";

export type ItemUm = "CL" | "PZ";

export type Item = {
  itemId: string;
  sku: string;
  name: string;
  supplier: string | null;
  active: boolean;

  categoryId: string | null;
  category: string | null;

  brand: string | null;
  packSize: number | null;

  um: ItemUm;
  baseQty: number;

  costEur: number | null;
  lastCostCents: number | null;
  costCurrency: string | null;

  imageUrl: string | null;

  // legacy temporanea
  stockKind?: "UNIT" | "VOLUME_CONTAINER" | null;
  unitToCl?: number | null;
  containerSizeCl?: number | null;
  containerLabel?: string | null;
  minStockCl?: number | null;

  createdAt?: string;
  updatedAt?: string;
};

function mapRowToItem(row: any): Item {
  const um = row.um;
  const baseQty = Number(row.baseQty);

  if (um !== "CL" && um !== "PZ") {
    throw new Error(`Articolo ${row.sku}: um non valida`);
  }

  if (!Number.isFinite(baseQty) || baseQty <= 0) {
    throw new Error(`Articolo ${row.sku}: baseQty non valida`);
  }

  return {
    itemId: row.id,
    sku: row.sku,
    name: row.name ?? "",
    supplier: row.supplier ?? null,
    active: typeof row.active === "boolean" ? row.active : true,

    categoryId: row.categoryId ?? null,
    category: row.category ?? null,

    brand: row.brand ?? null,
    packSize: row.packSize != null ? Number(row.packSize) : null,

    um,
    baseQty,

    costEur: row.costEur != null ? Number(row.costEur) : null,
    lastCostCents:
      row.lastCostCents != null ? Number(row.lastCostCents) : null,
    costCurrency: row.costCurrency ?? "EUR",

    imageUrl: row.imageUrl ?? null,

    stockKind: row.stockKind ?? null,
    unitToCl: row.unitToCl != null ? Number(row.unitToCl) : null,
    containerSizeCl:
      row.containerSizeCl != null ? Number(row.containerSizeCl) : null,
    containerLabel: row.containerLabel ?? null,
    minStockCl: row.minStockCl != null ? Number(row.minStockCl) : null,

    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function assertItemCoreReady(item: Item | null | undefined): asserts item is Item {
  if (!item) {
    throw new Error("Articolo non trovato");
  }

  if (!item.active) {
    throw new Error(`Articolo ${item.sku} non attivo`);
  }

  if (item.um !== "CL" && item.um !== "PZ") {
    throw new Error(`Articolo ${item.sku}: um non valida`);
  }

  if (!Number.isFinite(item.baseQty) || item.baseQty <= 0) {
    throw new Error(`Articolo ${item.sku}: baseQty non valida`);
  }

  if (item.um === "PZ" && item.baseQty !== 1) {
    throw new Error(`Articolo ${item.sku}: per PZ baseQty deve essere 1`);
  }
}

export async function getItemBySku(sku: string): Promise<Item | undefined> {
  const key = sku.toUpperCase().trim();

  const result = await pool.query(
    `
    SELECT
      id,
      sku,
      name,
      supplier,
      active,
      "categoryId",
      category,
      brand,
      "packSize",
      um,
      "baseQty",
      "costEur",
      "lastCostCents",
      "costCurrency",
      "imageUrl",
      "stockKind",
      "unitToCl",
      "containerSizeCl",
      "containerLabel",
      "minStockCl",
      "createdAt",
      "updatedAt"
    FROM "Item"
    WHERE sku = $1
    LIMIT 1
    `,
    [key]
  );

  if (!result.rowCount) return undefined;

  return mapRowToItem(result.rows[0]);
}
