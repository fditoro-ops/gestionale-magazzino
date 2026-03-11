import { loadItems } from "../data/items.store.js";
import { loadMovements } from "../data/movements.store.js";

export async function buildStockView() {
  const items = loadItems([]);
  const movements = await loadMovements([]);

  return items.map((item: any) => {
    const quantity = movements
      .filter((m: any) => m.sku === item.sku)
      .reduce((sum: number, m: any) => {
        if (m.type === "IN") return sum + m.quantity;
        if (m.type === "OUT" || m.type === "ADJUST") return sum - m.quantity;
        if (m.type === "INVENTORY") return m.quantity;
        return sum;
      }, 0);

    return {
      ...item,
      quantity,
    };
  });
}
