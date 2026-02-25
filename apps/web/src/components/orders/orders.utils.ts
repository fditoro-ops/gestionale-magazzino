// src/components/orders/orders.utils.ts
import type { Order, OrderLine, OrdersFilters, OrderStatus } from "./orders.types";

// Usa unknown invece di any, e normalizza sempre a stringa
export function safeUpper(s: unknown) {
  return String(s ?? "").toUpperCase().trim();
}

export function formatDateTime(iso: string) {
  try {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  } catch {
    return iso;
  }
}

export function getRemaining(line: OrderLine) {
  const ordered = Number(line.qtyOrderedPz ?? 0);
  const received = Number(line.qtyReceivedPz ?? 0);
  const rem = ordered - received;
  return rem > 0 ? rem : 0;
}

export function statusLabel(s: OrderStatus) {
  return s;
}

export function statusTone(s: OrderStatus): "ok" | "warn" | "info" | "muted" {
  if (s === "RECEIVED") return "ok";
  if (s === "PARTIAL") return "warn";
  if (s === "SENT") return "info";
  return "muted"; // DRAFT (o default)
}

export function applyOrdersFilters(orders: Order[], f: OrdersFilters) {
  let out = [...orders];

  const q = safeUpper(f.q);
  if (q) {
    out = out.filter((o) => {
      if (safeUpper(o.orderId).includes(q)) return true;
      if (safeUpper(o.supplier).includes(q)) return true;
      if (safeUpper(o.status).includes(q)) return true;

      // ✅ tipizza l per evitare implicit any
      if (o.lines?.some((l: OrderLine) => safeUpper(l.sku).includes(q))) return true;

      return false;
    });
  }

  if (f.supplier !== "ALL") out = out.filter((o) => o.supplier === f.supplier);
  if (f.status !== "ALL") out = out.filter((o) => o.status === f.status);

  if (f.dateFrom) {
    const from = new Date(`${f.dateFrom}T00:00:00`);
    out = out.filter((o) => new Date(o.createdAt) >= from);
  }
  if (f.dateTo) {
    const to = new Date(`${f.dateTo}T23:59:59`);
    out = out.filter((o) => new Date(o.createdAt) <= to);
  }

  // Ordine: più recenti in alto
  out.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  return out;
}

export function calcKpis(orders: Order[]) {
  const total = orders.length;
  const drafts = orders.filter((o) => o.status === "DRAFT").length;
  const received = orders.filter((o) => o.status === "RECEIVED").length;
  const pending = total - received;

  // “righe” = somma righe ordini
  const lines = orders.reduce((sum, o) => sum + (o.lines?.length ?? 0), 0);

  return { total, drafts, received, pending, lines };
}
