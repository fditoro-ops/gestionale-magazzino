import { Router } from "express";
import { randomUUID } from "crypto";
import type { Movement } from "../types/movement.js";
import {
  loadMovements,
  insertMovement,
} from "../data/movements.store.js";
import { CreateMovementSchema } from "../schemas/movement.schema.js";
import {
  getItemBySku,
  assertItemCoreReady,
} from "../services/items.service.js";

const router = Router();

function toCsvValue(value: unknown) {
  if (value === null || value === undefined) return '""';
  const s = String(value).replace(/"/g, '""');
  return `"${s}"`;
}

function parseDateSafe(value?: string) {
  if (!value) return null;
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function matchesFilters(m: Movement, query: any) {
  const sku = String(query.sku ?? "").trim().toLowerCase();
  const type = String(query.type ?? "").trim().toUpperCase();
  const reason = String(query.reason ?? "").trim().toLowerCase();
  const documento = String(query.documento ?? "").trim().toLowerCase();
  const note = String(query.note ?? "").trim().toLowerCase();
  const dateFrom = parseDateSafe(query.dateFrom);
  const dateTo = parseDateSafe(query.dateTo);

  if (sku && !String(m.sku ?? "").toLowerCase().includes(sku)) {
    return false;
  }

  if (type && type !== "ALL" && String(m.type ?? "").toUpperCase() !== type) {
    return false;
  }

  if (
    reason &&
    !String(m.reason ?? "").toLowerCase().includes(reason)
  ) {
    return false;
  }

  if (
    documento &&
    !String((m as any).documento ?? "").toLowerCase().includes(documento)
  ) {
    return false;
  }

  if (note && !String(m.note ?? "").toLowerCase().includes(note)) {
    return false;
  }

  const movementDate = parseDateSafe(m.date);
  if (!movementDate) return false;

  if (dateFrom && movementDate.getTime() < dateFrom.getTime()) {
    return false;
  }

  if (dateTo && movementDate.getTime() > dateTo.getTime()) {
    return false;
  }

  return true;
}

/**
 * GET /movements/export
 * Esporta CSV delle movimentazioni filtrate
 */
router.get("/export", async (req, res) => {
  try {
    const allMovements = await loadMovements([]);

    const filtered = allMovements
      .filter((m) => matchesFilters(m, req.query))
      .sort(
        (a, b) =>
          new Date(b.date).getTime() - new Date(a.date).getTime()
      );

    const enrichedRows = await Promise.all(
      filtered.map(async (m) => {
        const item = await getItemBySku(m.sku).catch(() => null);

        return {
          date: m.date,
          sku: m.sku,
          itemName: item?.name ?? "",
          type: m.type,
          reason: m.reason ?? "",
          quantity: m.quantity,
          um: (item as any)?.um ?? "",
          baseQty: (item as any)?.baseQty ?? "",
          documento: (m as any)?.documento ?? "",
          note: m.note ?? "",
        };
      })
    );

    const header = [
      "DataOra",
      "SKU",
      "NomeArticolo",
      "TipoMovimento",
      "Causale",
      "Quantita",
      "UM",
      "BaseQty",
      "Documento",
      "Nota",
    ];

    const rows = enrichedRows.map((row) =>
      [
        row.date,
        row.sku,
        row.itemName,
        row.type,
        row.reason,
        row.quantity,
        row.um,
        row.baseQty,
        row.documento,
        row.note,
      ]
        .map(toCsvValue)
        .join(",")
    );

    const csv = [header.map(toCsvValue).join(","), ...rows].join("\n");
    const filename = `movimentazioni_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );

    return res.status(200).send("\uFEFF" + csv);
  } catch (err) {
    console.error("GET /movements/export error:", err);
    return res
      .status(500)
      .json({ error: "Errore esportazione movimenti" });
  }
});

/**
 * GET /movements
 */
router.get("/", async (_req, res) => {
  try {
    const movements = await loadMovements([]);

    movements.sort(
      (a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    res.json(movements);
  } catch (err) {
    console.error("GET /movements error:", err);
    res.status(500).json({ error: "Errore caricamento movimenti" });
  }
});

async function getCurrentQtyForSku(sku: string) {
  const movements = await loadMovements([]);

  return movements
    .filter((m: any) => m.sku === sku)
    .reduce((sum, m: any) => {
      if (m.type === "IN") return sum + m.quantity;
      if (m.type === "OUT" || m.type === "ADJUST") return sum - m.quantity;
      if (m.type === "INVENTORY") return m.quantity;
      return sum;
    }, 0);
}

/**
 * POST /movements
 */
router.post("/", async (req, res) => {
  try {
    const parsed = CreateMovementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation error",
        details: parsed.error.format(),
      });
    }

    const sku = parsed.data.sku.toUpperCase().trim();
    const { quantity, type, reason, note } = parsed.data;

    const item = await getItemBySku(sku);

    if (!item) {
      return res.status(400).json({
        error: `SKU ${sku} non esistente in anagrafica`,
      });
    }

    try {
      assertItemCoreReady(item);
    } catch (e: any) {
      return res.status(400).json({
        error: e?.message ?? `SKU ${sku} non configurato correttamente`,
      });
    }

    const finalReason = type === "INVENTORY" ? "INVENTARIO" : reason;

    const currentQty = await getCurrentQtyForSku(sku);

    let nextQty = currentQty;
    if (type === "IN") nextQty = currentQty + quantity;
    if (type === "OUT" || type === "ADJUST") nextQty = currentQty - quantity;
    if (type === "INVENTORY") nextQty = quantity;

    if ((type === "OUT" || type === "ADJUST") && nextQty < 0) {
      return res.status(400).json({
        error: `Stock negativo non consentito per ${sku}`,
        disponibile: currentQty,
        tentativo: nextQty,
      });
    }

    const movement: Movement = {
      id: randomUUID(),
      sku,
      quantity,
      type,
      reason: finalReason,
      date: new Date().toISOString(),
      note,
    };

    await insertMovement(movement);

    return res.status(201).json(movement);
  } catch (err) {
    console.error("POST /movements error:", err);
    return res.status(500).json({ error: "Errore salvataggio movimento" });
  }
});

export default router;
