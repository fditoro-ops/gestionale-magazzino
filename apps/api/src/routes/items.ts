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

function normalizeItemMeasure(row: any) {
  const um = row.um;
  const baseQty = row.baseQty != null ? Number(row.baseQty) : null;

  if (!assertValidUm(um)) throw new Error("UM non valida");
  if (!Number.isFinite(baseQty) || baseQty <= 0)
    throw new Error("baseQty non valida");

  return { um, baseQty };
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
    minStockCl: 0,
  };
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
    baseQty: Number(row.baseQty),
    brand: row.brand ?? null,
    packSize: row.packSize ?? null,
    costEur: row.costEur ?? null,
    lastCostCents: row.lastCostCents ?? null,
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
      `SELECT id, code FROM suppliers WHERE id=$1 LIMIT 1`,
      [input.supplierId]
    );
    if (r.rowCount) return r.rows[0];
  }

  if (input.supplier) {
    const code = input.supplier.toUpperCase().trim();
    const r = await pool.query(
      `SELECT id, code FROM suppliers WHERE UPPER(code)=$1 LIMIT 1`,
      [code]
    );
    if (r.rowCount) return r.rows[0];
  }

  return null;
}

async function getItemBySkuOrThrow(sku: string) {
  const r = await pool.query(
    `SELECT * FROM "Item" WHERE sku=$1 LIMIT 1`,
    [sku]
  );
  if (!r.rowCount) throw new Error("ITEM_NOT_FOUND");
  return r.rows[0];
}

//
// GET ALL
//
router.get("/", async (_req, res) => {
  const r = await pool.query(`SELECT * FROM "Item" ORDER BY sku`);
  res.json(r.rows.map(mapRowToItem));
});

//
// POST
//
router.post("/", async (req, res) => {
  const parsed = CreateItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);

  const data = parsed.data;

  if (!assertValidUm(data.um))
    return res.status(400).json({ error: "UM non valida" });

  if (data.um === "PZ" && Number(data.baseQty) !== 1)
    return res.status(400).json({ error: "PZ deve essere 1" });

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
  const supplierCode = supplierRow?.code ?? "VARI";

  const r = await pool.query(
    `
    INSERT INTO "Item"
    (id, sku, name, supplier, "supplierId", um, "baseQty")
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING *
    `,
    [
      `itm_${Date.now()}`,
      data.sku,
      data.name,
      supplierCode,
      supplierId,
      data.um,
      baseQty,
    ]
  );

  res.json(mapRowToItem(r.rows[0]));
});

//
// PATCH
//
router.patch("/:sku", async (req, res) => {
  const parsed = UpdateItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);

  const sku = req.params.sku;
  const patch = parsed.data;

  const current = await getItemBySkuOrThrow(sku);

  const supplierRow = await resolveSupplier({
    supplierId: (patch as any).supplierId ?? current.supplierId,
    supplier: patch.supplier ?? current.supplier,
  });

  const supplierId = supplierRow?.id ?? current.supplierId;
  const supplierCode = supplierRow?.code ?? current.supplier;

  const r = await pool.query(
    `
    UPDATE "Item"
    SET
      name=$1,
      supplier=$2,
      "supplierId"=$3
    WHERE sku=$4
    RETURNING *
    `,
    [patch.name ?? current.name, supplierCode, supplierId, sku]
  );

  res.json(mapRowToItem(r.rows[0]));
});

//
// PUT
//
router.put("/:itemId", async (req, res) => {
  const parsed = UpdateItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);

  const patch = parsed.data;

  const currentRes = await pool.query(
    `SELECT * FROM "Item" WHERE id=$1`,
    [req.params.itemId]
  );

  const current = currentRes.rows[0];

  const supplierRow = await resolveSupplier({
    supplierId: (patch as any).supplierId ?? current.supplierId,
    supplier: patch.supplier ?? current.supplier,
  });

  const supplierId = supplierRow?.id ?? current.supplierId;
  const supplierCode = supplierRow?.code ?? current.supplier;

  const r = await pool.query(
    `
    UPDATE "Item"
    SET
      name=$1,
      supplier=$2,
      "supplierId"=$3
    WHERE id=$4
    RETURNING *
    `,
    [patch.name ?? current.name, supplierCode, supplierId, req.params.itemId]
  );

  res.json(mapRowToItem(r.rows[0]));
});

//
// GET SINGLE
//
router.get("/:itemId", async (req, res) => {
  const r = await pool.query(
    `SELECT * FROM "Item" WHERE id=$1`,
    [req.params.itemId]
  );

  const item = r.rows[0];
  const stockBt = await getStockBtForSku(item.sku);

  res.json({ ...mapRowToItem(item), stockBt });
});

export default router;
