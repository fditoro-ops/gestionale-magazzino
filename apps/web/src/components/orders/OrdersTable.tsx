import React from "react";

type Supplier = "DORECA" | "ALPORI" | "VARI";
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
}: {
  orders: Order[];
  onOpen: (o: Order) => void;
}) {
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
        <span style={{ fontSize: 12, color: "#667" }}>{orders.length} ordini</span>
      </div>

      <div
        style={{
          marginTop: 10,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          overflow: "hidden",
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
            {orders.map((o) => (
              <tr key={o.orderId} style={{ borderTop: "1px solid #eef2f7" }}>
                <Td>
                  <span style={{ fontWeight: 900 }}>{o.orderId}</span>
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
                  <Badge tone={statusTone(o.status)}>{statusLabel(o.status)}</Badge>
                </Td>

                <Td style={{ textAlign: "right" }}>
                  <button onClick={() => onOpen(o)} style={btnPrimary}>
                    Apri
                  </button>
                </Td>
              </tr>
            ))}

            {orders.length === 0 && (
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

function statusTone(status: OrderStatus): "ok" | "warn" | "info" | "danger" | "muted" {
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
