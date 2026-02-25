import { items as defaultItems } from "../data/items.js";
import { loadItems } from "../data/items.store.js";

const items = loadItems(defaultItems);

export type Item = (typeof items)[number];

export function getItemBySku(sku: string): Item | undefined {
  const key = sku.toUpperCase().trim();
  return items.find((i: any) => i.sku.toUpperCase() === key);

}
