import { useEffect, useMemo, useState } from "react";
import OrdersTable, { type Order } from "./orders/OrdersTable";
import OrderDrawer from "./orders/OrderDrawer";

/* ---------------- TYPES ---------------- */

type Supplier = "DORECA" | "ALPORI" | "VARI";

export default function OrdersPage({
  items,
  onReload,
}: {
  items: any[];
  onReload: () => void;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // NEW ORDER (draft) -> UI in PACK
  const [supplier, setSupplier] = useState<Supplier>("DORECA");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Array<{ sku: string; qtyPack: number }>>([
    { sku: "", qtyPack: 1 },
  ]);

  // Drawer
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  const openOrder = useMemo(() => {
    if (!openOrderId) return null;
    return orders.find((o) => o.orderId === openOrderId) ?? null;
  }, [orders, openOrderId]);

  // packSizeBySku: serve per convertire PACK -> PZ
  const packSizeBySku = useMemo(() => {
    const arr = Array.isArray(items) ? items : [];
    return Object.fromEntries(
      arr.map((it: any) => [
        String(it.sku || "").toUpperCase().trim(),
        it.packSize ?? null,
      ])
    ) as Record<string, number | null>;
  }, [items]);

  /* ---------------- LOAD ORDERS ---------------- */

  async function loadOrders() {
    try {
      const r = await fetch("http://localhost:3001/orders");
      const data = await r.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch {
      setOrders([]);
    }
  }

  useEffect(() => {
    loadOrders();
  }, []);

  /* ---------------- CREATE ORDER ---------------- */

  async function createOrder() {
    setErr(null);

    let payload: any;

    try {
      payload = {
        supplier,
        notes: notes.trim() ? notes.trim() : null,
        lines: lines
          .filter((l) => l.sku && l.qtyPack > 0)
          .map((l) => {
            const sku = l.sku.toUpperCase().trim();
            const packSize = Number(packSizeBySku[sku] ?? 0);

            if (!Number.isFinite(packSize) || packSize <= 0) {
              throw new Error(`SKU ${sku}: packSize mancante in anagrafica`);
            }

            return {
              sku,
              qtyOrderedConf: l.qtyPack, // ✅ PACK → PZ
            };
          }),
      };
    } catch (e: any) {
      setErr(e?.message || "Errore: dati ordine non validi");
      return;
    }

    if (!payload.lines.length) {
      setErr("Inserisci almeno una riga ordine valida");
      return;
    }

    setLoading(true);
    try {
      const r = await fetch("http://localhost:3001/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        const j = await safeJson(r);
        throw new Error(j?.error || "Errore creazione ordine");
      }

      setNotes("");
      setLines([{ sku: "", qtyPack: 1 }]);
      await loadOrders();
      onReload();
    } catch (e: any) {
      setErr(e?.message || "Errore creazione ordine");
    } finally {
      setLoading(false);
    }
  }

  /* ---------------- RECEIVE (delegated from Drawer) ---------------- */

  async function postReceive(
    order: Order,
    payload: { lines: Array<{ sku: string; qtyReceivedNowPz: number }>; note?: string }
  ) {
    setErr(null);
    setLoading(true);
    try {
      const r = await fetch(
        `http://localhost:3001/orders/${order.orderId}/receive`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!r.ok) {
        const j = await safeJson(r);
        throw new Error(j?.error || "Errore ricezione ordine");
      }

      await loadOrders();
      onReload(); // movimenti + stock
    } catch (e: any) {
      setErr(e?.message || "Errore ricezione ordine");
    } finally {
      setLoading(false);
    }
  }

  /* ---------------- UI ---------------- */

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h2 style={{ margin: 0 }}>Ordini</h2>
          <span style={{ fontSize: 12, color: "#667" }}>
            {orders.length} ordini
          </span>
        </div>
      </div>

      {err && <div style={{ color: "red" }}>{err}</div>}

      {/* -------- NEW ORDER -------- */}
      <div style={card}>
        <strong>Nuovo ordine</strong>

        <div style={grid}>
          <select
            value={supplier}
            onChange={(e) => setSupplier(e.target.value as Supplier)}
            style={inp}
          >
            <option value="DORECA">DORECA</option>
            <option value="ALPORI">ALPORI</option>
            <option value="VARI">VARI</option>
          </select>

          <input
            placeholder="Note (opzionali)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={inp}
          />

          <div style={{ display: "grid", gap: 8 }}>
            {lines.map((l, idx) => {
              const skuNorm = (l.sku || "").toUpperCase().trim();
              const ps = packSizeBySku[skuNorm];

              return (
                <div key={idx} style={{ display: "flex", gap: 8 }}>
                  <select
                    value={l.sku}
                    onChange={(e) => {
                      const next = [...lines];
                      next[idx].sku = e.target.value;
                      setLines(next);
                    }}
                    style={{ ...inp, flex: 1 }}
                  >
                    <option value="">SKU…</option>
                    {items.map((it: any) => (
                      <option key={it.sku} value={it.sku}>
                        {it.sku} — {it.name}
                      </option>
                    ))}
                  </select>

                  {/* qtyPack */}
                  <input
                    type="number"
                    min={1}
                    value={l.qtyPack}
                    onChange={(e) => {
                      const next = [...lines];
                      next[idx].qtyPack = Number(e.target.value);
                      setLines(next);
                    }}
                    style={{ ...inp, width: 110 }}
                    title="Quantità in PACK (casse)"
                  />

                  {/* label xPackSize */}
                  <span
                    style={{
                      fontSize: 12,
                      color: "#667",
                      alignSelf: "center",
                      minWidth: 44,
                      textAlign: "right",
                    }}
                    title="Pack size (PZ per cassa)"
                  >
                    {ps ? `x${ps}` : "—"}
                  </span>

                  <button
                    onClick={() => {
                      const next = [...lines];
                      next.splice(idx, 1);
                      setLines(next.length ? next : [{ sku: "", qtyPack: 1 }]);
                    }}
                    disabled={loading}
                    style={btnGhost}
                    title="Rimuovi riga"
                  >
                    ✕
                  </button>
                </div>
              );
            })}

            <button
              onClick={() => setLines([...lines, { sku: "", qtyPack: 1 }])}
              disabled={loading}
              style={btnGhost}
            >
              + Riga
            </button>
          </div>
        </div>

        <button onClick={createOrder} disabled={loading} style={btnPrimary}>
          Crea ordine
        </button>
      </div>

      {/* -------- TABLE -------- */}
      <OrdersTable orders={orders} onOpen={(o) => setOpenOrderId(o.orderId)} />

      {/* -------- DRAWER -------- */}
      <OrderDrawer
        open={!!openOrderId}
        order={openOrder}
        items={items}
        loading={loading}
        onClose={() => setOpenOrderId(null)}
        onReceiveSelected={(o, payload) => postReceive(o, payload)}
        onReceiveAll={(o, payload) => postReceive(o, payload)}
      />
    </div>
  );
}

/* ---------------- HELPERS ---------------- */

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/* ---------------- STYLES ---------------- */

const card: React.CSSProperties = {
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 14,
};

const grid: React.CSSProperties = {
  display: "grid",
  gap: 10,
};

const inp: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid #d6dbe6",
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
