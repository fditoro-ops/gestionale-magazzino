import React, { useMemo, useState } from "react";
import type { Order } from "./OrdersTable";

type OrderLine = {
  sku: string;
  qtyOrderedPz: number;
  qtyReceivedPz: number;
};

export default function OrderDrawer({
  open,
  order,
  items,
  loading,
  onClose,
  onReceiveSelected,
  onReceiveAll,
}: {
  open: boolean;
  order: Order | null;
  items: any[];
  loading: boolean;
  onClose: () => void;
  onReceiveSelected: (order: Order, payload: { lines: Array<{ sku: string; qtyReceivedNowPz: number }>; note?: string }) => void;
  onReceiveAll: (order: Order, payload: { lines: Array<{ sku: string; qtyReceivedNowPz: number }>; note?: string }) => void;
}) {
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState<Record<string, number>>({});

  const itemsBySku = useMemo(() => {
    const arr = Array.isArray(items) ? items : [];
    return Object.fromEntries(arr.map((it: any) => [String(it.sku || "").toUpperCase(), it])) as Record<string, any>;
  }, [items]);

  if (!open) return null;

  const o = order;
  const isClosed = o?.status === "RECEIVED";

  function remaining(l: OrderLine) {
    const r = (l.qtyOrderedPz ?? 0) - (l.qtyReceivedPz ?? 0);
    return r > 0 ? r : 0;
  }

  function buildSelectedPayload() {
    if (!o) return null;
    const lines = (o.lines || [])
      .map((l) => {
        const rem = remaining(l);
        const wanted = Number(draft[l.sku] ?? 0);
        const qty = Math.max(0, Math.min(wanted, rem));
        return qty > 0 ? { sku: l.sku, qtyReceivedNowPz: qty } : null;
      })
      .filter(Boolean) as Array<{ sku: string; qtyReceivedNowPz: number }>;

    if (!lines.length) return null;
    const payload: any = { lines };
    const n = note.trim();
    if (n) payload.note = n;
    return payload;
  }

  function buildAllPayload() {
    if (!o) return null;
    const lines = (o.lines || [])
      .filter((l) => l.qtyReceivedPz < l.qtyOrderedPz)
      .map((l) => ({
        sku: l.sku,
        qtyReceivedNowPz: (l.qtyOrderedPz ?? 0) - (l.qtyReceivedPz ?? 0),
      }));

    if (!lines.length) return null;
    const payload: any = { lines };
    const n = note.trim();
    if (n) payload.note = n;
    return payload;
  }

  return (
    <div style={overlay} onMouseDown={onClose}>
      <div style={panel} onMouseDown={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={panelHeader}>
          <div style={{ display: "grid", gap: 2 }}>
            <div style={{ fontWeight: 1000, fontSize: 16 }}>{o?.orderId ?? "Ordine"}</div>
            <div style={{ fontSize: 12, color: "#667" }}>
              {o ? `${o.supplier} • ${new Date(o.createdAt).toLocaleString()} • ${o.status}` : ""}
            </div>
          </div>

          <button onClick={onClose} style={btnGhost} title="Chiudi">
            ✕
          </button>
        </div>

        {!o ? (
          <div style={{ padding: 14, color: "#667" }}>Nessun ordine selezionato.</div>
        ) : (
          <div style={{ padding: 14, display: "grid", gap: 12 }}>
            {o.notes && (
              <div style={{ fontSize: 13, color: "#334", opacity: 0.9 }}>
                <b>Note:</b> {o.notes}
              </div>
            )}

            {!isClosed && (
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note ricezione (opzionali, finiscono nei movimenti)"
                style={inp}
              />
            )}

            {/* Lines */}
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", background: "white" }}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    <Th>SKU</Th>
                    <Th>Articolo</Th>
                    <Th style={{ textAlign: "right" }}>Ordinato</Th>
                    <Th style={{ textAlign: "right" }}>Ricevuto</Th>
                    <Th style={{ textAlign: "right" }}>Rimanenza</Th>
                    <Th style={{ textAlign: "right" }}>Ricevi ora</Th>
                  </tr>
                </thead>

                <tbody>
                  {o.lines.map((l) => {
                    const rem = remaining(l);
                    const it = itemsBySku[l.sku?.toUpperCase()];
                    const label = it?.name ? String(it.name) : "";
                    const current = Number(draft[l.sku] ?? 0);

                    return (
                      <tr key={l.sku} style={{ borderTop: "1px solid #eef2f7" }}>
                        <Td>
                          <span style={{ fontWeight: 900 }}>{l.sku}</span>
                        </Td>
                        <Td style={{ color: "#334" }}>{label}</Td>
                        <Td style={{ textAlign: "right" }}>{l.qtyOrderedPz}</Td>
                        <Td style={{ textAlign: "right" }}>{l.qtyReceivedPz}</Td>
                        <Td style={{ textAlign: "right", fontWeight: 900 }}>{rem}</Td>
                        <Td style={{ textAlign: "right" }}>
                          {isClosed ? (
                            <span style={{ color: "#667", fontSize: 12 }}>—</span>
                          ) : (
                            <input
                              type="number"
                              min={0}
                              max={rem}
                              value={current}
                              onChange={(e) =>
                                setDraft((prev) => ({ ...prev, [l.sku]: Number(e.target.value) }))
                              }
                              style={{ ...inp, width: 110, textAlign: "right" }}
                              disabled={loading || rem === 0}
                            />
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Actions */}
            {!isClosed && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={() => {
                    const payload = buildSelectedPayload();
                    if (!payload) return;
                    onReceiveSelected(o, payload);
                  }}
                  disabled={loading}
                  style={btnPrimary}
                >
                  Ricevi selezionati
                </button>

                <button
                  onClick={() => {
                    const payload = buildAllPayload();
                    if (!payload) return;
                    onReceiveAll(o, payload);
                  }}
                  disabled={loading}
                  style={btnGhost}
                >
                  Ricevi tutto
                </button>

                <button
                  onClick={() => setDraft({})}
                  disabled={loading}
                  style={btnGhost}
                >
                  Reset campi
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- UI Bits ---------- */

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th
      style={{
        padding: "10px 12px",
        textAlign: "left",
        fontSize: 12,
        color: "#667",
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <td
      style={{
        padding: "10px 12px",
        fontSize: 14,
        ...style,
      }}
    >
      {children}
    </td>
  );
}

/* ---------- Styles ---------- */

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.35)",
  display: "flex",
  justifyContent: "flex-end",
  zIndex: 50,
};

const panel: React.CSSProperties = {
  width: "min(720px, 92vw)",
  height: "100%",
  background: "#F7FAFC",
  borderLeft: "1px solid #D9E2EC",
  boxShadow: "-12px 0 30px rgba(0,0,0,0.18)",
  display: "flex",
  flexDirection: "column",
};

const panelHeader: React.CSSProperties = {
  padding: 14,
  background: "white",
  borderBottom: "1px solid #D9E2EC",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const inp: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid #d6dbe6",
  background: "white",
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #0B7285",
  background: "#0B7285",
  color: "white",
  cursor: "pointer",
  fontWeight: 900,
  width: "fit-content",
};

const btnGhost: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #d6dbe6",
  background: "white",
  cursor: "pointer",
  fontWeight: 900,
  width: "fit-content",
};
