import { useEffect, useMemo, useState } from "react";
import { authFetch } from "../../api/authFetch";

type SalesDocumentStatus = "VALID" | "VOID" | "REFUND";

type SalesDocument = {
  documentId: string;
  date: string;
  businessDate?: string;
  totalAmount: number;
  status: SalesDocumentStatus;
  source?: string;
};

type SalesLine = {
  id: string;
  documentId: string;
  businessDate?: string;
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

type FilterKey =
  | "TODAY"
  | "YESTERDAY"
  | "LAST_7_DAYS"
  | "LAST_30_DAYS"
  | "THIS_MONTH"
  | "ALL";

type SummaryTopProduct = {
  productName: string;
  sku: string;
  qtySold: number;
  totalSales: number;
};

type DashboardSummary = {
  documentsCount: number;
  totalSales: number;
  avgTicket: number;
  linesCount: number;
  topProducts: SummaryTopProduct[];
};

type PendingReasonRow = {
  reason: string;
  rowsCount: number;
  salesTotal: number;
};

type PendingTopRow = {
  sku: string;
  description: string;
  reason: string;
  rowsCount: number;
  qtyTotal: number;
  salesTotal: number;
};

type PendingAlertsData = {
  pendingRows: number;
  pendingEntities: number;
  pendingSalesTotal: number;
  byReason: PendingReasonRow[];
  topPending: PendingTopRow[];
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

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function safeDate(value?: string) {
  const d = value ? new Date(value) : new Date("");
  return Number.isNaN(d.getTime()) ? null : d;
}

function getBusinessDayKeyFromDate(date: Date) {
  const d = new Date(date);

  if (d.getHours() < 6) {
    d.setDate(d.getDate() - 1);
  }

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDocumentBusinessDayKey(doc: SalesDocument) {
  if (doc.businessDate) return doc.businessDate;

  const d = safeDate(doc.date);
  if (!d) return "";

  return getBusinessDayKeyFromDate(d);
}


function buildDaysMapFromKeys(dayKeys: string[]) {
  const map = new Map<string, DailyRow>();

  for (const key of dayKeys) {
    map.set(key, {
      day: key,
      total: 0,
      documents: 0,
    });
  }

  return map;
}

function buildRollingDayKeys(days: number, endDate = new Date()) {
  const keys: string[] = [];
  const base = startOfDay(endDate);

  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(base, -i);
    const key = getBusinessDayKeyFromDate(d);
    if (!keys.includes(key)) keys.push(key);
  }

  return keys;
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
  const [filter, setFilter] = useState<FilterKey>("LAST_7_DAYS");

    const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  async function loadSummary() {
    try {
      setSummaryLoading(true);
      const res = await authFetch("/dashboard/summary");
      const json = await res.json();
      setSummary(json?.data ?? null);
    } catch (err) {
      console.error("Errore caricamento dashboard summary:", err);
    } finally {
      setSummaryLoading(false);
    }
  }

  const [pendingAlerts, setPendingAlerts] = useState<PendingAlertsData | null>(null);
  const [pendingAlertsLoading, setPendingAlertsLoading] = useState(false);

  async function loadPendingAlerts() {
    try {
      setPendingAlertsLoading(true);
      const res = await authFetch("/dashboard/pending-alerts");
      const json = await res.json();
      setPendingAlerts(json?.data ?? null);
    } catch (err) {
      console.error("Errore caricamento pending alerts:", err);
    } finally {
      setPendingAlertsLoading(false);
    }
  }

 useEffect(() => {
    loadSummary();
    loadPendingAlerts();
 }, []);

  
  const data = useMemo(() => {
    const validDocs = salesDocuments.filter((doc) => doc.status === "VALID");

    const docBusinessDateById = new Map<string, string>(
      validDocs.map((doc) => [doc.documentId, getDocumentBusinessDayKey(doc)])
    );

    const todayKey = getBusinessDayKeyFromDate(new Date());
    const yesterdayKey = getBusinessDayKeyFromDate(addDays(new Date(), -1));

    const last7Keys = buildRollingDayKeys(7);
    const last30Keys = buildRollingDayKeys(30);

  
    const thisMonthYear = Number(todayKey.slice(0, 4));
    const thisMonthMonth = Number(todayKey.slice(5, 7));

    const filteredDocs = validDocs.filter((doc) => {
      const businessDay = docBusinessDateById.get(doc.documentId) || "";
      if (!businessDay) return false;

      if (filter === "TODAY") return businessDay === todayKey;
      if (filter === "YESTERDAY") return businessDay === yesterdayKey;
      if (filter === "LAST_7_DAYS") return last7Keys.includes(businessDay);
      if (filter === "LAST_30_DAYS") return last30Keys.includes(businessDay);

      if (filter === "THIS_MONTH") {
        const y = Number(businessDay.slice(0, 4));
        const m = Number(businessDay.slice(5, 7));
        return y === thisMonthYear && m === thisMonthMonth;
      }

      return true;
    });

    const filteredDocIds = new Set(filteredDocs.map((doc) => doc.documentId));

    const filteredLines = salesLines.filter((line) => filteredDocIds.has(line.documentId));

    const totalSales = filteredDocs.reduce(
      (sum, doc) => sum + (Number(doc.totalAmount) || 0),
      0
    );

    const totalReceipts = filteredDocs.length;

    const totalPieces = filteredLines.reduce(
      (sum, line) => sum + (Number(line.qty) || 0),
      0
    );

    const avgTicket = totalReceipts > 0 ? totalSales / totalReceipts : 0;

    let withoutRecipeQty = 0;
    let withoutRecipeTotal = 0;

    for (const line of filteredLines) {
      const hasRecipe = Boolean(line.hasRecipe);
      if (!hasRecipe) {
        withoutRecipeQty += Number(line.qty) || 0;
        withoutRecipeTotal += Number(line.lineTotal) || 0;
      }
    }

    const todayDocs = validDocs.filter(
      (doc) => (docBusinessDateById.get(doc.documentId) || "") === todayKey
    );

    const todayDocIds = new Set(todayDocs.map((doc) => doc.documentId));

    const todayLines = salesLines.filter((line) => todayDocIds.has(line.documentId));

    const todaySales = todayDocs.reduce(
      (sum, doc) => sum + (Number(doc.totalAmount) || 0),
      0
    );

    const todayReceipts = todayDocs.length;

    const last7Docs = validDocs.filter((doc) =>
      last7Keys.includes(docBusinessDateById.get(doc.documentId) || "")
    );

    const last7Sales = last7Docs.reduce(
      (sum, doc) => sum + (Number(doc.totalAmount) || 0),
      0
    );

    let chartDayKeys: string[] = [];

    if (filter === "TODAY") {
      chartDayKeys = [todayKey];
    } else if (filter === "YESTERDAY") {
      chartDayKeys = [yesterdayKey];
    } else if (filter === "LAST_7_DAYS") {
      chartDayKeys = last7Keys;
    } else if (filter === "LAST_30_DAYS") {
      chartDayKeys = last30Keys.slice(-10);
    } else if (filter === "THIS_MONTH") {
      const docsThisMonth = filteredDocs
        .map((doc) => docBusinessDateById.get(doc.documentId) || "")
        .filter(Boolean);

      chartDayKeys = Array.from(new Set(docsThisMonth)).sort();
    } else {
      const allKeys = filteredDocs
        .map((doc) => docBusinessDateById.get(doc.documentId) || "")
        .filter(Boolean);

      chartDayKeys = Array.from(new Set(allKeys)).sort().slice(-10);
    }

    if (chartDayKeys.length === 0) {
      chartDayKeys = last7Keys;
    }

    const dailyMap = buildDaysMapFromKeys(chartDayKeys);

    for (const doc of filteredDocs) {
      const key = docBusinessDateById.get(doc.documentId) || "";
      if (!key) continue;

      const row = dailyMap.get(key);
      if (!row) continue;

      row.total += Number(doc.totalAmount) || 0;
      row.documents += 1;
    }

    const salesByDay = Array.from(dailyMap.values());

    const topItemsMap = new Map<string, TopItemRow>();

    for (const line of filteredLines) {
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

    const filterLabelMap: Record<FilterKey, string> = {
      TODAY: "Oggi",
      YESTERDAY: "Ieri",
      LAST_7_DAYS: "Ultimi 7 giorni",
      LAST_30_DAYS: "Ultimi 30 giorni",
      THIS_MONTH: "Questo mese",
      ALL: "Tutto",
    };

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
      selectedLabel: filterLabelMap[filter],
      chartTitle:
        filter === "TODAY"
          ? "Andamento vendite oggi"
          : filter === "YESTERDAY"
            ? "Andamento vendite ieri"
            : filter === "LAST_30_DAYS"
              ? "Andamento vendite ultimi 30 giorni"
              : filter === "THIS_MONTH"
                ? "Andamento vendite questo mese"
                : filter === "ALL"
                  ? "Andamento vendite"
                  : "Andamento vendite ultimi 7 giorni",
      todayPieces: todayLines.reduce((sum, line) => sum + (Number(line.qty) || 0), 0),
    };
  }, [salesDocuments, salesLines, filter]);

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title}>Dashboard</h1>
          <div style={styles.subtitle}>Panoramica vendite dal flusso scontrini</div>
        </div>

        <div style={styles.filtersWrap}>
          <button
            style={{ ...styles.filterBtn, ...(filter === "TODAY" ? styles.filterBtnActive : {}) }}
            onClick={() => setFilter("TODAY")}
          >
            Oggi
          </button>
          <button
            style={{ ...styles.filterBtn, ...(filter === "YESTERDAY" ? styles.filterBtnActive : {}) }}
            onClick={() => setFilter("YESTERDAY")}
          >
            Ieri
          </button>
          <button
            style={{ ...styles.filterBtn, ...(filter === "LAST_7_DAYS" ? styles.filterBtnActive : {}) }}
            onClick={() => setFilter("LAST_7_DAYS")}
          >
            7 giorni
          </button>
          <button
            style={{ ...styles.filterBtn, ...(filter === "LAST_30_DAYS" ? styles.filterBtnActive : {}) }}
            onClick={() => setFilter("LAST_30_DAYS")}
          >
            30 giorni
          </button>
          <button
            style={{ ...styles.filterBtn, ...(filter === "THIS_MONTH" ? styles.filterBtnActive : {}) }}
            onClick={() => setFilter("THIS_MONTH")}
          >
            Mese
          </button>
          <button
            style={{ ...styles.filterBtn, ...(filter === "ALL" ? styles.filterBtnActive : {}) }}
            onClick={() => setFilter("ALL")}
          >
            Tutto
          </button>
        </div>
      </div>

      <section style={styles.kpiGrid}>
        <KpiCard
          title="Vendite Totali Storiche"
          value={
            summaryLoading
              ? "..."
              : formatCurrency(summary?.totalSales || 0)
          }
          subtitle="Da sales_documents"
        />
        <KpiCard
          title="Ticket Medio Storico"
          value={
            summaryLoading
              ? "..."
              : formatCurrency(summary?.avgTicket || 0)
          }
          subtitle="Media documento valido"
        />
        <KpiCard
          title="Documenti Totali"
          value={
            summaryLoading
              ? "..."
              : formatNumber(summary?.documentsCount || 0)
          }
          subtitle="Conteggio documenti validi"
        />
        <KpiCard
          title="Righe Totali"
          value={
            summaryLoading
              ? "..."
              : formatNumber(summary?.linesCount || 0)
          }
          subtitle="Conteggio sales_lines"
        />
      </section>

      <section style={styles.kpiGrid}>
        <KpiCard
          title="Vendite in attesa di scarico"
          value={
            pendingAlertsLoading
              ? "..."
              : formatCurrency(pendingAlerts?.pendingSalesTotal || 0)
          }
          subtitle="Vendite con scarico sospeso"
        />
        <KpiCard
          title="Righe pending"
          value={
            pendingAlertsLoading
              ? "..."
              : formatNumber(pendingAlerts?.pendingRows || 0)
          }
          subtitle="Eventi da risolvere"
        />
        <KpiCard
          title="Elementi coinvolti"
          value={
            pendingAlertsLoading
              ? "..."
              : formatNumber(pendingAlerts?.pendingEntities || 0)
          }
          subtitle="SKU / ID / entità aperte"
        />
        <KpiCard
          title="Motivo principale"
          value={
            pendingAlertsLoading
              ? "..."
              : pendingAlerts?.byReason?.[0]?.reason || "-"
          }
          subtitle="Prima causa per volume"
        />
      </section>
      
      <section style={styles.kpiGrid}>
        <KpiCard
          title={`Vendite ${data.selectedLabel.toLowerCase()}`}
          value={formatCurrency(data.totalSales)}
          subtitle="Documenti validi"
        />
        <KpiCard
          title="Scontrini"
          value={formatNumber(data.totalReceipts)}
          subtitle={`Periodo: ${data.selectedLabel}`}
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
          <div style={styles.panelTitle}>{data.chartTitle}</div>
          <MiniBarChart data={data.salesByDay} />
        </div>

              <section style={styles.panel}>
        <div style={styles.panelTitle}>Top prodotti da dashboard summary</div>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Prodotto</th>
                <th style={styles.th}>SKU</th>
                <th style={styles.thRight}>Q.tà</th>
                <th style={styles.thRight}>Venduto</th>
              </tr>
            </thead>
            <tbody>
              {summaryLoading ? (
                <tr>
                  <td colSpan={4} style={styles.emptyTd}>
                    Caricamento...
                  </td>
                </tr>
              ) : !summary || summary.topProducts.length === 0 ? (
                <tr>
                  <td colSpan={4} style={styles.emptyTd}>
                    Nessun dato disponibile
                  </td>
                </tr>
              ) : (
                summary.topProducts.map((item) => (
                  <tr key={`${item.sku}-${item.productName}`} style={styles.tr}>
                    <td style={styles.td}>{item.productName || "-"}</td>
                    <td style={styles.td}>{item.sku || "-"}</td>
                    <td style={styles.tdRight}>{formatNumber(item.qtySold)}</td>
                    <td style={styles.tdRight}>
                      {formatCurrency(item.totalSales)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section style={styles.panel}>
        <div style={styles.panelTitle}>Vendite in attesa di scarico</div>

        <div style={styles.pendingReasonWrap}>
          {pendingAlertsLoading ? (
            <div style={styles.cardSubtitle}>Caricamento motivi...</div>
          ) : !pendingAlerts || pendingAlerts.byReason.length === 0 ? (
            <div style={styles.cardSubtitle}>Nessuna anomalia aperta</div>
          ) : (
            pendingAlerts.byReason.map((row) => (
              <span
                key={row.reason}
                style={{
                  ...styles.badge,
                  ...(row.reason === "UNMAPPED_PRODUCT"
                    ? styles.badgeWarn
                    : row.reason === "RECIPE_NOT_FOUND"
                    ? styles.badgeSoftDanger
                    : styles.badgeNeutral),
                }}
              >
                {row.reason} · {formatNumber(row.rowsCount)}
              </span>
            ))
          )}
        </div>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Elemento</th>
                <th style={styles.th}>Motivo</th>
                <th style={styles.thRight}>Righe</th>
                <th style={styles.thRight}>Q.tà</th>
                <th style={styles.thRight}>Venduto</th>
              </tr>
            </thead>
            <tbody>
              {pendingAlertsLoading ? (
                <tr>
                  <td colSpan={5} style={styles.emptyTd}>
                    Caricamento...
                  </td>
                </tr>
              ) : !pendingAlerts || pendingAlerts.topPending.length === 0 ? (
                <tr>
                  <td colSpan={5} style={styles.emptyTd}>
                    Nessuna vendita in attesa di scarico
                  </td>
                </tr>
              ) : (
                pendingAlerts.topPending.map((row) => (
                  <tr key={`${row.sku}-${row.reason}`} style={styles.tr}>
                    <td style={styles.td}>
                      <div style={styles.pendingMainText}>
                        {row.description && row.description !== "Senza descrizione"
                          ? row.description
                          : row.sku || "-"}
                      </div>
                      <div style={styles.pendingSubText}>{row.sku || "-"}</div>
                    </td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.badge,
                          ...(row.reason === "UNMAPPED_PRODUCT"
                            ? styles.badgeWarn
                            : row.reason === "RECIPE_NOT_FOUND"
                            ? styles.badgeSoftDanger
                            : styles.badgeNeutral),
                        }}
                      >
                        {row.reason}
                      </span>
                    </td>
                    <td style={styles.tdRight}>{formatNumber(row.rowsCount)}</td>
                    <td style={styles.tdRight}>{formatNumber(row.qtyTotal)}</td>
                    <td style={styles.tdRight}>{formatCurrency(row.salesTotal)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
        
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
    gap: 12,
    flexWrap: "wrap",
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

  filtersWrap: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },

  filterBtn: {
    border: "1px solid #d1d5db",
    background: "#fff",
    borderRadius: 999,
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },

  filterBtnActive: {
    background: "#111827",
    color: "#fff",
    border: "1px solid #111827",
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
  pendingReasonWrap: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 14,
  },

  pendingMainText: {
    fontSize: 14,
    fontWeight: 700,
  },

  pendingSubText: {
    fontSize: 12,
    opacity: 0.65,
    marginTop: 4,
    wordBreak: "break-all",
  },

  badgeSoftDanger: {
    background: "#fee2e2",
    color: "#991b1b",
  },

  badgeNeutral: {
    background: "#e5e7eb",
    color: "#374151",
  },
  
};
