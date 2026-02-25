import type { Movement } from "../types/movement.js";
import { movements as defaultMovements } from "../data/movements.js";
import { loadMovements } from "../data/movements.store.js";

/**
 * Ritorna SEMPRE una lista movimenti:
 * - se esiste data/movements.json -> usa quella
 * - altrimenti fallback ai default in memoria
 */
function getAllMovements(): Movement[] {
  const persisted = loadMovements();
  return persisted.length ? persisted : defaultMovements;
}

/**
 * Stock BT per SKU (in BT = quantità numerica che usi adesso)
 */
export function getStockBtForSku(sku: string): number {
  const key = sku.toUpperCase().trim();
  const all = getAllMovements();

  return all
    .filter((m) => m.sku === key)
    .reduce((sum, m) => {
      if (m.type === "IN") return sum + m.quantity;
      if (m.type === "OUT" || m.type === "ADJUST") return sum - m.quantity;
      if (m.type === "INVENTORY") return m.quantity; // reset
      return sum;
    }, 0);
}
