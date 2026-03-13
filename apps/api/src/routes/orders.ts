import { Router } from "express";
import { randomUUID } from "crypto";

console.log("✅ ORDERS ROUTER FILE LOADED");

import { orders as defaultOrders } from "../data/orders.js";
import type { Order } from "../data/orders.store.js";
import { loadOrders, saveOrders } from "../data/orders.store.js";

import {
  CreateOrderSchema,
  UpdateOrderSchema,
  ReceiveOrderSchema,
} from "../schemas/order.schema.js";

import { getItemBySku } from "../services/items.service.js";

import type { Movement } from "../types/movement.js";
import { insertManyMovements } from "../data/movements.store.js";

const router = Router();

router.get("/_ping", (_req, res) => {
  res.json({ ok: true, route: "/orders/_ping" });
});

router.get("/_debug", (_req, res) => {
  res.json({
    ok: true,
    ordersCount: Array.isArray(orders) ? orders.length : -1,
    sample: Array.isArray(orders) ? orders.slice(0, 3) : [],
  });
});

function getPackSizeForSku(sku: string): number {
  const it = getItemBySku(sku);
  const p = Number(it?.packSize ?? 1);
  return Number.isFinite(p) && p > 0 ? Math.floor(p) : 1;
}

function confToBt(sku: string, qtyConf: number): number {
  return qtyConf * getPackSizeForSku(sku);
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

/* ---------------- IN-MEMORY + PERSISTED ---------------- */

let orders: Order[] = loadOrders(defaultOrders as any).map(normalizeOrder);
saveOrders(orders);

/* ---------------- NORMALIZE (retro-compat) ---------------- */

function normalizeOrder(o: any): Order {
  const lines = Array.isArray(o?.lines) ? o.lines : [];

  return {
    orderId: (o?.orderId ?? `ord_${randomUUID()}`).toString(),
    supplier: (o?.supplier ?? "VARI").toString().toUpperCase() as any,
    status: (o?.status ?? "DRAFT").toString().toUpperCase() as any,
    createdAt: o?.createdAt ?? new Date().toISOString(),
    sentAt: o?.sentAt ?? null,
    receivedAt: o?.receivedAt ?? null,
    notes: o?.notes ?? null,

    lines: lines.map((l: any) => {
      const sku = (l?.sku ?? "").toString().toUpperCase().trim();

      const qtyOrderedConf =
        l?.qtyOrderedConf != null
          ? Number(l.qtyOrderedConf)
          : l?.qtyOrderedPz != null
            ? Math.ceil(Number(l.qtyOrderedPz) / getPackSizeForSku(sku))
            : 0;

      const qtyReceivedConf =
        l?.qtyReceivedConf != null
          ? Number(l.qtyReceivedConf)
          : l?.qtyReceivedPz != null
            ? Math.floor(Number(l.qtyReceivedPz) / getPackSizeForSku(sku))
            : 0;

      return {
        sku,
        qtyOrderedConf: Number.isFinite(qtyOrderedConf) ? qtyOrderedConf : 0,
        qtyReceivedConf: Number.isFinite(qtyReceivedConf) ? qtyReceivedConf : 0,
      };
    }),
  } as Order;
}

/* ---------------- GET /orders ---------------- */

router.get("/", (_req, res) => {
  return res.json(orders);
});

/* ---------------- GET /orders/:id ---------------- */

router.get("/:id", (req, res) => {
  const ord = orders.find((o) => o.orderId === req.params.id);

  if (!ord) {
    return res.status(404).json({ error: `Ordine ${req.params.id} non trovato` });
  }

  return res.json(ord);
});

/* ---------------- POST /orders ---------------- */

router.post("/", (req, res) => {
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

  for (const line of data.lines) {
    const it = getItemBySku(line.sku);

    if (!it) {
      return res
        .status(400)
        .json({ error: `SKU ${line.sku} non esistente in anagrafica` });
    }

    if (it.active === false) {
      return res.status(400).json({ error: `SKU ${line.sku} è disattivato` });
    }
  }

  const newOrder = normalizeOrder({
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

  orders.push(newOrder);
  saveOrders(orders);

  return res.status(201).json(newOrder);
});

/* ---------------- PATCH /orders/:id ---------------- */
/* modifica solo ordini DRAFT */
/* non consente di cambiare status o qtyReceivedConf */

router.patch("/:id", (req, res) => {
  const parsed = UpdateOrderSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation error",
      details: parsed.error.format(),
    });
  }

  const idx = orders.findIndex((o) => o.orderId === req.params.id);

  if (idx === -1) {
    return res.status(404).json({ error: `Ordine ${req.params.id} non trovato` });
  }

  const current = orders[idx];

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
      const it = getItemBySku(line.sku);

      if (!it) {
        return res
          .status(400)
          .json({ error: `SKU ${line.sku} non esistente in anagrafica` });
      }

      if (it.active === false) {
        return res.status(400).json({ error: `SKU ${line.sku} è disattivato` });
      }
    }
  }

  const merged = normalizeOrder({
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

  orders[idx] = merged;
  saveOrders(orders);

  return res.json(orders[idx]);
});

/* ---------------- POST /orders/:id/send ---------------- */

router.post("/:id/send", (req, res) => {
  const idx = orders.findIndex((o) => o.orderId === req.params.id);

  if (idx === -1) {
    return res.status(404).json({ error: `Ordine ${req.params.id} non trovato` });
  }

  const ord = orders[idx];

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

  orders[idx] = normalizeOrder(ord);
  saveOrders(orders);

  return res.json(orders[idx]);
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

  const idx = orders.findIndex((o) => o.orderId === req.params.id);

  if (idx === -1) {
    return res.status(404).json({ error: `Ordine ${req.params.id} non trovato` });
  }

  const ord = orders[idx];

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

    const it = getItemBySku(r.sku);

    if (!it) {
      return res
        .status(400)
        .json({ error: `SKU ${r.sku} non esistente in anagrafica` });
    }

    if (it.active === false) {
      return res.status(400).json({ error: `SKU ${r.sku} è disattivato` });
    }

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

    const qtyBt = confToBt(r.sku, r.qtyReceivedNowConf);

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

  orders[idx] = normalizeOrder(ord);

  saveOrders(orders);
  await insertManyMovements(newMovements);

  return res.json(orders[idx]);
});

/* ---------------- POST /orders/:id/cancel ---------------- */

router.post("/:id/cancel", (req, res) => {
  const idx = orders.findIndex((o) => o.orderId === req.params.id);

  if (idx === -1) {
    return res.status(404).json({ error: `Ordine ${req.params.id} non trovato` });
  }

  const ord = orders[idx];

  if (ord.status === "RECEIVED" || ord.status === "PARTIAL") {
    return res.status(400).json({
      error: "Non puoi annullare un ordine già ricevuto o parzialmente ricevuto",
    });
  }

  ord.status = "CANCELLED";

  orders[idx] = normalizeOrder(ord);
  saveOrders(orders);

  return res.json(orders[idx]);
});

/* ---------------- DELETE /orders/:id ---------------- */

router.delete("/:id", (req, res) => {
  const idx = orders.findIndex((o) => o.orderId === req.params.id);

  if (idx === -1) {
    return res.status(404).json({ error: `Ordine ${req.params.id} non trovato` });
  }

  const ord = orders[idx];

  if (ord.status !== "DRAFT") {
    return res.status(400).json({
      error: "Si possono eliminare solo ordini in stato DRAFT",
    });
  }

  orders.splice(idx, 1);
  saveOrders(orders);

  return res.json({ ok: true, deletedOrderId: req.params.id });
});

export default router;
