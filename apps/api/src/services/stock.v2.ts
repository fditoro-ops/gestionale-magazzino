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

  unitToCl?: number | null;
  containerSizeCl?: number | null;

  minStockBt?: number | null;
};

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
