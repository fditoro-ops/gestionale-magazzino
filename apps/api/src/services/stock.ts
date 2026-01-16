import type { Movement } from "../types/movement.js";

export function calculateStock(movements: Movement[]) {
  const stock: Record<string, number> = {};

  for (const m of movements) {
    if (!stock[m.sku] || m.type === "INVENTORY") {
      stock[m.sku] = 0;
    }

    switch (m.type) {
      case "IN":
        stock[m.sku] += m.quantity;
        break;
      case "OUT":
        stock[m.sku] -= m.quantity;
        break;
      case "ADJUST":
        stock[m.sku] += m.quantity;
        break;
      case "INVENTORY":
        stock[m.sku] = m.quantity;
        break;
    }
  }

  return stock;
}
