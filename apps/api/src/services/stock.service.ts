import { pool } from "../db.js";
import { loadMovements } from "../data/movements.store.js";

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function mapItemRow(row: any) {
  return {
    itemId: row.id,
    sku: row.sku,
    name: row.name ?? "",
    supplier: row.supplier ?? "VARI",
    active: typeof row.active === "boolean" ? row.active : true,

    categoryId: row.categoryId ?? row.category ?? "bevande",
    category: row.category ?? row.categoryId ?? "bevande",

    brand: row.brand ?? null,
    packSize: row.packSize != null ? Number(row.packSize) : null,

    um: row.um ?? null,
    baseQty: row.baseQty != null ? Number(row.baseQty) : null,

    costEur: row.costEur != null ? Number(row.costEur) : null,
    lastCostCents:
      row.lastCostCents != null ? Number(row.lastCostCents) : null,
    costCurrency: row.costCurrency ?? "EUR",

    imageUrl: row.imageUrl ?? null,

    // legacy temporanea
    stockKind: row.stockKind ?? null,
    unitToCl: row.unitToCl != null ? Number(row.unitToCl) : null,
    containerSizeCl:
      row.containerSizeCl != null ? Number(row.containerSizeCl) : null,
    containerLabel: row.containerLabel ?? null,
    minStockCl: row.minStockCl != null ? Number(row.minStockCl) : 0,

    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getStockBtForSku(sku: string): Promise<number> {
  const movements = await loadMovements([]);
  const cleanSku = String(sku).trim().toUpperCase();

  const quantity = movements
    .filter((m: any) => String(m.sku).trim().toUpperCase() === cleanSku)
    .reduce((sum: number, m: any) => {
      if (m.type === "IN") return sum + m.quantity;
      if (m.type === "OUT" || m.type === "ADJUST") return sum - m.quantity;
      if (m.type === "INVENTORY") return m.quantity;
      return sum;
    }, 0);

  return round1(quantity);
}

export async function buildStockView() {
  const itemsRes = await pool.query(`
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
    ORDER BY sku ASC
  `);

  const items = itemsRes.rows.map(mapItemRow);
  const movements = await loadMovements([]);

  return items.map((item: any) => {
    const quantity = movements
      .filter(
        (m: any) =>
          String(m.sku).trim().toUpperCase() === String(item.sku).trim().toUpperCase()
      )
      .reduce((sum: number, m: any) => {
        if (m.type === "IN") return sum + m.quantity;
        if (m.type === "OUT" || m.type === "ADJUST") return sum - m.quantity;
        if (m.type === "INVENTORY") return m.quantity;
        return sum;
      }, 0);

    return {
      ...item,
      quantity: round1(quantity),
    };
  });
}
