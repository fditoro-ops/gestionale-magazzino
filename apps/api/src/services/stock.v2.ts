import { loadItems } from "../data/items.store.js";
import { loadMovements } from "../data/movements.store.js";
import type { Movement } from "../types/movement.js";

type StockKind = "UNIT" | "VOLUME_CONTAINER";

type ItemStock = {
  itemId: string;
  sku: string;
  name: string;
  active?: boolean;

  stockKind: StockKind;

  // conversioni (restano per futuro / distinte base)
  unitToCl?: number | null;
  containerSizeCl?: number | null;

  // ✅ MINIMO in BT
  minStockBt?: number | null;
};

// ✅ 1 decimale, arrotondamento matematico
function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export function buildWarehouseView() {
  const items = loadItems([]);
  const movements: Movement[] = loadMovements();

  console.log("WAREHOUSE items:", items.length, "movements:", movements.length);

  return items
    .filter((item: any) => item.active !== false)
    .map((item: ItemStock) => {
      const qtyBtRaw = movements
        .filter((m) => m.sku === item.sku)
        .reduce((sum, m) => {
          if (m.type === "IN") return sum + m.quantity;
          if (m.type === "OUT" || m.type === "ADJUST") return sum - m.quantity;
          if (m.type === "INVENTORY") return m.quantity;
          return sum;
        }, 0);

      const stockBt = round1(qtyBtRaw);

      const minBt = item.minStockBt == null ? 0 : Number(item.minStockBt) || 0;

      return {
        itemId: item.itemId,
        sku: item.sku,
        name: item.name,

        stockBt,
        minStockBt: minBt,

        underMin: minBt > 0 ? stockBt < minBt : false,
      };
    });
}
