import { Router } from "express";
import { pool } from "../db.js";
import { CreateItemSchema, UpdateItemSchema } from "../schemas/item.schema.js";
import { getStockBtForSku } from "../services/stock.service.js";

const router = Router();

type ItemUm = "CL" | "PZ";

function assertValidUm(um: unknown): um is ItemUm {
  return um === "CL" || um === "PZ";
}

function normalizeItemMeasure(row: any) {
  const um = row.um;
  const baseQty = row.baseQty != null ? Number(row.baseQty) : null;

  if (!assertValidUm(um)) {
    throw new Error(`Item ${row.sku}: um non valida`);
  }

  if (!Number.isFinite(baseQty) || baseQty == null || baseQty <= 0) {
    throw new Error(`Item ${row.sku}: baseQty non valida`);
  }

  return {
    um,
    baseQty,
  };
}

function deriveLegacyFieldsFromCore(input: {
  um: ItemUm;
  baseQty: number;
}) {
  return {
    stockKind: input.um === "CL" ? "VOLUME_CONTAINER" : "UNIT",
    unitToCl: null,
    containerSizeCl: input.um === "CL" ? input.baseQty : null,
    containerLabel: input.um === "CL" ? `${input.baseQty} CL` : "1 PZ",
    minStockCl: input.um === "CL" ? 0 : 0,
  };
}

function mapRowToItem(row: any) {
  return {
    itemId: row.id,
    sku: row.sku,
    name: row.name ?? "",

categoryId: row.categoryId ?? row.category ?? "bevande",
category: row.category ?? row.categoryId ?? "bevande",
supplier: row.supplier ?? "VARI",
supplierId: row.supplierId ?? null,

    active: typeof row.active === "boolean" ? row.active : true,

    um: row.um ?? null,
    baseQty: row.baseQty != null ? Number(row.baseQty) : null,

    brand: row.brand ?? null,
    packSize: row.packSize != null ? Number(row.packSize) : null,

    costEur: row.costEur != null ? Number(row.costEur) : null,
    lastCostCents:
      row.lastCostCents != null ? Number(row.lastCostCents) : null,
    costCurrency: row.costCurrency ?? "EUR",

    imageUrl: row.imageUrl ?? null,

    // compat legacy temporanea, utile se qualche pezzo frontend la legge ancora
    stockKind: row.stockKind ?? null,
    unitToCl: row.unitToCl != null ? Number(row.unitToCl) : null,
    containerSizeCl:
      row.containerSizeCl != null ? Number(row.containerSizeCl) : null,
    containerLabel: row.containerLabel ?? null,
    minStockCl: row.minStockCl != null ? Number(row.minStockCl) : 0,

    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function resolveSupplier(input: {
  supplierId?: string | null;
  supplier?: string | null;
}) {
  if (input.supplierId) {
    const byId = await pool.query(
      `
      SELECT id, code, name
      FROM suppliers
      WHERE id = $1
      LIMIT 1
      `,
      [input.supplierId]
    );

    if (byId.rowCount) return byId.rows[0];
  }

  if (input.supplier) {
    const code = input.supplier.toUpperCase().trim();

    const byCode = await pool.query(
      `
      SELECT id, code, name
      FROM suppliers
      WHERE UPPER(TRIM(code)) = $1
      LIMIT 1
      `,
      [code]
    );

    if (byCode.rowCount) return byCode.rows[0];
  }

  return null;
}

async function getItemBySkuOrThrow(sku: string) {
  const result = await pool.query(
    `
    SELECT *
    FROM "Item"
    WHERE sku = $1
    LIMIT 1
    `,
    [sku]
  );

  if (!result.rowCount) {
    throw new Error("ITEM_NOT_FOUND");
  }

  return result.rows[0];
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
        "supplierId",
        active,
        "categoryId",
        category,
        brand,
        "packSize",
        um,
        "baseQty",
        "costEur",
        "lastCostCents",
        "costCurrency",
        "imageUrl",
        "stockKind",
        "unitToCl",
        "containerSizeCl",
        "containerLabel",
        "minStockCl",
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

    if (!assertValidUm(data.um)) {
      return res.status(400).json({ error: "UM non valida" });
    }

    if (!Number.isFinite(Number(data.baseQty)) || Number(data.baseQty) <= 0) {
      return res.status(400).json({ error: "baseQty non valida" });
    }

    if (data.um === "PZ" && Number(data.baseQty) !== 1) {
      return res
        .status(400)
        .json({ error: "Per gli articoli PZ baseQty deve essere 1" });
    }

    const baseQty = Number(data.baseQty);
    const legacy = deriveLegacyFieldsFromCore({
      um: data.um,
      baseQty,
    });

    const supplierRow = await resolveSupplier({
  supplierId: (data as any).supplierId ?? null,
  supplier: data.supplier ?? null,
});

const supplierId = supplierRow?.id ?? null;
const supplierCode = supplierRow?.code ?? data.supplier ?? "VARI";

    const result = await pool.query(
      `
      INSERT INTO "Item" (
        id,
        sku,
        name,
        supplier,
        "supplierId",
        active,
        "categoryId",
        category,
        brand,
        "packSize",
        um,
        "baseQty",
        "costEur",
        "lastCostCents",
        "costCurrency",
        "imageUrl",
        "stockKind",
        "unitToCl",
        "containerSizeCl",
        "containerLabel",
        "minStockCl",
        "createdAt",
        "updatedAt"
      )
      VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
  $12, $13, $14, $15, $16, $17, $18, $19, $20,
  $21, NOW(), NOW()
)
      RETURNING
        id,
        sku,
        name,
        supplier,
        "supplierId",
        active,
        "categoryId",
        category,
        brand,
        "packSize",
        um,
        "baseQty",
        "costEur",
        "lastCostCents",
        "costCurrency",
        "imageUrl",
        "stockKind",
        "unitToCl",
        "containerSizeCl",
        "containerLabel",
        "minStockCl",
        "createdAt",
        "updatedAt"
      `,
[
  `itm_${Date.now()}_${data.sku}`,
  data.sku,
  data.name,
  supplierCode,
  supplierId,
  data.active ?? true,
  data.categoryId ?? data.category ?? "bevande",
  data.category ?? data.categoryId ?? "bevande",
  data.brand ?? null,
  data.packSize ?? null,
  data.um,
  baseQty,
  data.costEur ?? null,
  data.lastCostCents ?? null,
  data.costCurrency ?? "EUR",
  data.imageUrl ?? null,
  legacy.stockKind,
  legacy.unitToCl,
  legacy.containerSizeCl,
  legacy.containerLabel,
  legacy.minStockCl,
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
    const current = await getItemBySkuOrThrow(sku);

    const nextUm = patch.um ?? current.um;
    const nextBaseQty =
      patch.baseQty !== undefined && patch.baseQty !== null
        ? Number(patch.baseQty)
        : current.baseQty != null
        ? Number(current.baseQty)
        : null;

    if (!assertValidUm(nextUm)) {
      return res.status(400).json({ error: "UM non valida" });
    }

    if (!Number.isFinite(nextBaseQty) || nextBaseQty == null || nextBaseQty <= 0) {
      return res.status(400).json({ error: "baseQty non valida" });
    }

    if (nextUm === "PZ" && nextBaseQty !== 1) {
      return res
        .status(400)
        .json({ error: "Per gli articoli PZ baseQty deve essere 1" });
    }

    const legacy = deriveLegacyFieldsFromCore({
      um: nextUm,
      baseQty: nextBaseQty,
    });

    const result = await pool.query(
      `
      UPDATE "Item"
      SET
        name = COALESCE($1, name),
        supplier = COALESCE($2, supplier),
        active = COALESCE($3, active),
        "categoryId" = COALESCE($4, "categoryId"),
        category = COALESCE($5, category),
        brand = $6,
        "packSize" = $7,
        um = $8,
        "baseQty" = $9,
        "costEur" = $10,
        "lastCostCents" = $11,
        "costCurrency" = COALESCE($12, "costCurrency"),
        "imageUrl" = $13,
        "stockKind" = $14,
        "unitToCl" = $15,
        "containerSizeCl" = $16,
        "containerLabel" = $17,
        "minStockCl" = $18,
        "updatedAt" = NOW()
      WHERE sku = $19
      RETURNING
        id,
        sku,
        name,
        supplier,
        "supplierId",
        active,
        "categoryId",
        category,
        brand,
        "packSize",
        um,
        "baseQty",
        "costEur",
        "lastCostCents",
        "costCurrency",
        "imageUrl",
        "stockKind",
        "unitToCl",
        "containerSizeCl",
        "containerLabel",
        "minStockCl",
        "createdAt",
        "updatedAt"
      `,
      [
        patch.name ?? null,
        patch.supplier ?? null,
        patch.active ?? null,
        patch.categoryId ?? null,
        patch.category ?? patch.categoryId ?? null,
        patch.brand ?? current.brand ?? null,
        patch.packSize ?? current.packSize ?? null,
        nextUm,
        nextBaseQty,
        patch.costEur ?? current.costEur ?? null,
        patch.lastCostCents ?? current.lastCostCents ?? null,
        patch.costCurrency ?? null,
        patch.imageUrl ?? current.imageUrl ?? null,
        legacy.stockKind,
        legacy.unitToCl,
        legacy.containerSizeCl,
        legacy.containerLabel,
        legacy.minStockCl,
        sku,
      ]
    );

    return res.json(mapRowToItem(result.rows[0]));
  } catch (err: any) {
    if (err?.message === "ITEM_NOT_FOUND") {
      return res.status(404).json({ error: "Item non trovato" });
    }

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

    const nextUm = patch.um ?? current.um;
    const nextBaseQty =
      patch.baseQty !== undefined && patch.baseQty !== null
        ? Number(patch.baseQty)
        : current.baseQty != null
        ? Number(current.baseQty)
        : null;

    if (!assertValidUm(nextUm)) {
      return res.status(400).json({ error: "UM non valida" });
    }

    if (!Number.isFinite(nextBaseQty) || nextBaseQty == null || nextBaseQty <= 0) {
      return res.status(400).json({ error: "baseQty non valida" });
    }

    if (nextUm === "PZ" && nextBaseQty !== 1) {
      return res
        .status(400)
        .json({ error: "Per gli articoli PZ baseQty deve essere 1" });
    }

    const legacy = deriveLegacyFieldsFromCore({
      um: nextUm,
      baseQty: nextBaseQty,
    });

    const result = await pool.query(
      `
      UPDATE "Item"
      SET
        name = COALESCE($1, name),
        supplier = COALESCE($2, supplier),
        active = COALESCE($3, active),
        "categoryId" = COALESCE($4, "categoryId"),
        category = COALESCE($5, category),
        brand = $6,
        "packSize" = $7,
        um = $8,
        "baseQty" = $9,
        "costEur" = $10,
        "lastCostCents" = $11,
        "costCurrency" = COALESCE($12, "costCurrency"),
        "imageUrl" = $13,
        "stockKind" = $14,
        "unitToCl" = $15,
        "containerSizeCl" = $16,
        "containerLabel" = $17,
        "minStockCl" = $18,
        "updatedAt" = NOW()
      WHERE id = $19
      RETURNING
        id,
        sku,
        name,
        supplier,
        "supplierId",
        active,
        "categoryId",
        category,
        brand,
        "packSize",
        um,
        "baseQty",
        "costEur",
        "lastCostCents",
        "costCurrency",
        "imageUrl",
        "stockKind",
        "unitToCl",
        "containerSizeCl",
        "containerLabel",
        "minStockCl",
        "createdAt",
        "updatedAt"
      `,
      [
        patch.name ?? null,
        patch.supplier ?? null,
        patch.active ?? null,
        patch.categoryId ?? null,
        patch.category ?? patch.categoryId ?? null,
        patch.brand ?? current.brand ?? null,
        patch.packSize ?? current.packSize ?? null,
        nextUm,
        nextBaseQty,
        patch.costEur ?? current.costEur ?? null,
        patch.lastCostCents ?? current.lastCostCents ?? null,
        patch.costCurrency ?? null,
        patch.imageUrl ?? current.imageUrl ?? null,
        legacy.stockKind,
        legacy.unitToCl,
        legacy.containerSizeCl,
        legacy.containerLabel,
        legacy.minStockCl,
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
        "supplierId",
        active,
        "categoryId",
        category,
        brand,
        "packSize",
        um,
        "baseQty",
        "costEur",
        "lastCostCents",
        "costCurrency",
        "imageUrl",
        "stockKind",
        "unitToCl",
        "containerSizeCl",
        "containerLabel",
        "minStockCl",
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

    try {
      normalizeItemMeasure(result.rows[0]);
    } catch (e: any) {
      return res.status(500).json({
        error: `Articolo ${item.sku} non configurato correttamente`,
      });
    }

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
