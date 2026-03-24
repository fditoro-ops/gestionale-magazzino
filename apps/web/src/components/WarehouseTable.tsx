import { useMemo, useState } from "react";

type WarehouseRow = {
  itemId?: string;
  sku: string;
  name: string;
  stockBt: number;
  minStockBt?: number | null;
  minStockUnits?: number | null;
  underMin?: boolean;
  packSize?: number | null;
  baseQty?: number | null;
  um?: string | null;
};

export default function WarehouseTable({
  rows,
  onPickSku,
}: {
  rows: WarehouseRow[];
  onPickSku?: (sku: string) => void;
}) {
  const [search, setSearch] = useState("");

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((r) => {
      return (
        String(r.sku || "").toLowerCase().includes(q) ||
        String(r.name || "").toLowerCase().includes(q)
      );
    });
  }, [rows, search]);

  function formatNumber(n: number, digits = 2) {
    if (!Number.isFinite(n)) return "-";
    return new Intl.NumberFormat("it-IT", {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
    }).format(n);
  }

  function getUnits(row: WarehouseRow): number | null {
    const stockTechnical = Number(row.stockBt || 0);
    const um = String(row.um || "").toUpperCase();

    if (um === "PZ") {
      return stockTechnical;
    }

    const baseQty = Number(row.baseQty || 0);
    if (baseQty > 0) {
      return stockTechnical / baseQty;
    }

    return null;
  }

  function getUnitsLabel(row: WarehouseRow): string {
    const um = String(row.um || "").toUpperCase();
    if (um === "PZ") return "PZ";
    return "Unità";
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.toolbar}>
        <input
          style={styles.search}
          placeholder="Cerca SKU o prodotto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>SKU</th>
              <th style={styles.th}>Prodotto</th>
              <th style={styles.thRight}>Giacenza tecnica</th>
              <th style={styles.thRight}>Unità</th>
              <th style={styles.thRight}>Scorta min.</th>
            </tr>
          </thead>

          <tbody>
            {filteredRows.map((row) => {
              const units = getUnits(row);
              const unitsLabel = getUnitsLabel(row);
              const isUnderMin = Boolean(row.underMin);

              return (
                <tr
                  key={row.itemId || row.sku}
                  onClick={() => onPickSku?.(row.sku)}
                  style={{
                    cursor: onPickSku ? "pointer" : "default",
                    background: isUnderMin ? "#fef2f2" : "transparent",
                  }}
                >
                  <td style={styles.td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {isUnderMin ? <span style={styles.badgeAlert}>Sotto scorta</span> : null}
                      <span>{row.sku}</span>
                    </div>
                  </td>

                  <td style={styles.td}>{row.name}</td>

                  <td style={styles.tdRight}>
                    {formatNumber(Number(row.stockBt || 0), 3)}
                    {row.um ? ` ${row.um}` : ""}
                  </td>

                  <td
                    style={{
                      ...styles.tdRight,
                      color: isUnderMin ? "#b91c1c" : "#0f172a",
                      fontWeight: isUnderMin ? 700 : 400,
                    }}
                  >
                    {units === null ? "-" : `${formatNumber(units, 2)} ${unitsLabel}`}
                  </td>

                  <td
                    style={{
                      ...styles.tdRight,
                      color: isUnderMin ? "#b91c1c" : "#0f172a",
                      fontWeight: isUnderMin ? 700 : 400,
                    }}
                  >
                    {row.minStockUnits == null
                      ? "-"
                      : `${formatNumber(Number(row.minStockUnits || 0), 2)} ${unitsLabel}`}
                  </td>
                </tr>
              );
            })}

            {!filteredRows.length ? (
              <tr>
                <td style={styles.empty} colSpan={5}>
                  Nessun risultato
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: "grid",
    gap: 12,
  },
  toolbar: {
    display: "flex",
    gap: 12,
  },
  search: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #d6dbe6",
    background: "white",
    fontSize: 16,
  },
  tableWrap: {
    background: "white",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    overflow: "hidden",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left",
    padding: 14,
    fontSize: 14,
    color: "#475569",
    borderBottom: "1px solid #e5e7eb",
    background: "#f8fafc",
  },
  thRight: {
    textAlign: "right",
    padding: 14,
    fontSize: 14,
    color: "#475569",
    borderBottom: "1px solid #e5e7eb",
    background: "#f8fafc",
  },
  td: {
    padding: 14,
    borderBottom: "1px solid #f1f5f9",
    color: "#0f172a",
  },
  tdRight: {
    padding: 14,
    textAlign: "right",
    borderBottom: "1px solid #f1f5f9",
    color: "#0f172a",
    fontVariantNumeric: "tabular-nums",
  },
  empty: {
    padding: 24,
    textAlign: "center",
    color: "#64748b",
  },
  badgeAlert: {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    background: "#fee2e2",
    color: "#b91c1c",
    border: "1px solid #fecaca",
    whiteSpace: "nowrap",
  },
};
