import React, { useMemo, useState } from "react";
import type { Order, OrderLine, OrderStatus } from "./orders/orders.types";

type ItemLite = { sku: string; name: string; supplier?: string | null };

function normalizeSku(s: string) {
  return String(s ?? "").toUpperCase().trim();
}

function computeStatus(lines: Array<{ qtyOrderedPz?: number | null; qtyReceivedPz?: number | null }>): OrderStatus {
  const ordered = lines.reduce((s, l) => s + Number(l.qtyOrderedPz ?? 0), 0);
  const received = lines.reduce((s, l) => s + Number(l.qtyReceivedPz ?? 0), 0);

  // Se non è stato ricevuto nulla, siamo almeno "SENT"
  if (received <= 0) return "SENT";
  if (received < ordered) return "PARTIAL";
  return "RECEIVED";
}

export default function OrderDetail(props: {
  order: Order;
  items: ItemLite[];
  onBack: () => void;
  onUpdate: (patch: Partial<Order>) => void;
}) {
  const { order, items, onBack, onUpdate } = props;

  const [notes, setNotes] = useState<string>(order.notes ?? "");

  // Draft input ricevuto per SKU (stringa per gestire input vuoto)
  const [receivedDraft, setReceivedDraft] = useState<Record<string, string>>(() => {
    const entries = (order.lines ?? []).map((l: OrderLine) => {
      const sku = normalizeSku(l.sku);
      const v = l.qtyReceivedPz ?? 0;
      return [sku, String(v)];
    });
    return Object.fromEntries(entries);
  });

  const nameBySku = useMemo(() => {
    return Object.fromEntries((items ?? []).map((it) => [normalizeSku(it.sku), it.name ?? ""]));
  }, [items]);

  function saveNotes() {
    onUpdate({ notes: notes.trim() || null });
  }

  function markSent() {
    if (order.status !== "DRAFT") return;
    onUpdate({ status: "SENT" });
  }

  function applyReceived() {
    const nextLines: OrderLine[] = (order.lines ?? []).map((l: OrderLine) => {
      const skuN = normalizeSku(l.sku);
      const raw = receivedDraft[skuN] ?? "";
      const n = Number(String(raw).replace(",", "."));
      const qtyReceivedPz = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;

      return {
        ...l,
        qtyReceivedPz,
      };
    });

    const nextStatus: OrderStatus =
      order.status === "DRAFT" ? "DRAFT" : computeStatus(nextLines);

    onUpdate({
      lines: nextLines,
      status: nextStatus,
    });
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{order.orderId}</div>
          <div style={{ fontSize: 12, color: "#667" }}>
            {order.supplier} • creato {new Date(order.createdAt).toLocaleString()} • stato <b>{order.status}</b>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button style={btnGhost} onClick={onBack}>
            Indietro
          </button>
          <button style={btnPrimary} onClick={markSent} disabled={order.status !== "DRAFT"}>
            Segna “Inviato”
          </button>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12, color: "#667", marginBottom: 6 }}>Note</div>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={inp}
            placeholder="Note ordine..."
          />
          <button style={btnGhost} onClick={saveNotes}>
            Salva note
          </button>
        </div>
      </div>

      <div style={{ borderTop: "1px solid #eef2f7", paddingTop: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Righe</div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f9fafb" }}>
              <th style={th}>SKU</th>
              <th style={th}>Articolo</th>
              <th style={{ ...th, textAlign: "right" }}>Ordinato (PZ)</th>
              <th style={{ ...th, textAlign: "right" }}>Ricevuto (PZ)</th>
            </tr>
          </thead>
          <tbody>
            {(order.lines ?? []).map((l: OrderLine) => {
              const skuN = normalizeSku(l.sku);
              const name = nameBySku[skuN] ?? "";
              const ordered = Number(l.qtyOrderedPz ?? 0);

              const receivedValue = receivedDraft[skuN] ?? "0";

              return (
                <tr key={skuN} style={{ borderTop: "1px solid #eef2f7" }}>
                  <td style={td}>{l.sku}</td>
                  <td style={td}>{name}</td>
                  <td style={{ ...td, textAlign: "right" }}>{ordered}</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <input
                      style={{ ...inp, maxWidth: 120, textAlign: "right" }}
                      value={receivedValue}
                      onChange={(e) =>
                        setReceivedDraft((prev) => ({
                          ...prev,
                          [skuN]: e.target.value,
                        }))
                      }
                      inputMode="numeric"
                      disabled={order.status === "DRAFT"}
                      title={order.status === "DRAFT" ? "Prima segna Inviato" : ""}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
          <button
            style={btnPrimary}
            onClick={applyReceived}
            disabled={order.status === "DRAFT"}
            title={order.status === "DRAFT" ? "Prima segna Inviato" : ""}
          >
            Salva ricezione
          </button>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "#667" }}>
        Nota: quando mettiamo il backend, “Salva ricezione” creerà i movimenti <b>IN</b> automaticamente.
      </div>
    </div>
  );
}

const inp: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #d6dbe6",
  background: "white",
  outline: "none",
  fontSize: 14,
  width: "100%",
};

const btnGhost: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #d6dbe6",
  background: "white",
  cursor: "pointer",
  fontWeight: 800,
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "none",
  background: "#0B7285",
  color: "white",
  cursor: "pointer",
  fontWeight: 900,
};

const th: React.CSSProperties = {
  padding: "10px 10px",
  textAlign: "left",
  fontSize: 12,
  color: "#667",
};

const td: React.CSSProperties = { padding: "10px 10px", fontSize: 14 };
