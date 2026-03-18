import { useMemo, useState } from "react";

type WarehouseRow = {
  itemId?: string;
  sku: string;
  name: string;
  stockBt: number;
  minStockBt?: number | null;
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

  function getStockBoxes(row: WarehouseRow): number | null {
    const stockTechnical = Number(row.stockBt || 0);

    if (String(row.um || "").toUpperCase() === "PZ") {
      return stockTechnical;
    }

    const packSize = Number(row.packSize || 0);
    if (packSize > 0) return stockTechnical / packSize;

    const baseQty = Number(row.baseQty || 0);
    if (baseQty > 0) return stockTechnical / baseQty;

    return null;
  }

  function getBtLabel(row: WarehouseRow): string {
    const um = String(row.um || "").toUpperCase();
    if (um === "PZ") return "PZ";
    return "BT";
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
              <th style={styles.thRight}>BT</th>
              <th style={styles.thRight}>Scorta min.</th>
            </tr>
          </thead>

          <tbody>
            {filteredRows.map((row) => {
              const stockBoxes = getStockBoxes(row);
              const btLabel = getBtLabel(row);

              return (
                <tr
                  key={row.itemId || row.sku}
                  onClick={() => onPickSku?.(row.sku)}
                  style={{
                    cursor: onPickSku ? "pointer" : "default",
                  }}
                >
                  <td style={styles.td}>{row.sku}</td>
                  <td style={styles.td}>{row.name}</td>

                  <td style={styles.tdRight}>
                    {formatNumber(Number(row.stockBt || 0), 3)}
                    {row.um ? ` ${row.um}` : ""}
                  </td>

                  <td style={styles.tdRight}>
                    {stockBoxes === null
                      ? "-"
                      : `${formatNumber(stockBoxes, 2)} ${btLabel}`}
                  </td>

                  <td style={styles.tdRight}>
                    {row.minStockBt == null
                      ? "-"
                      : `${formatNumber(Number(row.minStockBt || 0), 2)}${
                          row.um ? ` ${row.um}` : ""
                        }`}
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
};
