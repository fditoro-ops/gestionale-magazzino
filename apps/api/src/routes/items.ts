import { Router } from "express";
import { pool } from "../db.js";
import {
  CreateItemSchema,
  UpdateItemSchema,
} from "../schemas/item.schema.js";
import { getStockBtForSku } from "../services/stock.service.js";

const router = Router();

type ItemUm = "CL" | "PZ";

function assertValidUm(um: unknown): um is ItemUm {
  return um === "CL" || um === "PZ";
}

function toNumberOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapRowToItem(row: any) {
  return {
    itemId: row.id,
    sku: row.sku,
    name: row.name ?? "",
    categoryId: row.categoryId ?? "bevande",
    category: row.category ?? "bevande",
    supplier: row.supplier ?? "VARI",
    supplierId: row.supplierId ?? null,
    active: row.active ?? true,

    um: row.um,

    baseQty: toNumberOrNull(row.baseQty),
    packSize: toNumberOrNull(row.packSize),

    brand: row.brand ?? null,

    costEur: toNumberOrNull(row.costEur),
    lastCostCents: toNumberOrNull(row.lastCostCents),

    costCurrency: row.costCurrency ?? "EUR",
    imageUrl: row.imageUrl ?? null,

    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function resolveSupplier(input: {
  supplierId?: string | null;
  supplier?: string | null;
}) {
  if (input.supplierId) {
    const r = await pool.query(
      `SELECT id, code FROM suppliers WHERE id = $1 LIMIT 1`,
      [input.supplierId]
    );
    if (r.rowCount) return r.rows[0];
  }

  if (input.supplier) {
    const code = input.supplier.toUpperCase().trim();
    const r = await pool.query(
      `SELECT id, code FROM suppliers WHERE UPPER(code) = $1 LIMIT 1`,
      [code]
    );
    if (r.rowCount) return r.rows[0];
  }

  return null;
}

async function getItemBySkuOrThrow(sku: string) {
  const r = await pool.query(
    `SELECT * FROM "Item" WHERE sku = $1 LIMIT 1`,
    [sku]
  );

  if (!r.rowCount) {
    throw new Error("ITEM_NOT_FOUND");
  }

  return r.rows[0];
}

function normalizeNextUm(patchUm: unknown, currentUm: unknown): ItemUm {
  const nextUm = (patchUm ?? currentUm) as ItemUm;
  if (!assertValidUm(nextUm)) {
    throw new Error("UM_INVALID");
  }
  return nextUm;
}

function normalizeNextBaseQty(
  patchBaseQty: unknown,
  currentBaseQty: unknown
): number {
  const nextBaseQty =
    patchBaseQty !== undefined && patchBaseQty !== null
      ? Number(patchBaseQty)
      : Number(currentBaseQty);

  if (!Number.isFinite(nextBaseQty) || nextBaseQty <= 0) {
    throw new Error("BASEQTY_INVALID");
  }

  return nextBaseQty;
}

function validateMeasure(um: ItemUm, baseQty: number) {
  if (um === "PZ" && baseQty !== 1) {
    throw new Error("PZ_BASEQTY_INVALID");
  }
}

//
// GET ALL
//
router.get("/", async (_req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM "Item" ORDER BY sku`);
    return res.json(r.rows.map(mapRowToItem));
  } catch (err) {
    console.error("GET /items error", err);
    return res.status(500).json({ error: "Errore server" });
  }
});

//
// POST
//
router.post("/", async (req, res) => {
  try {
    const parsed = CreateItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error);
    }

    const data = parsed.data;

    if (!assertValidUm(data.um)) {
      return res.status(400).json({ error: "UM non valida" });
    }

    const baseQty = Number(data.baseQty);

    if (!Number.isFinite(baseQty) || baseQty <= 0) {
      return res.status(400).json({ error: "baseQty non valida" });
    }

    if (data.um === "PZ" && baseQty !== 1) {
      return res.status(400).json({ error: "PZ deve essere 1" });
    }

    const supplierRow = await resolveSupplier({
      supplierId: (data as any).supplierId ?? null,
      supplier: data.supplier ?? null,
    });

    const supplierId = supplierRow?.id ?? null;
    const supplierCode = supplierRow?.code ?? "VARI";

    const r = await pool.query(
      `
      INSERT INTO "Item" (
        id,
        sku,
        name,
        "categoryId",
        category,
        supplier,
        "supplierId",
        active,
        um,
        "baseQty",
        brand,
        "packSize",
        "lastCostCents",
        "costCurrency",
        "imageUrl",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW()
      )
      RETURNING *
      `,
      [
        `itm_${Date.now()}`,
        data.sku,
        data.name,
        data.categoryId ?? "bevande",
        data.category ?? data.categoryId ?? "bevande",
        supplierCode,
        supplierId,
        data.active ?? true,
        data.um,
        baseQty,
        data.brand ?? null,
        data.packSize ?? null,
        data.lastCostCents ?? null,
        data.costCurrency ?? "EUR",
        data.imageUrl ?? null,
      ]
    );

    return res.json(mapRowToItem(r.rows[0]));
  } catch (err) {
    console.error("POST /items error", err);
    return res.status(500).json({ error: "Errore server" });
  }
});

//
// PATCH by SKU
//
router.patch("/:sku", async (req, res) => {
  try {
    const parsed = UpdateItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error);
    }

    const sku = req.params.sku;
    const patch = parsed.data;

    const current = await getItemBySkuOrThrow(sku);

    const nextUm = normalizeNextUm(patch.um, current.um);
    const nextBaseQty = normalizeNextBaseQty(patch.baseQty, current.baseQty);
    validateMeasure(nextUm, nextBaseQty);

    const supplierRow = await resolveSupplier({
      supplierId: (patch as any).supplierId ?? current.supplierId,
      supplier: patch.supplier ?? current.supplier,
    });

    const supplierId = supplierRow?.id ?? current.supplierId;
    const supplierCode = supplierRow?.code ?? current.supplier ?? "VARI";

    const r = await pool.query(
      `
      UPDATE "Item"
      SET
        name = $1,
        "categoryId" = $2,
        category = $3,
        supplier = $4,
        "supplierId" = $5,
        active = $6,
        um = $7,
        "baseQty" = $8,
        brand = $9,
        "packSize" = $10,
        "lastCostCents" = $11,
        "costCurrency" = $12,
        "imageUrl" = $13,
        "updatedAt" = NOW()
      WHERE sku = $14
      RETURNING *
      `,
      [
        patch.name ?? current.name,
        patch.categoryId ?? current.categoryId ?? "bevande",
        patch.category ?? current.category ?? current.categoryId ?? "bevande",
        supplierCode,
        supplierId,
        patch.active ?? current.active,
        nextUm,
        nextBaseQty,
        patch.brand ?? current.brand,
        patch.packSize ?? current.packSize,
        patch.lastCostCents ?? current.lastCostCents,
        patch.costCurrency ?? current.costCurrency ?? "EUR",
        patch.imageUrl ?? current.imageUrl,
        sku,
      ]
    );

    return res.json(mapRowToItem(r.rows[0]));
  } catch (err: any) {
    if (err?.message === "ITEM_NOT_FOUND") {
      return res.status(404).json({ error: "Item non trovato" });
    }

    if (err?.message === "UM_INVALID") {
      return res.status(400).json({ error: "UM non valida" });
    }

    if (err?.message === "BASEQTY_INVALID") {
      return res.status(400).json({ error: "baseQty non valida" });
    }

    if (err?.message === "PZ_BASEQTY_INVALID") {
      return res.status(400).json({ error: "PZ deve essere 1" });
    }

    console.error("PATCH /items/:sku error", err);
    return res.status(500).json({ error: "Errore server" });
  }
});

//
// PUT by itemId
//
router.put("/:itemId", async (req, res) => {
  try {
    const parsed = UpdateItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error);
    }

    const patch = parsed.data;

    const currentRes = await pool.query(
      `SELECT * FROM "Item" WHERE id = $1 LIMIT 1`,
      [req.params.itemId]
    );

    const current = currentRes.rows[0];

    if (!current) {
      return res.status(404).json({ error: "Item non trovato" });
    }

    const nextUm = normalizeNextUm(patch.um, current.um);
    const nextBaseQty = normalizeNextBaseQty(patch.baseQty, current.baseQty);
    validateMeasure(nextUm, nextBaseQty);

    const supplierRow = await resolveSupplier({
      supplierId: (patch as any).supplierId ?? current.supplierId,
      supplier: patch.supplier ?? current.supplier,
    });

    const supplierId = supplierRow?.id ?? current.supplierId;
    const supplierCode = supplierRow?.code ?? current.supplier ?? "VARI";

    const r = await pool.query(
      `
      UPDATE "Item"
      SET
        name = $1,
        "categoryId" = $2,
        category = $3,
        supplier = $4,
        "supplierId" = $5,
        active = $6,
        um = $7,
        "baseQty" = $8,
        brand = $9,
        "packSize" = $10,
        "lastCostCents" = $11,
        "costCurrency" = $12,
        "imageUrl" = $13,
        "updatedAt" = NOW()
      WHERE id = $14
      RETURNING *
      `,
      [
        patch.name ?? current.name,
        patch.categoryId ?? current.categoryId ?? "bevande",
        patch.category ?? current.category ?? current.categoryId ?? "bevande",
        supplierCode,
        supplierId,
        patch.active ?? current.active,
        nextUm,
        nextBaseQty,
        patch.brand ?? current.brand,
        patch.packSize ?? current.packSize,
        patch.lastCostCents ?? current.lastCostCents,
        patch.costCurrency ?? current.costCurrency ?? "EUR",
        patch.imageUrl ?? current.imageUrl,
        req.params.itemId,
      ]
    );

    return res.json(mapRowToItem(r.rows[0]));
  } catch (err: any) {
    if (err?.message === "UM_INVALID") {
      return res.status(400).json({ error: "UM non valida" });
    }

    if (err?.message === "BASEQTY_INVALID") {
      return res.status(400).json({ error: "baseQty non valida" });
    }

    if (err?.message === "PZ_BASEQTY_INVALID") {
      return res.status(400).json({ error: "PZ deve essere 1" });
    }

    console.error("PUT /items/:itemId error", err);
    return res.status(500).json({ error: "Errore server" });
  }
});

//
// GET SINGLE
//
router.get("/:itemId", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT * FROM "Item" WHERE id = $1`,
      [req.params.itemId]
    );

    if (!r.rowCount) {
      return res.status(404).json({ error: "Item non trovato" });
    }

    const item = r.rows[0];
    const stockBt = await getStockBtForSku(item.sku);

    return res.json({
      ...mapRowToItem(item),
      stockBt,
    });
  } catch (err) {
    console.error("GET /items/:itemId error", err);
    return res.status(500).json({ error: "Errore server" });
  }
});

export default router;
