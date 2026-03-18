import React, { useEffect, useRef, useState } from "react";

type Supplier = "DORECA" | "ALPORI" | "VARI" | string;
type OrderStatus = "DRAFT" | "SENT" | "PARTIAL" | "RECEIVED" | "CANCELLED";

type OrderLine = {
  sku: string;
  qtyOrderedConf: number;
  qtyReceivedConf: number;
};

export type Order = {
  orderId: string;
  supplier: Supplier;
  status: OrderStatus;
  createdAt: string;
  sentAt?: string | null;
  receivedAt?: string | null;
  notes?: string | null;
  lines: OrderLine[];
};

export default function OrdersTable({
  orders,
  onOpen,
  onDelete,
  onConfirm,
  onWhatsapp,
  onEdit,
}: {
  orders: Order[];
  onOpen: (o: Order) => void;
  onDelete: (o: Order) => void;
  onConfirm: (o: Order) => void;
  onWhatsapp: (o: Order) => void;
  onEdit: (o: Order) => void;
}) {
  const [openMenuOrderId, setOpenMenuOrderId] = useState<string | null>(null);
  const menuWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!menuWrapRef.current) return;
      if (!menuWrapRef.current.contains(e.target as Node)) {
        setOpenMenuOrderId(null);
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenMenuOrderId(null);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  function toggleMenu(orderId: string) {
    setOpenMenuOrderId((prev) => (prev === orderId ? null : orderId));
  }

  function runAndClose(fn: () => void) {
    setOpenMenuOrderId(null);
    fn();
  }

  const sortedOrders = [...orders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div style={card}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <strong>Ordini</strong>
        <span style={{ fontSize: 12, color: "#667" }}>
          {orders.length} ordini
        </span>
      </div>

      <div
        style={{
          marginTop: 10,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          overflowX: "auto",
          overflowY: "auto",
          maxHeight: 520,
          position: "relative",
          background: "white",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            background: "white",
          }}
        >
          <thead>
            <tr style={{ background: "#f9fafb" }}>
              <Th>Numero</Th>
              <Th>Data</Th>
              <Th>Fornitore</Th>
              <Th style={{ textAlign: "right" }}>Righe</Th>
              <Th>Stato</Th>
              <Th style={{ textAlign: "right" }}>Azioni</Th>
            </tr>
          </thead>

          <tbody>
            {sortedOrders.map((o, index) => {
              const openUpwards = index >= sortedOrders.length - 2;

              return (
                <tr key={o.orderId} style={{ borderTop: "1px solid #eef2f7" }}>
                  <Td>
                    <span style={{ fontWeight: 900 }}>
                      {formatOrderNumber(o)}
                    </span>
                  </Td>

                  <Td style={{ color: "#334", opacity: 0.9 }}>
                    {new Date(o.createdAt).toLocaleString()}
                  </Td>

                  <Td>
                    <Badge tone="info">{o.supplier}</Badge>
                  </Td>

                  <Td style={{ textAlign: "right", fontWeight: 800 }}>
                    {o.lines?.length ?? 0}
                  </Td>

                  <Td>
                    <Badge tone={statusTone(o.status)}>
                      {statusLabel(o.status)}
                    </Badge>
                  </Td>

                  <Td style={{ textAlign: "right" }}>
                    <div
                      ref={openMenuOrderId === o.orderId ? menuWrapRef : null}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        gap: 8,
                        position: "relative",
                      }}
                    >
                      <button onClick={() => onOpen(o)} style={btnPrimary}>
                        Apri
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleMenu(o.orderId)}
                        style={btnGhostSquare}
                        title="Altre azioni"
                      >
                        ⋯
                      </button>

                      {openMenuOrderId === o.orderId && (
                        <div
                          style={{
                            ...menu,
                            ...(openUpwards
                              ? { top: "auto", bottom: "calc(100% + 6px)" }
                              : { top: "calc(100% + 6px)", bottom: "auto" }),
                          }}
                        >
                          {o.status === "DRAFT" ? (
                            <>
                              <button
                                type="button"
                                style={menuItem}
                                onClick={() => runAndClose(() => onEdit(o))}
                              >
                                Modifica
                              </button>

                              <button
                                type="button"
                                style={menuItem}
                                onClick={() => runAndClose(() => onConfirm(o))}
                              >
                                Conferma
                              </button>

                              <button
                                type="button"
                                style={menuItem}
                                onClick={() => runAndClose(() => onWhatsapp(o))}
                              >
                                WhatsApp
                              </button>

                              <button
                                type="button"
                                style={{
                                  ...menuItem,
                                  color: "#b91c1c",
                                  borderBottom: "none",
                                }}
                                onClick={() => runAndClose(() => onDelete(o))}
                              >
                                Elimina
                              </button>
                            </>
                          ) : (
                            <div style={menuInfo}>Nessuna azione disponibile</div>
                          )}
                        </div>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}

            {sortedOrders.length === 0 && (
              <tr>
                <Td colSpan={6} style={{ padding: 16, color: "#667" }}>
                  Nessun ordine.
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: "#667" }}>
        Tip: “Apri” mostra dettaglio e ricezione nel pannello laterale.
      </div>
    </div>
  );
}

function formatOrderNumber(order: Order): string {
  const d = new Date(order.createdAt);
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const shortId = String(order.orderId || "")
    .replace(/^ord_/i, "")
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 6)
    .toUpperCase();

  return `ORD-${yy}${mm}${dd}-${shortId || "XXXXXX"}`;
}

function statusTone(
  status: OrderStatus
): "ok" | "warn" | "info" | "danger" | "muted" {
  if (status === "RECEIVED") return "ok";
  if (status === "PARTIAL") return "warn";
  if (status === "CANCELLED") return "muted";
  if (status === "DRAFT") return "info";
  return "danger";
}

function statusLabel(status: OrderStatus): string {
  if (status === "DRAFT") return "Bozza";
  if (status === "SENT") return "Inviato";
  if (status === "PARTIAL") return "Parziale";
  if (status === "RECEIVED") return "Ricevuto";
  if (status === "CANCELLED") return "Annullato";
  return status;
}

function Th({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <th
      style={{
        padding: "10px 12px",
        textAlign: "left",
        fontSize: 12,
        color: "#667",
        position: "sticky",
        top: 0,
        background: "#f9fafb",
        zIndex: 2,
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  style,
  colSpan,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
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

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "ok" | "warn" | "info" | "danger" | "muted";
}) {
  const styles =
    tone === "ok"
      ? { background: "#ECFDF5", border: "1px solid #BBF7D0", color: "#065F46" }
      : tone === "warn"
        ? { background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E" }
        : tone === "danger"
          ? { background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B" }
          : tone === "muted"
            ? { background: "#F3F4F6", border: "1px solid #E5E7EB", color: "#4B5563" }
            : { background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#1E40AF" };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 900,
        ...styles,
      }}
    >
      {children}
    </span>
  );
}

const card: React.CSSProperties = {
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 14,
};

const btnPrimary: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid #0B7285",
  background: "#0B7285",
  color: "white",
  cursor: "pointer",
  fontWeight: 900,
};

const btnGhostSquare: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 12,
  border: "1px solid #d6dbe6",
  background: "white",
  cursor: "pointer",
  fontWeight: 900,
  fontSize: 18,
  lineHeight: 1,
};

const menu: React.CSSProperties = {
  position: "absolute",
  right: 0,
  minWidth: 170,
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  boxShadow: "0 12px 30px rgba(0,0,0,0.10)",
  overflow: "hidden",
  zIndex: 30,
};

const menuItem: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "10px 12px",
  border: "none",
  borderBottom: "1px solid #f1f5f9",
  background: "white",
  cursor: "pointer",
  fontSize: 14,
};

const menuInfo: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 13,
  color: "#667",
  background: "white",
};
