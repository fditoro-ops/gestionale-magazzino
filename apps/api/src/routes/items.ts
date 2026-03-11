// src/routes/items.ts
import { Router } from "express";
import { items as defaultItems } from "../data/items.js";
import { loadItems, saveItems } from "../data/items.store.js";
import { CreateItemSchema, UpdateItemSchema } from "../schemas/item.schema.js";
import { getStockBtForSku } from "../services/stock.service.js";

const router = Router();

const ALLOWED_CATEGORIES = new Set([
  "bevande",
  "vino",
  "birra",
  "amari",
  "distillati_altri",
  "gin",
  "vodka",
  "whiskey",
  "rhum",
  "tequila",
]);

function normalizeItem(it: any) {
  const rawCategory = (it.categoryId ?? "bevande").toString();
  const mappedCategory = rawCategory === "uncategorized" ? "bevande" : rawCategory;
  const categoryId = ALLOWED_CATEGORIES.has(mappedCategory) ? mappedCategory : "bevande";

  const supplier =
    it.supplier === "DORECA" || it.supplier === "ALPORI" || it.supplier === "VARI"
      ? it.supplier
      : "VARI";

  return {
    itemId: it.itemId ?? `itm_${Date.now()}`,
    sku: (it.sku ?? "").toString().toUpperCase().trim(),
    name: (it.name ?? "").toString(),

    categoryId,
    supplier,

    active: typeof it.active === "boolean" ? it.active : true,

    stockKind: it.stockKind ?? "UNIT",
    baseUnit: "CL",
    minStockBt: typeof it.minStockBt === "number" ? it.minStockBt : 0,

    unitToCl: it.unitToCl ?? null,
    containerSizeCl: it.containerSizeCl ?? null,
    containerLabel: it.containerLabel ?? null,

    imageUrl: it.imageUrl ?? null,

    lastCostCents: typeof it.lastCostCents === "number" ? it.lastCostCents : null,
    costCurrency: it.costCurrency ?? "EUR",

    brand: it.brand ?? null,
    packSize: typeof it.packSize === "number" ? it.packSize : null,
  };
}

let items = loadItems(defaultItems).map(normalizeItem);

if (process.env.MIGRATE_ITEMS === "1") {
  saveItems(items);
  console.log("✅ MIGRATE_ITEMS: salvati items normalizzati");
}

type Item = (typeof items)[number];

router.get("/", (_req, res) => {
  return res.json(items);
});

router.post("/", (req, res) => {
  const parsed = CreateItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation error",
      details: parsed.error.format(),
    });
  }

  const data = parsed.data;
  const exists = items.some((i: Item) => i.sku.toUpperCase() === data.sku.toUpperCase());
  if (exists) {
    return res.status(400).json({ error: `SKU ${data.sku} già esistente` });
  }

  const newItem = normalizeItem({ itemId: `itm_${Date.now()}`, ...data });
  items.push(newItem);
  saveItems(items);
  return res.status(201).json(newItem);
});

router.put("/:itemId", (req, res) => {
  const parsed = UpdateItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation error",
      details: parsed.error.format(),
    });
  }

  const index = items.findIndex((i: Item) => i.itemId === req.params.itemId);
  if (index === -1) {
    return res.status(404).json({ error: "Item non trovato" });
  }

  const current = items[index];
  const nextSku = (parsed.data.sku ?? current.sku).toUpperCase().trim();

  const duplicate = items.some(
    (i: Item) => i.itemId !== req.params.itemId && i.sku.toUpperCase() === nextSku
  );
  if (duplicate) {
    return res.status(400).json({ error: `SKU ${nextSku} già esistente` });
  }

  const updated = normalizeItem({
    ...current,
    ...parsed.data,
    itemId: current.itemId,
    sku: nextSku,
  });

  items[index] = updated;
  saveItems(items);
  return res.json(updated);
});

router.get("/:itemId", async (req, res) => {
  const item = items.find((i: Item) => i.itemId === req.params.itemId);
  if (!item) {
    return res.status(404).json({ error: "Item non trovato" });
  }

  const stockBt = await getStockBtForSku(item.sku);

  return res.json({
    ...item,
    stockBt,
  });
});

export default router;
