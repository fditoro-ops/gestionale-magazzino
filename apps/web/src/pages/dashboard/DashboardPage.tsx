import { useMemo } from "react";

type SalesDocumentStatus = "VALID" | "VOID" | "REFUND";

type SalesDocument = {
  documentId: string;
  date: string;
  totalAmount: number;
  status: SalesDocumentStatus;
  source?: string;
};

type SalesLine = {
  id: string;
  documentId: string;
  sku: string;
  description: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  hasRecipe?: boolean;
};

type Props = {
  salesDocuments: SalesDocument[];
  salesLines: SalesLine[];
};

type DailyRow = {
  day: string;
  total: number;
  documents: number;
};

type TopItemRow = {
  sku: string;
  description: string;
  qty: number;
  total: number;
  hasRecipe: boolean;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value || 0);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("it-IT").format(value || 0);
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}


function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function safeDate(value?: string) {
  const d = value ? new Date(value) : new Date("");
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildLastDaysMap(days: number) {
  const today = startOfDay(new Date());
  const map = new Map<string, DailyRow>();

  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(today, -i);
    const key = day.toISOString().slice(0, 10);
    map.set(key, {
      day: key,
      total: 0,
      documents: 0,
    });
  }

  return map;
}

function MiniBarChart({ data }: { data: DailyRow[] }) {
  const max = Math.max(...data.map((x) => x.total), 1);

  return (
    <div style={styles.chartWrap}>
      <div style={styles.chartBars}>
        {data.map((row) => {
          const height = Math.max((row.total / max) * 160, row.total > 0 ? 10 : 4);
          return (
            <div key={row.day} style={styles.chartCol}>
              <div
                title={`${row.day} • ${formatCurrency(row.total)}`}
                style={{
                  ...styles.chartBar,
                  height,
                }}
              />
              <div style={styles.chartLabel}>
                {row.day.slice(8, 10)}/{row.day.slice(5, 7)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>{title}</div>
      <div style={styles.cardValue}>{value}</div>
      {subtitle ? <div style={styles.cardSubtitle}>{subtitle}</div> : null}
    </div>
  );
}

export default function DashboardPage({ salesDocuments, salesLines }: Props) {
  const data = useMemo(() => {
    const validDocs = salesDocuments.filter((doc) => doc.status === "VALID");

    const validDocIds = new Set(validDocs.map((doc) => doc.documentId));

    const validLines = salesLines.filter((line) => validDocIds.has(line.documentId));

    const totalSales = validDocs.reduce((sum, doc) => sum + (Number(doc.totalAmount) || 0), 0);
    const totalReceipts = validDocs.length;
    const totalPieces = validLines.reduce((sum, line) => sum + (Number(line.qty) || 0), 0);
    const avgTicket = totalReceipts > 0 ? totalSales / totalReceipts : 0;

    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const last7Start = startOfDay(addDays(now, -6));

    let todaySales = 0;
    let todayReceipts = 0;
    let last7Sales = 0;
    let withoutRecipeQty = 0;
    let withoutRecipeTotal = 0;

    for (const doc of validDocs) {
      const docDate = safeDate(doc.date);
      if (!docDate) continue;

      if (docDate >= todayStart && docDate <= todayEnd) {
        todaySales += Number(doc.totalAmount) || 0;
        todayReceipts += 1;
      }

      if (docDate >= last7Start && docDate <= todayEnd) {
        last7Sales += Number(doc.totalAmount) || 0;
      }
    }

    for (const line of validLines) {
      const hasRecipe = Boolean(line.hasRecipe);
      if (!hasRecipe) {
        withoutRecipeQty += Number(line.qty) || 0;
        withoutRecipeTotal += Number(line.lineTotal) || 0;
      }
    }

    const dailyMap = buildLastDaysMap(7);
    for (const doc of validDocs) {
      const docDate = safeDate(doc.date);
      if (!docDate) continue;

      const key = startOfDay(docDate).toISOString().slice(0, 10);
      const row = dailyMap.get(key);
      if (!row) continue;

      row.total += Number(doc.totalAmount) || 0;
      row.documents += 1;
    }

    const salesByDay = Array.from(dailyMap.values());

    const topItemsMap = new Map<string, TopItemRow>();

    for (const line of validLines) {
      const key = line.sku || line.description || line.id;
      const existing = topItemsMap.get(key);

      if (!existing) {
        topItemsMap.set(key, {
          sku: line.sku,
          description: line.description,
          qty: Number(line.qty) || 0,
          total: Number(line.lineTotal) || 0,
          hasRecipe: Boolean(line.hasRecipe),
        });
      } else {
        existing.qty += Number(line.qty) || 0;
        existing.total += Number(line.lineTotal) || 0;
        existing.hasRecipe = existing.hasRecipe || Boolean(line.hasRecipe);
      }
    }

    const topItems = Array.from(topItemsMap.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);

    return {
      totalSales,
      totalReceipts,
      totalPieces,
      avgTicket,
      todaySales,
      todayReceipts,
      last7Sales,
      withoutRecipeQty,
      withoutRecipeTotal,
      salesByDay,
      topItems,
    };
  }, [salesDocuments, salesLines]);

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title}>Dashboard</h1>
          <div style={styles.subtitle}>Panoramica vendite dal flusso scontrini</div>
        </div>
      </div>

      <section style={styles.kpiGrid}>
        <KpiCard
          title="Vendite totali"
          value={formatCurrency(data.totalSales)}
          subtitle="Documenti validi"
        />
        <KpiCard
          title="Scontrini"
          value={formatNumber(data.totalReceipts)}
          subtitle="Numero documenti"
        />
        <KpiCard
          title="Pezzi venduti"
          value={formatNumber(data.totalPieces)}
          subtitle="Somma quantità righe"
        />
        <KpiCard
          title="Ticket medio"
          value={formatCurrency(data.avgTicket)}
          subtitle="Vendite / scontrini"
        />
      </section>

      <section style={styles.kpiGrid}>
        <KpiCard
          title="Vendite oggi"
          value={formatCurrency(data.todaySales)}
          subtitle={`${formatNumber(data.todayReceipts)} scontrini`}
        />
        <KpiCard
          title="Ultimi 7 giorni"
          value={formatCurrency(data.last7Sales)}
          subtitle="Finestra mobile"
        />
        <KpiCard
          title="Senza ricetta"
          value={formatCurrency(data.withoutRecipeTotal)}
          subtitle={`${formatNumber(data.withoutRecipeQty)} pezzi senza scarico`}
        />
        <KpiCard
          title="Copertura ricette"
          value={
            data.totalSales > 0
              ? `${Math.round(
                  ((data.totalSales - data.withoutRecipeTotal) / data.totalSales) * 100
                )}%`
              : "0%"
          }
          subtitle="Quota vendite coperta"
        />
      </section>

      <section style={styles.mainGrid}>
        <div style={styles.panel}>
          <div style={styles.panelTitle}>Andamento vendite ultimi 7 giorni</div>
          <MiniBarChart data={data.salesByDay} />
        </div>

        <div style={styles.panel}>
          <div style={styles.panelTitle}>Top articoli venduti</div>

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>SKU</th>
                  <th style={styles.th}>Articolo</th>
                  <th style={styles.thRight}>Q.tà</th>
                  <th style={styles.thRight}>Totale</th>
                  <th style={styles.thCenter}>Ricetta</th>
                </tr>
              </thead>
              <tbody>
                {data.topItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={styles.emptyTd}>
                      Nessuna vendita disponibile
                    </td>
                  </tr>
                ) : (
                  data.topItems.map((item) => (
                    <tr key={`${item.sku}-${item.description}`} style={styles.tr}>
                      <td style={styles.td}>{item.sku || "-"}</td>
                      <td style={styles.td}>{item.description || "-"}</td>
                      <td style={styles.tdRight}>{formatNumber(item.qty)}</td>
                      <td style={styles.tdRight}>{formatCurrency(item.total)}</td>
                      <td style={styles.tdCenter}>
                        <span
                          style={{
                            ...styles.badge,
                            ...(item.hasRecipe ? styles.badgeOk : styles.badgeWarn),
                          }}
                        >
                          {item.hasRecipe ? "Sì" : "No"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    padding: 16,
  },

  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },

  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
  },

  subtitle: {
    marginTop: 4,
    opacity: 0.7,
    fontSize: 14,
  },

  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },

  card: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
  },

  cardTitle: {
    fontSize: 13,
    fontWeight: 700,
    opacity: 0.75,
    marginBottom: 10,
  },

  cardValue: {
    fontSize: 28,
    fontWeight: 800,
    lineHeight: 1.1,
  },

  cardSubtitle: {
    marginTop: 8,
    fontSize: 13,
    opacity: 0.7,
  },

  mainGrid: {
    display: "grid",
    gridTemplateColumns: "1.1fr 1.4fr",
    gap: 16,
  },

  panel: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
    minHeight: 320,
  },

  panelTitle: {
    fontSize: 16,
    fontWeight: 800,
    marginBottom: 14,
  },

  chartWrap: {
    display: "flex",
    alignItems: "flex-end",
    height: 220,
    paddingTop: 12,
  },

  chartBars: {
    display: "flex",
    alignItems: "flex-end",
    gap: 12,
    width: "100%",
    height: "100%",
  },

  chartCol: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-end",
    flex: 1,
    gap: 8,
    height: "100%",
  },

  chartBar: {
    width: "100%",
    maxWidth: 46,
    borderRadius: 12,
    background: "linear-gradient(180deg, #111827 0%, #374151 100%)",
    minHeight: 4,
  },

  chartLabel: {
    fontSize: 12,
    opacity: 0.7,
  },

  tableWrap: {
    overflowX: "auto",
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
  },

  th: {
    textAlign: "left",
    fontSize: 12,
    padding: "10px 8px",
    borderBottom: "1px solid #e5e7eb",
    opacity: 0.7,
  },

  thRight: {
    textAlign: "right",
    fontSize: 12,
    padding: "10px 8px",
    borderBottom: "1px solid #e5e7eb",
    opacity: 0.7,
  },

  thCenter: {
    textAlign: "center",
    fontSize: 12,
    padding: "10px 8px",
    borderBottom: "1px solid #e5e7eb",
    opacity: 0.7,
  },

  tr: {
    borderBottom: "1px solid #f1f5f9",
  },

  td: {
    padding: "12px 8px",
    fontSize: 14,
  },

  tdRight: {
    padding: "12px 8px",
    fontSize: 14,
    textAlign: "right",
  },

  tdCenter: {
    padding: "12px 8px",
    fontSize: 14,
    textAlign: "center",
  },

  emptyTd: {
    padding: 24,
    textAlign: "center",
    opacity: 0.6,
  },

  badge: {
    display: "inline-block",
    minWidth: 38,
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
  },

  badgeOk: {
    background: "#dcfce7",
    color: "#166534",
  },

  badgeWarn: {
    background: "#fef3c7",
    color: "#92400e",
  },
};
