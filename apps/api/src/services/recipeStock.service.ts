import { loadItems } from "../data/items.store";
import { loadMovements, saveMovements } from "../data/movements.store";

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
  bom
}: {
  docId: string;
  tenantId: string;
  orderDate: Date;
  soldItems: { sku: string; qty: number }[];
  bom: BomMap;
}) {

  const items = loadItems([]);
  const movements = loadMovements([]);

  const bySku = new Map(items.map(i => [i.sku, i]));

  const newMovements: any[] = [];

  for (const sold of soldItems) {

    const recipe = bom[sold.sku];

    if (!recipe) {
      console.log("⚠️ ricetta non trovata", sold.sku);
      continue;
    }

    for (const ing of recipe) {

      const qty = ing.qty * sold.qty;

      const movement = {
        timestamp: new Date().toISOString(),
        tipo_movimento: "DB-SCARICO",
        documento: docId,
        tenant_id: tenantId,
        sku: ing.ingredientSku,
        q_movimento: -qty,
        um: ing.um,
        note: `Scarico ricetta ${sold.sku}`,
        data: orderDate.toISOString()
      };

      newMovements.push(movement);
    }
  }

  const updated = [...movements, ...newMovements];

  saveMovements(updated);

  return newMovements.length;
}
