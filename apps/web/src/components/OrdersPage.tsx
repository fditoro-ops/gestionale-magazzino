import { useEffect, useMemo, useState } from "react";
import OrdersTable, { type Order } from "./orders/OrdersTable";
import OrderDrawer from "./orders/OrderDrawer";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type Supplier = "DORECA" | "ALPORI" | "VARI";

type WarehouseRow = {
  itemId: string;
  sku: string;
  name: string;
  stockBt: number;
  minStockBt: number | null;
  underMin: boolean;
};

type OrderLineDraft = {
  sku: string;
  qtyPack: number;
  query: string;
  open: boolean;
};

export default function OrdersPage({
  items,
  warehouse,
  onReload,
}: {
  items: any[];
  warehouse: WarehouseRow[];
  onReload: () => void;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [supplier, setSupplier] = useState<Supplier>("DORECA");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<OrderLineDraft[]>([
    { sku: "", qtyPack: 1, query: "", open: false },
  ]);

  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  const openOrder = useMemo(() => {
    if (!openOrderId) return null;
    return orders.find((o) => o.orderId === openOrderId) ?? null;
  }, [orders, openOrderId]);

  const itemsSafe = Array.isArray(items) ? items : [];
  const warehouseSafe = Array.isArray(warehouse) ? warehouse : [];

  const stockBySku = useMemo(() => {
    return Object.fromEntries(
      warehouseSafe.map((r) => [
        String(r.sku || "").toUpperCase().trim(),
        Number(r.stockBt ?? 0),
      ])
    ) as Record<string, number>;
  }, [warehouseSafe]);

  const packSizeBySku = useMemo(() => {
    return Object.fromEntries(
      itemsSafe.map((it: any) => [
        String(it.sku || "").toUpperCase().trim(),
        it.packSize ?? null,
      ])
    ) as Record<string, number | null>;
  }, [itemsSafe]);

  const itemsForSearch = useMemo(() => {
    return itemsSafe
      .filter((it: any) => it?.active !== false)
      .map((it: any) => {
        const sku = String(it.sku || "").toUpperCase().trim();
        const name = String(it.name || "").trim();
        const brand = String(it.brand || "").trim();
        const stock = Number(stockBySku[sku] ?? 0);

        return {
          sku,
          name,
          brand,
          stock,
          searchText: `${name} ${brand}`.toUpperCase(),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "it"));
  }, [itemsSafe, stockBySku]);

  async function loadOrders() {
    try {
      const r = await fetch(`${API_BASE}/orders`);
      const data = await r.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch {
      setOrders([]);
    }
  }

  useEffect(() => {
    loadOrders();
  }, []);

  function updateLine(idx: number, patch: Partial<OrderLineDraft>) {
    setLines((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      { sku: "", qtyPack: 1, query: "", open: false },
    ]);
  }

  function removeLine(idx: number) {
    setLines((prev) => {
      const next = [...prev];
      next.splice(idx, 1);
      return next.length
        ? next
        : [{ sku: "", qtyPack: 1, query: "", open: false }];
    });
  }

  function selectItem(idx: number, item: { sku: string; name: string }) {
    updateLine(idx, {
      sku: item.sku,
      query: item.name,
      open: false,
    });
  }

  function getFilteredItems(query: string) {
    const q = query.trim().toUpperCase();
    let arr = itemsForSearch;

    if (q) {
      arr = arr.filter((it) => it.searchText.includes(q));
    }

    return arr.slice(0, 12);
  }

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
              throw new Error(
                `Articolo selezionato non valido: ${l.query || sku}`
              );
            }

            return {
              sku,
              qtyOrderedConf: l.qtyPack,
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
      const r = await fetch(`${API_BASE}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        const j = await safeJson(r);
        throw new Error(j?.error || "Errore creazione ordine");
      }

      setNotes("");
      setLines([{ sku: "", qtyPack: 1, query: "", open: false }]);
      await loadOrders();
      onReload();
    } catch (e: any) {
      setErr(e?.message || "Errore creazione ordine");
    } finally {
      setLoading(false);
    }
  }
async function confirmOrder(order: Order) {
  setErr(null);
  setLoading(true);

  try {
    const r = await fetch(`${API_BASE}/orders/${order.orderId}/send`, {
      method: "POST",
    });

    if (!r.ok) {
      const j = await safeJson(r);
      throw new Error(j?.error || "Errore conferma ordine");
    }

    await loadOrders();
  } catch (e: any) {
    setErr(e?.message || "Errore conferma ordine");
  } finally {
    setLoading(false);
  }
}

async function sendOrderWhatsapp(order: Order) {
  const itemsBySku = Object.fromEntries(
    (Array.isArray(items) ? items : []).map((it: any) => [
      String(it.sku || "").toUpperCase().trim(),
      it,
    ])
  ) as Record<string, any>;

  const linesText = (order.lines || [])
    .map((l) => {
      const sku = String(l.sku || "").toUpperCase().trim();
      const item = itemsBySku[sku];
      const name = item?.name ? String(item.name) : sku;
      return `- ${name} x${l.qtyOrderedConf}`;
    })
    .join("\n");

  const message = [
    `Buongiorno, invio ordine ${order.orderId}`,
    "",
    linesText,
    "",
    order.notes ? `Note: ${order.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(whatsappUrl, "_blank");

  await confirmOrder(order);
}
  async function deleteOrder(order: Order) {
    const yes = window.confirm(
      `Eliminare l'ordine ${order.orderId}?\nQuesta azione non si può annullare.`
    );

    if (!yes) return;

    setErr(null);
    setLoading(true);

    try {
      const r = await fetch(`${API_BASE}/orders/${order.orderId}`, {
        method: "DELETE",
      });

      if (!r.ok) {
        const j = await safeJson(r);
        throw new Error(j?.error || "Errore eliminazione ordine");
      }

      if (openOrderId === order.orderId) {
        setOpenOrderId(null);
      }

      await loadOrders();
    } catch (e: any) {
      setErr(e?.message || "Errore eliminazione ordine");
    } finally {
      setLoading(false);
    }
  }

  async function postReceive(
    order: Order,
    payload: {
      lines: Array<{ sku: string; qtyReceivedNowConf: number }>;
      note?: string;
    }
  ) {
    setErr(null);
    setLoading(true);

    try {
      const r = await fetch(`${API_BASE}/orders/${order.orderId}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        const j = await safeJson(r);
        throw new Error(j?.error || "Errore ricezione ordine");
      }

      await loadOrders();
      onReload();
    } catch (e: any) {
      setErr(e?.message || "Errore ricezione ordine");
    } finally {
      setLoading(false);
    }
  }

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
              const filtered = getFilteredItems(l.query);
              const skuNorm = (l.sku || "").toUpperCase().trim();
              const ps = packSizeBySku[skuNorm];

              return (
                <div key={idx} style={{ display: "grid", gap: 6 }}>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <div style={{ position: "relative" }}>
                      <input
                        value={l.query}
                        onChange={(e) =>
                          updateLine(idx, {
                            query: e.target.value,
                            sku: "",
                            open: true,
                          })
                        }
                        onFocus={() => updateLine(idx, { open: true })}
                        placeholder="Cerca articolo..."
                        style={{ ...inp, width: 220 }}
                      />

                      {l.open && filtered.length > 0 && (
                        <div style={dropdown}>
                          {filtered.map((it) => (
                            <button
                              key={it.sku}
                              type="button"
                              onClick={() => selectItem(idx, it)}
                              style={dropdownItem}
                            >
                              <span>{it.name}</span>
                              <span style={stockTag(it.stock)}>
                                disp. {it.stock}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <input
                      type="number"
                      min={1}
                      value={l.qtyPack}
                      onChange={(e) =>
                        updateLine(idx, { qtyPack: Number(e.target.value) })
                      }
                      style={{ ...inp, width: 100 }}
                      title="Quantità in confezioni/casse"
                    />

                    <span
                      style={{
                        alignSelf: "center",
                        fontSize: 12,
                        color: "#667",
                        minWidth: 44,
                        textAlign: "right",
                      }}
                      title="Pack size"
                    >
                      {ps ? `x${ps}` : "—"}
                    </span>

                    <button
                      onClick={() => removeLine(idx)}
                      disabled={loading}
                      style={btnGhost}
                      title="Rimuovi riga"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}

            <button onClick={addLine} disabled={loading} style={btnGhost}>
              + Riga
            </button>
          </div>
        </div>

        <button onClick={createOrder} disabled={loading} style={btnPrimary}>
          Crea ordine
        </button>
      </div>

     <OrdersTable
  orders={orders}
  onOpen={(o) => setOpenOrderId(o.orderId)}
  onDelete={(o) => deleteOrder(o)}
  onConfirm={(o) => confirmOrder(o)}
  onWhatsapp={(o) => sendOrderWhatsapp(o)}
/>

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

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

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
};

const dropdown: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  left: 0,
  right: 0,
  zIndex: 20,
  background: "white",
  border: "1px solid #d6dbe6",
  borderRadius: 12,
  boxShadow: "0 10px 24px rgba(0,0,0,0.08)",
  maxHeight: 260,
  overflowY: "auto",
};

const dropdownItem: React.CSSProperties = {
  width: "100%",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "10px 12px",
  border: "none",
  background: "white",
  cursor: "pointer",
  textAlign: "left",
};

function stockTag(stock: number): React.CSSProperties {
  return {
    fontSize: 12,
    fontWeight: 700,
    color: stock <= 0 ? "#b91c1c" : stock <= 3 ? "#92400e" : "#166534",
    background: stock <= 0 ? "#fee2e2" : stock <= 3 ? "#fef3c7" : "#dcfce7",
    borderRadius: 999,
    padding: "4px 8px",
    whiteSpace: "nowrap",
  };
}
