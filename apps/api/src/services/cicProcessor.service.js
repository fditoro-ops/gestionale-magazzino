import { insertManyMovements } from "../data/movements.store.js";

export async function processPendingRow(row) {
  if (row.type === "IGNORE") return;

  if (!row.resolvedSku) {
    throw new Error("Missing SKU");
  }

  // esempio base → personalizzeremo dopo
  const movement = {
    id: crypto.randomUUID(),
    sku: row.resolvedSku,
    quantity: -Math.abs(row.qty || 1),
    type: "OUT",
    reason: "SCARICO_RICETTA_CIC",
    date: new Date(),
  };

  await insertManyMovements([movement]);
}
