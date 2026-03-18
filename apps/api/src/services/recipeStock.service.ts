import { randomUUID } from "crypto";
import { loadMovements, insertManyMovements } from "../data/movements.store.js";
import type { Movement } from "../types/movement.js";
import {
  getItemBySku,
  assertItemCoreReady,
} from "./items.service.js";

type BomLine = {
  ingredientSku: string;
  qty: number;
  um: string;
};

type BomMap = Record<string, BomLine[]>;
type CicProductMode = "RECIPE" | "IGNORE";
type CicProductMap = Record<string, CicProductMode>;

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

export async function applyRecipeStock({
  docId,
  receiptNumber,
  tenantId,
  orderDate,
  soldItems,
  bom,
  cicProductModes,
  movementSign,
}: {
  docId: string;
  receiptNumber?: string;
  tenantId: string;
  orderDate: Date;
  soldItems: { sku: string; qty: number }[];
  bom: BomMap;
  cicProductModes: CicProductMap;
  movementSign: 1 | -1;
}) {
  const movements = await loadMovements();

  const movementType = movementSign === 1 ? "IN" : "OUT";
  const movementReason =
    movementSign === 1 ? "STORNO_RICETTA_CIC" : "SCARICO_RICETTA_CIC";

  const alreadyProcessed = movements.some(
    (m: any) =>
      String(m.documento || "").trim() === String(docId).trim() &&
      String(m.type || "").trim() === movementType
  );

  if (alreadyProcessed) {
    console.log("⚠️ Documento già processato per questo movimento, salto:", {
      docId,
      movementType,
    });
    return 0;
  }

  const newMovements: Movement[] = [];

  for (const sold of soldItems) {
    const soldSku = String(sold.sku || "").trim().toUpperCase();
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
      const ingredientSku = String(ing.ingredientSku || "").trim().toUpperCase();
      const ingredientQty = Number(ing.qty || 0);
      const ingredientUm = String(ing.um || "").trim().toUpperCase();

      if (!ingredientSku || !ingredientQty) {
        console.log("⚠️ Ingrediente BOM non valido:", ing);
        continue;
      }

      const item = await getItemBySku(ingredientSku);

      if (!item) {
        console.log(
          "❗ Ingrediente non presente in anagrafica:",
          ingredientSku,
          "per prodotto:",
          soldSku
        );
        continue;
      }

      try {
        assertItemCoreReady(item);
      } catch (e: any) {
        console.log(
          "❗ Ingrediente non configurato correttamente:",
          ingredientSku,
          "errore:",
          e?.message ?? e
        );
        continue;
      }

      // Coerenza BOM ↔ anagrafica
      if (ingredientUm && ingredientUm !== item.um) {
        console.log("⚠️ UM BOM diversa da UM anagrafica:", {
          soldSku,
          ingredientSku,
          bomUm: ingredientUm,
          itemUm: item.um,
        });
        continue;
      }

      // Nel nuovo modello la BOM scarica già in BT tecnica:
      // CL scarica CL, PZ scarica PZ. Nessuna divisione per baseQty/container.
      let quantity = ingredientQty * soldQty;
      quantity = round3(quantity);

      if (!quantity || quantity <= 0) continue;

      const movement: Movement = {
        id: randomUUID(),
        sku: ingredientSku,
        quantity,
        type: movementType as Movement["type"],
        reason: movementReason,
        date: orderDate.toISOString(),
        note:
          movementSign === 1
            ? `Storno ricetta ${soldSku} scontrino ${receiptNumber || ""}`
            : `Scarico ricetta ${soldSku} scontrino ${receiptNumber || ""}`,
        documento: docId,
        tenant_id: tenantId,
      };

      newMovements.push(movement);

      console.log("✅ Movimento creato:", {
        documento: docId,
        type: movement.type,
        sku: ingredientSku,
        quantity: movement.quantity,
        um: item.um,
      });
    }
  }

  if (!newMovements.length) {
    console.log("ℹ️ Nessun movimento creato per documento:", docId);
    return 0;
  }

  await insertManyMovements(newMovements);

  console.log("✅ Movimenti salvati:", newMovements.length, "documento:", docId);

  return newMovements.length;
}
