import { loadItems } from "../data/items.store.js";
import { loadMovements, saveMovements } from "../data/movements.store.js";

type BomLine = {
  ingredientSku: string;
  qty: number;
  um: string;
};

type BomMap = Record<string, BomLine[]>;

export function applyRecipeStock({
  docId,
  tenantId,
  orderDate,
  soldItems,
  bom,
}: {
  docId: string;
  tenantId: string;
  orderDate: Date;
  soldItems: { sku: string; qty: number }[];
  bom: BomMap;
}) {
  const items = loadItems();
  const movements = loadMovements();

  const bySku = new Map(items.map((i: any) => [String(i.sku).trim(), i]));

  // 1) Idempotenza: se esistono già movimenti per questo documento, non riscaricare
  const alreadyProcessed = movements.some(
    (m: any) => String(m.documento || "").trim() === String(docId).trim()
  );

  if (alreadyProcessed) {
    console.log("⚠️ Documento già processato, salto:", docId);
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

    const recipe = bom[soldSku];

    if (!recipe || !recipe.length) {
      console.log("⚠️ Ricetta non trovata:", soldSku);
      continue;
    }

    console.log("🍸 Ricetta trovata:", soldSku, "ingredienti:", recipe.length, "qty venduta:", soldQty);

    for (const ing of recipe) {
      const ingredientSku = String(ing.ingredientSku || "").trim();
      const ingredientQty = Number(ing.qty || 0);
      const ingredientUm = String(ing.um || "").trim().toUpperCase();

      if (!ingredientSku || !ingredientQty) {
        console.log("⚠️ Ingrediente BOM non valido:", ing);
        continue;
      }

      const itemExists = bySku.has(ingredientSku);
      if (!itemExists) {
        console.log("❗ Ingrediente non presente in anagrafica:", ingredientSku, "per prodotto:", soldSku);
        continue;
      }

      const qty = ingredientQty * soldQty;

      newMovements.push({
        timestamp: new Date().toISOString(),
        tipo_movimento: "DB-SCARICO",
        documento: docId,
        tenant_id: tenantId,
        sku: ingredientSku,
        q_movimento: -qty,
        um: ingredientUm,
        note: `Scarico ricetta ${soldSku}`,
        data: orderDate.toISOString(),
      });

      console.log("✅ Movimento creato:", {
        documento: docId,
        sku: ingredientSku,
        q_movimento: -qty,
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
