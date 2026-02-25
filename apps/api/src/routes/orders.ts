import { Router } from "express";
import { randomUUID } from "crypto";

import { orders as defaultOrders } from "../data/orders.js";
import type { Order } from "../data/orders.store.js";
import { loadOrders, saveOrders } from "../data/orders.store.js";

import {
  CreateOrderSchema,
  UpdateOrderSchema,
  ReceiveOrderSchema,
} from "../schemas/order.schema.js";

import { getItemBySku } from "../services/items.service.js";

// Per scrivere movimenti IN quando ricevi
import type { Movement } from "../types/movement.js";
import { movements } from "../data/movements.js";
import { saveMovements } from "../data/movements.store.js";

const router = Router();

function getPackSizeForSku(sku: string): number {
  const it = getItemBySku(sku);
  const p = Number(it?.packSize ?? 1);
  return Number.isFinite(p) && p > 0 ? Math.floor(p) : 1;
}

function confToBt(sku: string, qtyConf: number): number {
  return qtyConf * getPackSizeForSku(sku);
}

/* ---------------- IN-MEMORY + PERSISTED ---------------- */

let orders: Order[] = loadOrders(defaultOrders as any);

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

    // ✅ retro-compat: se arrivano PZ li trasformiamo in CONF usando packSize (arrotondo su)
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

orders = orders.map(normalizeOrder);
saveOrders(orders);

/* ---------------- GET /orders ---------------- */

router.get("/", (_req, res) => {
  res.json(orders);
});

/* ---------------- GET /orders/:id ---------------- */

router.get("/:id", (req, res) => {
  const id = req.params.id;
  const ord = orders.find((o) => o.orderId === id);
  if (!ord) return res.status(404).json({ error: `Ordine ${id} non trovato` });
  return res.json(ord);
});

/* ---------------- POST /orders ---------------- */

router.post("/", (req, res) => {
  const parsed = CreateOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Validation error", details: parsed.error.format() });
  }

  const data = parsed.data;

  // Validazione SKU esistenti + attivi
  for (const line of data.lines) {
    const it = getItemBySku(line.sku);
    if (!it)
      return res
        .status(400)
        .json({ error: `SKU ${line.sku} non esistente in anagrafica` });
    if (it.active === false)
      return res.status(400).json({ error: `SKU ${line.sku} è disattivato` });
  }

  const newOrder = normalizeOrder({
    orderId: `ord_${randomUUID()}`,
    supplier: data.supplier,
    status: "DRAFT",
    createdAt: new Date().toISOString(),
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

router.patch("/:id", (req, res) => {
  const parsed = UpdateOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Validation error", details: parsed.error.format() });
  }

  const id = req.params.id;
  const idx = orders.findIndex((o) => o.orderId === id);
  if (idx === -1) return res.status(404).json({ error: `Ordine ${id} non trovato` });

  const next = parsed.data;

  // Se aggiornano lines: validiamo SKU + received<=ordered
  if (Array.isArray(next.lines)) {
    for (const line of next.lines) {
      const it = getItemBySku(line.sku);
      if (!it) return res.status(400).json({ error: `SKU ${line.sku} non esistente in anagrafica` });
      if (it.active === false) return res.status(400).json({ error: `SKU ${line.sku} è disattivato` });
      if (line.qtyReceivedConf > line.qtyOrderedConf) {
  return res.status(400).json({ error: `SKU ${line.sku}: qtyReceivedConf non può superare qtyOrderedConf` });
}

    }
  }

  const merged = normalizeOrder({ ...orders[idx], ...next });

  if (merged.status === "SENT" && !merged.sentAt) merged.sentAt = new Date().toISOString();

  orders[idx] = merged;
  saveOrders(orders);

  return res.json(orders[idx]);
});

/* ---------------- POST /orders/:id/receive ---------------- */

router.post("/:id/receive", (req, res) => {
  const parsed = ReceiveOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Validation error", details: parsed.error.format() });
  }

  const id = req.params.id;
  const idx = orders.findIndex((o) => o.orderId === id);
  if (idx === -1) return res.status(404).json({ error: `Ordine ${id} non trovato` });

  const ord = orders[idx];

  if (ord.status === "RECEIVED") {
    return res.status(400).json({ error: `Ordine ${id} già ricevuto` });
  }

  const note = parsed.data.note ?? null;
  const bySku = new Map(ord.lines.map((l) => [l.sku, l]));

  for (const r of parsed.data.lines) {
    const line = bySku.get(r.sku);
    if (!line) return res.status(400).json({ error: `SKU ${r.sku} non presente nell'ordine` });

    const it = getItemBySku(r.sku);
    if (!it) return res.status(400).json({ error: `SKU ${r.sku} non esistente in anagrafica` });
    if (it.active === false) return res.status(400).json({ error: `SKU ${r.sku} è disattivato` });

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

// ✅ MOVIMENTO IN in BT
const qtyBt = confToBt(r.sku, r.qtyReceivedNowConf);

const mv: Movement = {
  id: randomUUID(),
  sku: r.sku,
  quantity: qtyBt,          // ✅ BT
  type: "IN",
  reason: "RICEZIONE_ORDINE",
  date: new Date().toISOString(),
  note: note ? `ORD:${id} | ${note}` : `ORD:${id}`,
};

movements.push(mv);

  }

 const allReceived = ord.lines.every((l) => l.qtyReceivedConf >= l.qtyOrderedConf);
ord.status = allReceived ? "RECEIVED" : "PARTIAL";

  ord.receivedAt = allReceived ? new Date().toISOString() : ord.receivedAt ?? null;

  orders[idx] = normalizeOrder(ord);

  saveOrders(orders);
  saveMovements(movements);

  return res.json(orders[idx]);
});

export default router;

