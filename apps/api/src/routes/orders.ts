import { Router } from "express";
import { randomUUID } from "crypto";

console.log("✅ ORDERS ROUTER FILE LOADED");

import type { Order } from "../data/orders.db.js";
import {
  listOrders,
  getOrderById,
  createOrderDb,
  updateOrderDb,
  deleteOrderDb,
} from "../data/orders.db.js";

import {
  CreateOrderSchema,
  UpdateOrderSchema,
  ReceiveOrderSchema,
} from "../schemas/order.schema.js";

import {
  getItemBySku,
  assertItemCoreReady,
} from "../services/items.service.js";

import type { Movement } from "../types/movement.js";
import { insertManyMovements } from "../data/movements.store.js";

const router = Router();

router.get("/_ping", (_req, res) => {
  res.json({ ok: true, route: "/orders/_ping" });
});

router.get("/_debug", async (_req, res) => {
  try {
    const orders = await listOrders();
    res.json({
      ok: true,
      source: "db",
      ordersCount: Array.isArray(orders) ? orders.length : -1,
      sample: Array.isArray(orders) ? orders.slice(0, 3) : [],
    });
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      error: String(err?.message ?? err),
    });
  }
});

async function getPackSizeForSku(sku: string): Promise<number> {
  const it = await getItemBySku(sku);

  if (!it) {
    throw new Error(`SKU ${sku} non esistente in anagrafica`);
  }

  assertItemCoreReady(it);

  const p = Number(it.packSize ?? 1);
  return Number.isFinite(p) && p > 0 ? Math.floor(p) : 1;
}

async function confToBt(sku: string, qtyConf: number): Promise<number> {
  const packSize = await getPackSizeForSku(sku);
  return qtyConf * packSize;
}

function hasDuplicateSkus(lines: Array<{ sku: string }>): boolean {
  const seen = new Set<string>();

  for (const line of lines) {
    const sku = String(line.sku ?? "").toUpperCase().trim();
    if (seen.has(sku)) return true;
    seen.add(sku);
  }

  return false;
}

async function normalizeOrder(o: any): Promise<Order> {
  const lines = Array.isArray(o?.lines) ? o.lines : [];

  const normalizedLines = await Promise.all(
    lines.map(async (l: any) => {
      const sku = (l?.sku ?? "").toString().toUpperCase().trim();

      const qtyOrderedConf =
        l?.qtyOrderedConf != null
          ? Number(l.qtyOrderedConf)
          : l?.qtyOrderedPz != null
          ? Math.ceil(Number(l.qtyOrderedPz) / (await getPackSizeForSku(sku)))
          : 0;

      const qtyReceivedConf =
        l?.qtyReceivedConf != null
          ? Number(l.qtyReceivedConf)
          : l?.qtyReceivedPz != null
          ? Math.floor(Number(l.qtyReceivedPz) / (await getPackSizeForSku(sku)))
          : 0;

      return {
        sku,
        qtyOrderedConf: Number.isFinite(qtyOrderedConf) ? qtyOrderedConf : 0,
        qtyReceivedConf: Number.isFinite(qtyReceivedConf) ? qtyReceivedConf : 0,
      };
    })
  );

  return {
    orderId: (o?.orderId ?? `ord_${randomUUID()}`).toString(),
    supplier: (o?.supplier ?? "VARI").toString().toUpperCase(),
    status: (o?.status ?? "DRAFT").toString().toUpperCase() as Order["status"],
    createdAt: o?.createdAt ?? new Date().toISOString(),
    sentAt: o?.sentAt ?? null,
    receivedAt: o?.receivedAt ?? null,
    notes: o?.notes ?? null,
    lines: normalizedLines,
  };
}

async function ensureSkuReady(skuRaw: string) {
  const sku = skuRaw.toUpperCase().trim();
  const it = await getItemBySku(sku);

  if (!it) {
    throw new Error(`SKU ${sku} non esistente in anagrafica`);
  }

  assertItemCoreReady(it);
  return it;
}

/* ---------------- GET /orders ---------------- */

router.get("/", async (_req, res) => {
  try {
    const orders = await listOrders();
    const normalized = await Promise.all(orders.map(normalizeOrder));
    return res.json(normalized);
  } catch (err: any) {
    return res.status(500).json({
      error: String(err?.message ?? err),
    });
  }
});

/* ---------------- GET /orders/:id ---------------- */

router.get("/:id", async (req, res) => {
  try {
    const ord = await getOrderById(req.params.id);

    if (!ord) {
      return res.status(404).json({ error: `Ordine ${req.params.id} non trovato` });
    }

    return res.json(await normalizeOrder(ord));
  } catch (err: any) {
    return res.status(500).json({
      error: String(err?.message ?? err),
    });
  }
});

/* ---------------- POST /orders ---------------- */

router.post("/", async (req, res) => {
  const parsed = CreateOrderSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation error",
      details: parsed.error.format(),
    });
  }

  const data = parsed.data;

  if (hasDuplicateSkus(data.lines)) {
    return res
      .status(400)
      .json({ error: "Sono presenti SKU duplicati nello stesso ordine" });
  }

  try {
    for (const line of data.lines) {
      await ensureSkuReady(line.sku);
    }

    const newOrder = await normalizeOrder({
      orderId: `ord_${randomUUID()}`,
      supplier: data.supplier,
      status: "DRAFT",
      createdAt: new Date().toISOString(),
      sentAt: null,
      receivedAt: null,
      notes: data.notes ?? null,
      lines: data.lines.map((l) => ({
        sku: l.sku,
        qtyOrderedConf: l.qtyOrderedConf,
        qtyReceivedConf: 0,
      })),
    });

    const created = await createOrderDb(newOrder);
    return res.status(201).json(await normalizeOrder(created));
  } catch (err: any) {
    return res.status(400).json({
      error: String(err?.message ?? err),
    });
  }
});

/* ---------------- PATCH /orders/:id ---------------- */

router.patch("/:id", async (req, res) => {
  const parsed = UpdateOrderSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation error",
      details: parsed.error.format(),
    });
  }

  try {
    const current = await getOrderById(req.params.id);

    if (!current) {
      return res.status(404).json({ error: `Ordine ${req.params.id} non trovato` });
    }

    if (current.status !== "DRAFT") {
      return res.status(400).json({
        error: "Si possono modificare solo ordini in stato DRAFT",
      });
    }

    const next = parsed.data;

    if (Array.isArray(next.lines)) {
      if (hasDuplicateSkus(next.lines)) {
        return res
          .status(400)
          .json({ error: "Sono presenti SKU duplicati nello stesso ordine" });
      }

      for (const line of next.lines) {
        await ensureSkuReady(line.sku);
      }
    }

    const merged = await normalizeOrder({
      ...current,
      supplier: next.supplier ?? current.supplier,
      notes: next.notes ?? current.notes,
      lines: Array.isArray(next.lines)
        ? next.lines.map((l) => ({
            sku: l.sku,
            qtyOrderedConf: l.qtyOrderedConf,
            qtyReceivedConf: 0,
          }))
        : current.lines,
    });

    const updated = await updateOrderDb(merged);
    return res.json(await normalizeOrder(updated));
  } catch (err: any) {
    return res.status(400).json({
      error: String(err?.message ?? err),
    });
  }
});

/* ---------------- POST /orders/:id/send ---------------- */

router.post("/:id/send", async (req, res) => {
  try {
    const ord = await getOrderById(req.params.id);

    if (!ord) {
      return res.status(404).json({ error: `Ordine ${req.params.id} non trovato` });
    }

    if (ord.status !== "DRAFT") {
      return res
        .status(400)
        .json({ error: "Solo un ordine DRAFT può essere inviato" });
    }

    if (!ord.lines.length) {
      return res
        .status(400)
        .json({ error: "Impossibile inviare un ordine senza righe" });
    }

    ord.status = "SENT";
    ord.sentAt = ord.sentAt ?? new Date().toISOString();

    const updated = await updateOrderDb(await normalizeOrder(ord));
    return res.json(await normalizeOrder(updated));
  } catch (err: any) {
    return res.status(500).json({
      error: String(err?.message ?? err),
    });
  }
});

/* ---------------- POST /orders/:id/receive ---------------- */

router.post("/:id/receive", async (req, res) => {
  const parsed = ReceiveOrderSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation error",
      details: parsed.error.format(),
    });
  }

  try {
    const ord = await getOrderById(req.params.id);

    if (!ord) {
      return res.status(404).json({ error: `Ordine ${req.params.id} non trovato` });
    }

    if (!["SENT", "PARTIAL"].includes(ord.status)) {
      return res.status(400).json({
        error: `Ordine ${req.params.id} non ricevibile nello stato ${ord.status}`,
      });
    }

    const note = parsed.data.note ?? null;
    const bySku = new Map(ord.lines.map((l) => [l.sku, l]));
    const newMovements: Movement[] = [];

    for (const r of parsed.data.lines) {
      const line = bySku.get(r.sku);

      if (!line) {
        return res.status(400).json({ error: `SKU ${r.sku} non presente nell'ordine` });
      }

      await ensureSkuReady(r.sku);

      const nextReceived = line.qtyReceivedConf + r.qtyReceivedNowConf;

      if (nextReceived > line.qtyOrderedConf) {
        return res.status(400).json({
          error: `SKU ${r.sku}: ricezione oltre ordinato`,
          orderedConf: line.qtyOrderedConf,
          receivedConf: line.qtyReceivedConf,
          tryingConf: nextReceived,
        });
      }

      line.qtyReceivedConf = nextReceived;

      const qtyBt = await confToBt(r.sku, r.qtyReceivedNowConf);

      const mv: Movement = {
        id: randomUUID(),
        sku: r.sku,
        quantity: qtyBt,
        type: "IN",
        reason: "RICEZIONE_ORDINE",
        date: new Date().toISOString(),
        note: note ? `ORD:${req.params.id} | ${note}` : `ORD:${req.params.id}`,
      };

      newMovements.push(mv);
    }

    const allReceived = ord.lines.every(
      (l) => l.qtyReceivedConf >= l.qtyOrderedConf
    );

    ord.status = allReceived ? "RECEIVED" : "PARTIAL";
    ord.receivedAt = allReceived ? new Date().toISOString() : ord.receivedAt ?? null;

    const updated = await updateOrderDb(await normalizeOrder(ord));
    await insertManyMovements(newMovements);

    return res.json(await normalizeOrder(updated));
  } catch (err: any) {
    return res.status(400).json({
      error: String(err?.message ?? err),
    });
  }
});

/* ---------------- POST /orders/:id/cancel ---------------- */

router.post("/:id/cancel", async (req, res) => {
  try {
    const ord = await getOrderById(req.params.id);

    if (!ord) {
      return res.status(404).json({ error: `Ordine ${req.params.id} non trovato` });
    }

    if (ord.status === "RECEIVED" || ord.status === "PARTIAL") {
      return res.status(400).json({
        error: "Non puoi annullare un ordine già ricevuto o parzialmente ricevuto",
      });
    }

    ord.status = "CANCELLED";

    const updated = await updateOrderDb(await normalizeOrder(ord));
    return res.json(await normalizeOrder(updated));
  } catch (err: any) {
    return res.status(500).json({
      error: String(err?.message ?? err),
    });
  }
});

/* ---------------- DELETE /orders/:id ---------------- */

router.delete("/:id", async (req, res) => {
  try {
    const ord = await getOrderById(req.params.id);

    if (!ord) {
      return res.status(404).json({ error: `Ordine ${req.params.id} non trovato` });
    }

    if (ord.status !== "DRAFT") {
      return res.status(400).json({
        error: "Si possono eliminare solo ordini in stato DRAFT",
      });
    }

    await deleteOrderDb(req.params.id);

    return res.json({ ok: true, deletedOrderId: req.params.id });
  } catch (err: any) {
    return res.status(500).json({
      error: String(err?.message ?? err),
    });
  }
});

export default router;
