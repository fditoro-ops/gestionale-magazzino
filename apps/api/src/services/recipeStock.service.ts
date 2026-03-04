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

  // FIX TS7006 (o commentala/eliminala se non ti serve)
  // const bySku = new Map(items.map((i: any) => [i.sku, i]));
  void items; // se non usi items, evita warning in alcuni setup

  const newMovements: any[] = [];

  for (const sold of soldItems) {
    const recipe = bom[sold.sku];

    if (!recipe) {
      console.log("⚠️ ricetta non trovata", sold.sku);
      continue;
    }

    for (const ing of recipe) {
      const qty = ing.qty * sold.qty;

      newMovements.push({
        timestamp: new Date().toISOString(),
        tipo_movimento: "DB-SCARICO",
        documento: docId,
        tenant_id: tenantId,
        sku: ing.ingredientSku,
        q_movimento: -qty,
        um: ing.um,
        note: `Scarico ricetta ${sold.sku}`,
        data: orderDate.toISOString(),
      });
    }
  }

  const updated = [...movements, ...newMovements];
  saveMovements(updated);

  return newMovements.length;
}
