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

  const movementType = movementSign === 1 ? "DB-CARICO" : "DB-SCARICO";

  // blocca solo il doppione dello stesso documento + stesso tipo movimento
  const alreadyProcessed = movements.some(
    (m: any) =>
      String(m.documento || "").trim() === String(docId).trim() &&
      String(m.tipo_movimento || "").trim() === movementType
  );

  if (alreadyProcessed) {
    console.log("⚠️ Documento già processato per questo movimento, salto:", {
      docId,
      movementType,
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
      const ingredientUm = String(ing.um || "").trim().toUpperCase();

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

      const qty = ingredientQty * soldQty;
      const qMovimento = movementSign * qty;

      newMovements.push({
        timestamp: new Date().toISOString(),
        tipo_movimento: movementType,
        documento: docId,
        tenant_id: tenantId,
        sku: ingredientSku,
        q_movimento: qMovimento,
        um: ingredientUm,
        note:
          movementSign === 1
            ? `Storno ricetta ${soldSku}`
            : `Scarico ricetta ${soldSku}`,
        data: orderDate.toISOString(),
      });

      console.log("✅ Movimento creato:", {
        documento: docId,
        tipo_movimento: movementType,
        sku: ingredientSku,
        q_movimento: qMovimento,
        um: ingredientUm,
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
