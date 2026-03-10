import { randomUUID } from "crypto";
import { loadItems } from "../data/items.store.js";
import { loadMovements, saveMovements } from "../data/movements.store.js";

type BomLine = {
  ingredientSku: string;
  qty: number;
  um: string;
};

type BomMap = Record<string, BomLine[]>;
type CicProductMode = "RECIPE" | "IGNORE";
type CicProductMap = Record<string, CicProductMode>;

export function applyRecipeStock({
  docId,
  tenantId,
  orderDate,
  soldItems,
  bom,
  cicProductModes,
  movementSign,
}: {
  docId: string;
  tenantId: string;
  orderDate: Date;
  soldItems: { sku: string; qty: number }[];
  bom: BomMap;
  cicProductModes: CicProductMap;
  movementSign: 1 | -1;
}) {
  const items = loadItems();
  const movements = loadMovements();

  const bySku = new Map(items.map((i: any) => [String(i.sku).trim(), i]));

  const movementType = movementSign === 1 ? "IN" : "OUT";
  const movementReason =
    movementSign === 1 ? "STORNO_RICETTA_CIC" : "SCARICO_RICETTA_CIC";

  const alreadyProcessed = movements.some(
    (m: any) =>
      String(m.documento || "").trim() === String(docId).trim() &&
      String(m.reason || "").trim() === movementReason
  );

  if (alreadyProcessed) {
    console.log("⚠️ Documento già processato per questo movimento, salto:", {
      docId,
      movementReason,
    });
    return 0;
  }

  const newMovements: any[] = [];

  for (const sold of soldItems) {
    const soldSku = String(sold.sku || "").trim();
    const soldQty = Number(sold.qty || 0);

    if (!soldSku || !soldQty) {
      console.log("⚠️ Riga vendita non valida:", sold);
      continue;
    }

    const mode = cicProductModes[soldSku];

    if (mode === "IGNORE") {
      console.log("⏭ SKU ignorato da PRODOTTI_CIC:", soldSku);
      continue;
    }

    if (mode !== "RECIPE") {
      console.log("⚠️ SKU non classificato in PRODOTTI_CIC:", soldSku);
      continue;
    }

    const recipe = bom[soldSku];

    if (!recipe || !recipe.length) {
      console.log("⚠️ Ricetta non trovata per SKU RECIPE:", soldSku);
      continue;
    }

    console.log(
      "🍸 Ricetta trovata:",
      soldSku,
      "ingredienti:",
      recipe.length,
      "qty venduta:",
      soldQty,
      "movementType:",
      movementType
    );

    for (const ing of recipe) {
      const ingredientSku = String(ing.ingredientSku || "").trim();
      const ingredientQty = Number(ing.qty || 0);

      if (!ingredientSku || !ingredientQty) {
        console.log("⚠️ Ingrediente BOM non valido:", ing);
        continue;
      }

      if (!bySku.has(ingredientSku)) {
        console.log(
          "❗ Ingrediente non presente in anagrafica:",
          ingredientSku,
          "per prodotto:",
          soldSku
        );
        continue;
      }

      const quantity = ingredientQty * soldQty;

      newMovements.push({
        id: randomUUID(),
        sku: ingredientSku,
        quantity,
        type: movementType,
        reason: movementReason,
        date: orderDate.toISOString(),
        note:
          movementSign === 1
            ? `Storno ricetta ${soldSku} doc ${docId}`
            : `Scarico ricetta ${soldSku} doc ${docId}`,
        documento: docId,
        tenant_id: tenantId,
      });

      console.log("✅ Movimento creato:", {
        documento: docId,
        type: movementType,
        sku: ingredientSku,
        quantity,
      });
    }
  }

  if (!newMovements.length) {
    console.log("ℹ️ Nessun movimento creato per documento:", docId);
    return 0;
  }

  const updated = [...movements, ...newMovements];
  saveMovements(updated);

  console.log("✅ Movimenti salvati:", newMovements.length, "documento:", docId);

  return newMovements.length;
}
