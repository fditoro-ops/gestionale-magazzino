// src/routes/items.ts
import { Router } from "express";
import { items as defaultItems } from "../data/items.js";
import { loadItems, saveItems } from "../data/items.store.js";
import { CreateItemSchema, UpdateItemSchema } from "../schemas/item.schema.js";
import { getStockBtForSku } from "../services/stock.service.js";
import { pool } from "../db.js";

const router = Router();

// MIGRA ITEMS FILE -> DB
router.post("/migrate-to-db", async (_req, res) => {
  const client = await pool.connect();

  try {
    const fileItems = loadItems(defaultItems).map(normalizeItem);

    await client.query("BEGIN");

    let inserted = 0;
    let updated = 0;

    for (const item of fileItems) {
      const existing = await client.query(
        `
        SELECT id
        FROM "Item"
        WHERE sku = $1
        LIMIT 1
        `,
        [item.sku]
      );

      if (existing.rows[0]) {
        await client.query(
          `
          UPDATE "Item"
          SET
            name = $2,
            supplier = $3,
            "updatedAt" = NOW(),
            "lastCostCents" = $4,
            "costCurrency" = $5,
            active = $6,
            "categoryId" = $7,
            brand = $8,
            "packSize" = $9
          WHERE sku = $1
          `,
          [
            item.sku,
            item.name ?? null,
            item.supplier ?? null,
            item.lastCostCents ?? null,
            item.costCurrency ?? "EUR",
            typeof item.active === "boolean" ? item.active : true,
            item.categoryId ?? null,
            item.brand ?? null,
            item.packSize ?? null,
          ]
        );
        updated++;
      } else {
        await client.query(
          `
          INSERT INTO "Item" (
            id,
            sku,
            name,
            supplier,
            "createdAt",
            "updatedAt",
            "lastCostCents",
            "costCurrency",
            active,
            "categoryId",
            brand,
            "packSize"
          )
          VALUES ($1,$2,$3,$4,NOW(),NOW(),$5,$6,$7,$8,$9,$10)
          `,
          [
            item.itemId ?? `itm_${Date.now()}_${item.sku}`,
            item.sku,
            item.name ?? null,
            item.supplier ?? null,
            item.lastCostCents ?? null,
            item.costCurrency ?? "EUR",
            typeof item.active === "boolean" ? item.active : true,
            item.categoryId ?? null,
            item.brand ?? null,
            item.packSize ?? null,
          ]
        );
        inserted++;
      }
    }

    await client.query("COMMIT");

    return res.json({
      ok: true,
      total: fileItems.length,
      inserted,
      updated,
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("POST /items/migrate-to-db error", err);
    return res.status(500).json({
      ok: false,
      error: err.message,
    });
  } finally {
    client.release();
  }
});


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

  const newItem = normalizeItem({
    itemId: `itm_${Date.now()}`,
    ...data,
  });

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

  const incomingSku =
    typeof (parsed.data as any).sku === "string"
      ? (parsed.data as any).sku
      : undefined;

  const nextSku = (incomingSku ?? current.sku).toUpperCase().trim();

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
