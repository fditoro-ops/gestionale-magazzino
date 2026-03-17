import { Router } from "express";
import { pool } from "../db.js";
import { CreateItemSchema, UpdateItemSchema } from "../schemas/item.schema.js";
import { getStockBtForSku } from "../services/stock.service.js";

const router = Router();

function mapRowToItem(row: any) {
  return {
    itemId: row.id,
    sku: row.sku,
    name: row.name ?? "",

    categoryId: row.categoryId ?? "bevande",
    supplier: row.supplier ?? "VARI",

    active: typeof row.active === "boolean" ? row.active : true,

    stockKind: row.stockKind ?? "UNIT",
    minStockCl: Number(row.minStockCl ?? 0),

    unitToCl: row.unitToCl != null ? Number(row.unitToCl) : null,
    containerSizeCl:
      row.containerSizeCl != null ? Number(row.containerSizeCl) : null,
    containerLabel: row.containerLabel ?? null,

    imageUrl: row.imageUrl ?? null,

    lastCostCents:
      row.lastCostCents != null ? Number(row.lastCostCents) : null,
    costCurrency: row.costCurrency ?? "EUR",

    brand: row.brand ?? null,
    packSize: row.packSize != null ? Number(row.packSize) : null,

    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// GET /items
router.get("/", async (_req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        id,
        sku,
        name,
        supplier,
        active,
        "categoryId",
        brand,
        "packSize",
        "stockKind",
        "unitToCl",
        "containerSizeCl",
        "containerLabel",
        "minStockCl",
        "lastCostCents",
        "costCurrency",
        "imageUrl",
        "createdAt",
        "updatedAt"
      FROM "Item"
      ORDER BY sku ASC
      `
    );

    return res.json(result.rows.map(mapRowToItem));
  } catch (err: any) {
    console.error("GET /items error", err);
    return res.status(500).json({ error: "Errore caricamento articoli" });
  }
});

// POST /items
router.post("/", async (req, res) => {
  const parsed = CreateItemSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation error",
      details: parsed.error.format(),
    });
  }

  const data = parsed.data;

  try {
    const exists = await pool.query(
      `
      SELECT id
      FROM "Item"
      WHERE sku = $1
      LIMIT 1
      `,
      [data.sku]
    );

    if (exists.rowCount) {
      return res.status(400).json({ error: `SKU ${data.sku} già esistente` });
    }

    const result = await pool.query(
      `
      INSERT INTO "Item" (
        id,
        sku,
        name,
        supplier,
        active,
        "categoryId",
        brand,
        "packSize",
        "stockKind",
        "unitToCl",
        "containerSizeCl",
        "containerLabel",
        "minStockCl",
        "lastCostCents",
        "costCurrency",
        "imageUrl",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15, $16,
        NOW(), NOW()
      )
      RETURNING
        id,
        sku,
        name,
        supplier,
        active,
        "categoryId",
        brand,
        "packSize",
        "stockKind",
        "unitToCl",
        "containerSizeCl",
        "containerLabel",
        "minStockCl",
        "lastCostCents",
        "costCurrency",
        "imageUrl",
        "createdAt",
        "updatedAt"
      `,
      [
        `itm_${Date.now()}_${data.sku}`,
        data.sku,
        data.name,
        data.supplier,
        data.active ?? true,
        data.categoryId,
        data.brand ?? null,
        data.packSize ?? null,
        data.stockKind,
        data.stockKind === "UNIT" ? data.unitToCl ?? null : null,
        data.stockKind === "VOLUME_CONTAINER" ? data.containerSizeCl ?? null : null,
        data.stockKind === "VOLUME_CONTAINER" ? data.containerLabel ?? null : null,
        data.minStockCl ?? 0,
        data.lastCostCents ?? null,
        data.costCurrency ?? "EUR",
        data.imageUrl ?? null,
      ]
    );

    return res.status(201).json(mapRowToItem(result.rows[0]));
  } catch (err: any) {
    console.error("POST /items error", err);
    return res.status(500).json({ error: "Errore creazione articolo" });
  }
});

// PATCH /items/:sku
router.patch("/:sku", async (req, res) => {
  const parsed = UpdateItemSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation error",
      details: parsed.error.format(),
    });
  }

  const sku = req.params.sku.toUpperCase().trim();
  const patch = parsed.data;

  try {
    const currentRes = await pool.query(
      `
      SELECT *
      FROM "Item"
      WHERE sku = $1
      LIMIT 1
      `,
      [sku]
    );

    if (!currentRes.rowCount) {
      return res.status(404).json({ error: "Item non trovato" });
    }

    const current = currentRes.rows[0];

    const nextStockKind = patch.stockKind ?? current.stockKind ?? "UNIT";

    const nextUnitToCl =
      nextStockKind === "UNIT"
        ? patch.unitToCl !== undefined
          ? patch.unitToCl
          : current.unitToCl
        : null;

    const nextContainerSizeCl =
      nextStockKind === "VOLUME_CONTAINER"
        ? patch.containerSizeCl !== undefined
          ? patch.containerSizeCl
          : current.containerSizeCl
        : null;

    const nextContainerLabel =
      nextStockKind === "VOLUME_CONTAINER"
        ? patch.containerLabel !== undefined
          ? patch.containerLabel
          : current.containerLabel
        : null;

    const result = await pool.query(
      `
      UPDATE "Item"
      SET
        name = COALESCE($1, name),
        supplier = COALESCE($2, supplier),
        active = COALESCE($3, active),
        "categoryId" = COALESCE($4, "categoryId"),
        brand = $5,
        "packSize" = $6,
        "stockKind" = COALESCE($7, "stockKind"),
        "unitToCl" = $8,
        "containerSizeCl" = $9,
        "containerLabel" = $10,
        "minStockCl" = COALESCE($11, "minStockCl"),
        "lastCostCents" = $12,
        "costCurrency" = COALESCE($13, "costCurrency"),
        "imageUrl" = $14,
        "updatedAt" = NOW()
      WHERE sku = $15
      RETURNING
        id,
        sku,
        name,
        supplier,
        active,
        "categoryId",
        brand,
        "packSize",
        "stockKind",
        "unitToCl",
        "containerSizeCl",
        "containerLabel",
        "minStockCl",
        "lastCostCents",
        "costCurrency",
        "imageUrl",
        "createdAt",
        "updatedAt"
      `,
      [
        patch.name ?? null,
        patch.supplier ?? null,
        patch.active ?? null,
        patch.categoryId ?? null,
        patch.brand ?? current.brand ?? null,
        patch.packSize ?? current.packSize ?? null,
        patch.stockKind ?? null,
        nextUnitToCl,
        nextContainerSizeCl,
        nextContainerLabel,
        patch.minStockCl ?? null,
        patch.lastCostCents ?? current.lastCostCents ?? null,
        patch.costCurrency ?? null,
        patch.imageUrl ?? current.imageUrl ?? null,
        sku,
      ]
    );

    return res.json(mapRowToItem(result.rows[0]));
  } catch (err: any) {
    console.error("PATCH /items/:sku error", err);
    return res.status(500).json({ error: "Errore salvataggio articolo" });
  }
});

// PUT /items/:itemId
router.put("/:itemId", async (req, res) => {
  const parsed = UpdateItemSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation error",
      details: parsed.error.format(),
    });
  }

  try {
    const currentRes = await pool.query(
      `
      SELECT *
      FROM "Item"
      WHERE id = $1
      LIMIT 1
      `,
      [req.params.itemId]
    );

    if (!currentRes.rowCount) {
      return res.status(404).json({ error: "Item non trovato" });
    }

    const current = currentRes.rows[0];
    const patch = parsed.data;
    const nextStockKind = patch.stockKind ?? current.stockKind ?? "UNIT";

    const nextUnitToCl =
      nextStockKind === "UNIT"
        ? patch.unitToCl !== undefined
          ? patch.unitToCl
          : current.unitToCl
        : null;

    const nextContainerSizeCl =
      nextStockKind === "VOLUME_CONTAINER"
        ? patch.containerSizeCl !== undefined
          ? patch.containerSizeCl
          : current.containerSizeCl
        : null;

    const nextContainerLabel =
      nextStockKind === "VOLUME_CONTAINER"
        ? patch.containerLabel !== undefined
          ? patch.containerLabel
          : current.containerLabel
        : null;

    const result = await pool.query(
      `
      UPDATE "Item"
      SET
        name = COALESCE($1, name),
        supplier = COALESCE($2, supplier),
        active = COALESCE($3, active),
        "categoryId" = COALESCE($4, "categoryId"),
        brand = $5,
        "packSize" = $6,
        "stockKind" = COALESCE($7, "stockKind"),
        "unitToCl" = $8,
        "containerSizeCl" = $9,
        "containerLabel" = $10,
        "minStockCl" = COALESCE($11, "minStockCl"),
        "lastCostCents" = $12,
        "costCurrency" = COALESCE($13, "costCurrency"),
        "imageUrl" = $14,
        "updatedAt" = NOW()
      WHERE id = $15
      RETURNING
        id,
        sku,
        name,
        supplier,
        active,
        "categoryId",
        brand,
        "packSize",
        "stockKind",
        "unitToCl",
        "containerSizeCl",
        "containerLabel",
        "minStockCl",
        "lastCostCents",
        "costCurrency",
        "imageUrl",
        "createdAt",
        "updatedAt"
      `,
      [
        patch.name ?? null,
        patch.supplier ?? null,
        patch.active ?? null,
        patch.categoryId ?? null,
        patch.brand ?? current.brand ?? null,
        patch.packSize ?? current.packSize ?? null,
        patch.stockKind ?? null,
        nextUnitToCl,
        nextContainerSizeCl,
        nextContainerLabel,
        patch.minStockCl ?? null,
        patch.lastCostCents ?? current.lastCostCents ?? null,
        patch.costCurrency ?? null,
        patch.imageUrl ?? current.imageUrl ?? null,
        req.params.itemId,
      ]
    );

    return res.json(mapRowToItem(result.rows[0]));
  } catch (err: any) {
    console.error("PUT /items/:itemId error", err);
    return res.status(500).json({ error: "Errore aggiornamento articolo" });
  }
});

// GET /items/:itemId
router.get("/:itemId", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        id,
        sku,
        name,
        supplier,
        active,
        "categoryId",
        brand,
        "packSize",
        "stockKind",
        "unitToCl",
        "containerSizeCl",
        "containerLabel",
        "minStockCl",
        "lastCostCents",
        "costCurrency",
        "imageUrl",
        "createdAt",
        "updatedAt"
      FROM "Item"
      WHERE id = $1
      LIMIT 1
      `,
      [req.params.itemId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Item non trovato" });
    }

    const item = mapRowToItem(result.rows[0]);
    const stockBt = await getStockBtForSku(item.sku);

    return res.json({
      ...item,
      stockBt,
    });
  } catch (err: any) {
    console.error("GET /items/:itemId error", err);
    return res.status(500).json({ error: "Errore caricamento dettaglio articolo" });
  }
});

export default router;
