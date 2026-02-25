import { useMemo, useState } from "react";

type WarehouseRow = {
  itemId: string;
  sku: string;
  name: string;

  stockBt: number;

  // ✅ v2: soglia in CL
  minStockCl?: number;

  underMin: boolean;

  // (opzionali, se vuoi mostrarli dopo)
  categoryId?: string;
  supplier?: string;
};

export default function WarehouseTable({
  rows,
  onPickSku,
}: {
  rows: WarehouseRow[];
  onPickSku?: (sku: string) => void;
}) {
  const [q, setQ] = useState("");
  const [onlyUnderMin, setOnlyUnderMin] = useState(false);

  const filtered = useMemo(() => {
    const qNorm = q.trim().toUpperCase();
    let r = rows;

    if (qNorm) {
      r = r.filter((x) => {
        return (
          x.sku.toUpperCase().includes(qNorm) ||
          x.name.toUpperCase().includes(qNorm)
        );
      });
    }

    if (onlyUnderMin) {
      r = r.filter((x) => x.underMin);
    }

    // Ordine: sotto scorta in alto, poi per nome
    return [...r].sort((a, b) => {
      if (a.underMin !== b.underMin) return a.underMin ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [rows, q, onlyUnderMin]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Magazzino</h2>
          <span style={{ fontSize: 12, color: "#667" }}>
            {filtered.length} righe
          </span>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca SKU o nome..."
            style={{
              width: 260,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #d6dbe6",
            }}
          />

          <label
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              fontSize: 14,
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={onlyUnderMin}
              onChange={(e) => setOnlyUnderMin(e.target.checked)}
            />
            Solo sotto scorta
          </label>
        </div>
      </div>

      {/* Table */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          overflow: "hidden",
          background: "white",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f9fafb" }}>
              <Th>SKU</Th>
              <Th>Nome</Th>
              <Th style={{ textAlign: "right" }}>Stock (BT)</Th>
              <Th style={{ textAlign: "right" }}>Min (CL)</Th>
              <Th>Stato</Th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((r) => (
              <tr
                key={r.itemId}
                onClick={() => onPickSku?.(r.sku)}
                style={{
                  cursor: onPickSku ? "pointer" : "default",
                  borderTop: "1px solid #eef2f7",
                }}
              >
                <Td>
                  <span style={{ fontWeight: 700 }}>{r.sku}</span>
                </Td>
                <Td>{r.name}</Td>

                <Td style={{ textAlign: "right", fontWeight: 700 }}>
                  {r.stockBt}
                </Td>

                <Td style={{ textAlign: "right" }}>
                  {typeof r.minStockCl === "number" ? r.minStockCl : "-"}
                </Td>

                <Td>
                  {r.underMin ? (
                    <Badge tone="danger">Sotto scorta</Badge>
                  ) : (
                    <Badge tone="ok">OK</Badge>
                  )}
                </Td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <Td colSpan={5} style={{ padding: 16, color: "#667" }}>
                  Nessun risultato.
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 12, color: "#667" }}>
        Tip: clicca una riga per precompilare lo SKU nei movimenti.
      </div>
    </div>
  );
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
        padding: "12px 12px",
        textAlign: "left",
        fontSize: 12,
        color: "#667",
        letterSpacing: 0.2,
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
        padding: "12px 12px",
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
  tone: "ok" | "danger";
}) {
  const styles =
    tone === "danger"
      ? { background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B" }
      : { background: "#ECFDF5", border: "1px solid #BBF7D0", color: "#065F46" };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        ...styles,
      }}
    >
      {children}
    </span>
  );
}
