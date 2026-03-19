import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { authFetch } from "../api/authFetch";

type InventoryStatus =
  | "DRAFT"
  | "COUNTING"
  | "CLOSED"
  | "APPLIED"
  | "CANCELLED";

type InventorySession = {
  id: string;
  tenant_id: string;
  code: string;
  name: string | null;
  status: InventoryStatus;
  effective_at: string;
  created_at?: string;
  created_by?: string | null;
  notes?: string | null;
  applied_at?: string | null;
};

type InventoryLine = {
  id: string;
  session_id: string;
  sku: string;
  theoretical_qty_bt: string | number;
  counted_qty_bt: string | number | null;
  difference_qty_bt: string | number | null;
  cost_snapshot: string | number | null;
  difference_value: string | number | null;
  note?: string | null;
  counted_by?: string | null;
  counted_at?: string | null;
};

type InventorySummary = {
  total_lines: number;
  counted_lines: number;
  missing_lines: number;
  different_lines: number;
};

type ItemLite = {
  sku: string;
  name?: string;
};

export default function InventoryPage() {
  const [sessions, setSessions] = useState<InventorySession[]>([]);
  const [items, setItems] = useState<ItemLite[]>([]);

  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<InventorySession | null>(null);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [lines, setLines] = useState<InventoryLine[]>([]);

  const [draftQtyByLineId, setDraftQtyByLineId] = useState<Record<string, string>>({});
  const [draftNoteByLineId, setDraftNoteByLineId] = useState<Record<string, string>>({});
  const [savingLineId, setSavingLineId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const itemNameBySku = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) {
      map.set(String(item.sku || "").toUpperCase(), item.name || "");
    }
    return map;
  }, [items]);

  async function loadSessions() {
    try {
      setLoadingSessions(true);
      setError(null);

      const res = await authFetch(`/inventory/sessions`);
      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Errore caricamento inventari");
      }

      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
    } catch (err: any) {
      setError(err.message || "Errore caricamento inventari");
    } finally {
      setLoadingSessions(false);
    }
  }

  async function loadItems() {
    try {
      const res = await authFetch(`/items`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    }
  }

  async function loadSessionDetail(sessionId: string) {
    try {
      setLoadingDetail(true);
      setError(null);

      const [detailRes, summaryRes] = await Promise.all([
        authFetch(`/inventory/sessions/${sessionId}`),
        authFetch(`/inventory/sessions/${sessionId}/summary`),
      ]);

      const detailData = await detailRes.json();
      const summaryData = await summaryRes.json();

      if (!detailRes.ok || !detailData?.ok) {
        throw new Error(detailData?.error || "Errore caricamento dettaglio inventario");
      }

      if (!summaryRes.ok || !summaryData?.ok) {
        throw new Error(summaryData?.error || "Errore caricamento riepilogo inventario");
      }

      const nextSession = detailData.session as InventorySession;
      const nextLines = Array.isArray(detailData.lines) ? detailData.lines : [];

      setSelectedSessionId(sessionId);
      setSelectedSession(nextSession);
      setLines(nextLines);
      setSummary(summaryData.summary ?? null);

      const qtyDrafts: Record<string, string> = {};
      const noteDrafts: Record<string, string> = {};

      for (const line of nextLines) {
        qtyDrafts[line.id] =
          line.counted_qty_bt === null || line.counted_qty_bt === undefined
            ? ""
            : String(line.counted_qty_bt);

        noteDrafts[line.id] = line.note ?? "";
      }

      setDraftQtyByLineId(qtyDrafts);
      setDraftNoteByLineId(noteDrafts);
    } catch (err: any) {
      setError(err.message || "Errore caricamento dettaglio inventario");
    } finally {
      setLoadingDetail(false);
    }
  }

  async function createSession() {
    try {
      setBusyAction("create");

      const now = new Date().toISOString();

      const res = await authFetch(`/inventory/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Inventario manuale",
          effective_at: now,
          created_by: "core-ui",
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Errore creazione inventario");
      }

      await loadSessions();

      if (data.session?.id) {
        await loadSessionDetail(data.session.id);
      }
    } catch (err: any) {
      alert(err.message || "Errore creazione inventario");
    } finally {
      setBusyAction(null);
    }
  }

  async function generateLines(sessionId: string) {
    try {
      setBusyAction(`generate:${sessionId}`);

      const res = await authFetch(`/inventory/sessions/${sessionId}/generate-lines`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Errore generazione righe");
      }

      await loadSessions();
      await loadSessionDetail(sessionId);
    } catch (err: any) {
      alert(err.message || "Errore generazione righe");
    } finally {
      setBusyAction(null);
    }
  }

  async function closeSession(sessionId: string) {
    try {
      setBusyAction(`close:${sessionId}`);

      const res = await authFetch(`/inventory/sessions/${sessionId}/close`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Errore chiusura inventario");
      }

      await loadSessions();
      await loadSessionDetail(sessionId);
    } catch (err: any) {
      alert(err.message || "Errore chiusura inventario");
    } finally {
      setBusyAction(null);
    }
  }

  async function reopenSession(sessionId: string) {
    try {
      setBusyAction(`reopen:${sessionId}`);

      const res = await authFetch(`/inventory/sessions/${sessionId}/reopen`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Errore riapertura inventario");
      }

      await loadSessions();
      await loadSessionDetail(sessionId);
    } catch (err: any) {
      alert(err.message || "Errore riapertura inventario");
    } finally {
      setBusyAction(null);
    }
  }

  async function applySession(sessionId: string) {
    try {
      setBusyAction(`apply:${sessionId}`);

      const res = await authFetch(`/inventory/sessions/${sessionId}/apply`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Errore applicazione inventario");
      }

      await loadSessions();
      await loadSessionDetail(sessionId);
    } catch (err: any) {
      alert(err.message || "Errore applicazione inventario");
    } finally {
      setBusyAction(null);
    }
  }

  async function cancelSession(sessionId: string) {
    try {
      setBusyAction(`cancel:${sessionId}`);

      const res = await authFetch(`/inventory/sessions/${sessionId}/cancel`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Errore annullamento inventario");
      }

      await loadSessions();

      if (selectedSessionId === sessionId) {
        await loadSessionDetail(sessionId);
      }
    } catch (err: any) {
      alert(err.message || "Errore annullamento inventario");
    } finally {
      setBusyAction(null);
    }
  }

  async function saveLine(line: InventoryLine) {
    try {
      const qtyRaw = draftQtyByLineId[line.id] ?? "";
      const noteRaw = draftNoteByLineId[line.id] ?? "";

      if (qtyRaw.trim() === "") {
        alert("Inserisci una quantità contata");
        return;
      }

      const countedQty = Number(qtyRaw.replace(",", "."));

      if (!Number.isFinite(countedQty)) {
        alert("La quantità contata deve essere numerica");
        return;
      }

      setSavingLineId(line.id);

      const res = await authFetch(`/inventory/lines/${line.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          counted_qty_bt: countedQty,
          note: noteRaw || null,
          counted_by: "core-ui",
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Errore salvataggio riga");
      }

      if (!selectedSessionId) return;

      await loadSessionDetail(selectedSessionId);
    } catch (err: any) {
      alert(err.message || "Errore salvataggio riga");
    } finally {
      setSavingLineId(null);
    }
  }

  useEffect(() => {
    loadSessions();
    loadItems();
  }, []);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Inventario</h2>
          <div style={styles.subtitle}>
            Sessioni inventario e conteggio magazzino
          </div>
        </div>

        <div style={styles.headerActions}>
          <button
            style={styles.primaryBtn}
            onClick={createSession}
            disabled={busyAction === "create"}
          >
            + Nuovo inventario
          </button>

          <button style={styles.reloadBtn} onClick={loadSessions}>
            Ricarica
          </button>
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.layout}>
        <div style={styles.leftCol}>
          {loadingSessions ? (
            <div style={styles.info}>Caricamento inventari...</div>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Codice</th>
                    <th style={styles.th}>Nome</th>
                    <th style={styles.th}>Stato</th>
                    <th style={styles.th}>Data inventario</th>
                    <th style={styles.th}>Azioni</th>
                  </tr>
                </thead>

                <tbody>
                  {sessions.length === 0 ? (
                    <tr>
                      <td style={styles.empty} colSpan={5}>
                        Nessuna sessione inventario trovata
                      </td>
                    </tr>
                  ) : (
                    sessions.map((s) => (
                      <tr
                        key={s.id}
                        style={
                          selectedSessionId === s.id ? styles.selectedRow : undefined
                        }
                      >
                        <td style={styles.td}>{s.code}</td>
                        <td style={styles.td}>{s.name || "-"}</td>
                        <td style={styles.td}>
                          <span style={badgeStyle(s.status)}>{s.status}</span>
                        </td>
                        <td style={styles.td}>{formatDateTime(s.effective_at)}</td>
                        <td style={styles.td}>
                          <div style={styles.actionWrap}>
                            <button
                              style={styles.actionBtn}
                              onClick={() => loadSessionDetail(s.id)}
                            >
                              Apri
                            </button>

                            {s.status === "DRAFT" && (
                              <button
                                style={styles.actionBtn}
                                onClick={() => generateLines(s.id)}
                                disabled={busyAction === `generate:${s.id}`}
                              >
                                Genera righe
                              </button>
                            )}

                            {s.status === "COUNTING" && (
                              <button
                                style={styles.actionBtn}
                                onClick={() => closeSession(s.id)}
                                disabled={busyAction === `close:${s.id}`}
                              >
                                Chiudi
                              </button>
                            )}

                            {s.status === "CLOSED" && (
                              <>
                                <button
                                  style={styles.actionBtn}
                                  onClick={() => reopenSession(s.id)}
                                  disabled={busyAction === `reopen:${s.id}`}
                                >
                                  Riapri
                                </button>

                                <button
                                  style={styles.successBtn}
                                  onClick={() => applySession(s.id)}
                                  disabled={busyAction === `apply:${s.id}`}
                                >
                                  Applica
                                </button>
                              </>
                            )}

                            {s.status !== "APPLIED" && s.status !== "CANCELLED" && (
                              <button
                                style={styles.dangerBtn}
                                onClick={() => cancelSession(s.id)}
                                disabled={busyAction === `cancel:${s.id}`}
                              >
                                Annulla
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={styles.rightCol}>
          {!selectedSession ? (
            <div style={styles.placeholder}>
              Seleziona un inventario e premi <strong>Apri</strong> per vedere il
              dettaglio.
            </div>
          ) : (
            <div style={styles.detailCard}>
              <div style={styles.detailHeader}>
                <div>
                  <h3 style={styles.detailTitle}>
                    {selectedSession.code} · {selectedSession.name || "Inventario"}
                  </h3>
                  <div style={styles.detailMeta}>
                    Stato:{" "}
                    <span style={badgeStyle(selectedSession.status)}>
                      {selectedSession.status}
                    </span>
                  </div>
                  <div style={styles.detailMeta}>
                    Data inventario: {formatDateTime(selectedSession.effective_at)}
                  </div>
                  <div style={styles.detailMeta}>
                    Creato da: {selectedSession.created_by || "-"}
                  </div>
                </div>
              </div>

              {summary && (
                <div style={styles.summaryGrid}>
                  <SummaryBox label="Righe totali" value={summary.total_lines} />
                  <SummaryBox label="Contate" value={summary.counted_lines} />
                  <SummaryBox label="Mancanti" value={summary.missing_lines} />
                  <SummaryBox label="Differenze" value={summary.different_lines} />
                </div>
              )}

              {loadingDetail ? (
                <div style={styles.info}>Caricamento dettaglio inventario...</div>
              ) : (
                <div style={styles.detailTableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>SKU</th>
                        <th style={styles.th}>Articolo</th>
                        <th style={styles.th}>Teorico</th>
                        <th style={styles.th}>Contato</th>
                        <th style={styles.th}>Differenza</th>
                        <th style={styles.th}>Valore €</th>
                        <th style={styles.th}>Note</th>
                        <th style={styles.th}>Salva</th>
                      </tr>
                    </thead>

                    <tbody>
                      {lines.length === 0 ? (
                        <tr>
                          <td style={styles.empty} colSpan={8}>
                            Nessuna riga inventario presente
                          </td>
                        </tr>
                      ) : (
                        lines.map((line) => {
                          const theoretical = toNumber(line.theoretical_qty_bt);
                          const counted =
                            draftQtyByLineId[line.id] === ""
                              ? null
                              : toNumber(draftQtyByLineId[line.id]);
                          const diff =
                            counted === null ? null : counted - theoretical;

                          const currentValueCents =
                            diff !== null && line.cost_snapshot !== null
                              ? diff * toNumber(line.cost_snapshot)
                              : null;

                          const isEditable =
                            selectedSession.status === "COUNTING" ||
                            selectedSession.status === "CLOSED";

                          return (
                            <tr key={line.id}>
                              <td style={styles.td}>{line.sku}</td>
                              <td style={styles.td}>
                                {itemNameBySku.get(String(line.sku).toUpperCase()) || "-"}
                              </td>
                              <td style={styles.td}>{formatQty(line.theoretical_qty_bt)}</td>

                              <td style={styles.td}>
                                <input
                                  style={styles.input}
                                  value={draftQtyByLineId[line.id] ?? ""}
                                  disabled={!isEditable}
                                  onChange={(e) =>
                                    setDraftQtyByLineId((prev) => ({
                                      ...prev,
                                      [line.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="0"
                                />
                              </td>

                              <td style={styles.td}>
                                {diff === null ? "-" : formatNumber(diff)}
                              </td>

                              <td style={styles.td}>
                                {currentValueCents === null
                                  ? "-"
                                  : formatCurrency(currentValueCents / 100)}
                              </td>

                              <td style={styles.td}>
                                <input
                                  style={styles.input}
                                  value={draftNoteByLineId[line.id] ?? ""}
                                  disabled={!isEditable}
                                  onChange={(e) =>
                                    setDraftNoteByLineId((prev) => ({
                                      ...prev,
                                      [line.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="Note"
                                />
                              </td>

                              <td style={styles.td}>
                                <button
                                  style={styles.actionBtn}
                                  disabled={!isEditable || savingLineId === line.id}
                                  onClick={() => saveLine(line)}
                                >
                                  {savingLineId === line.id ? "Salvataggio..." : "Salva"}
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryBox({ label, value }: { label: string; value: number }) {
  return (
    <div style={styles.summaryBox}>
      <div style={styles.summaryLabel}>{label}</div>
      <div style={styles.summaryValue}>{value}</div>
    </div>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("it-IT");
}

function toNumber(v: string | number | null | undefined) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatQty(v: string | number | null | undefined) {
  if (v === null || v === undefined) return "-";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("it-IT", { maximumFractionDigits: 3 });
}

function formatNumber(v: number) {
  return v.toLocaleString("it-IT", { maximumFractionDigits: 3 });
}

function formatCurrency(v: number) {
  return v.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
  });
}

function badgeStyle(status: InventoryStatus): CSSProperties {
  const base: CSSProperties = {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid #ddd",
  };

  switch (status) {
    case "DRAFT":
      return { ...base, background: "#fff7d6", borderColor: "#f1d36b" };
    case "COUNTING":
      return { ...base, background: "#dff3ff", borderColor: "#86c8f2" };
    case "CLOSED":
      return { ...base, background: "#f3e8ff", borderColor: "#c7a5ff" };
    case "APPLIED":
      return { ...base, background: "#e3f7e8", borderColor: "#8ad19a" };
    case "CANCELLED":
      return { ...base, background: "#f3f3f3", borderColor: "#cfcfcf" };
    default:
      return base;
  }
}

const styles: Record<string, CSSProperties> = {
  page: {
    padding: 16,
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
  },

  headerActions: {
    display: "flex",
    gap: 10,
  },

  title: {
    margin: 0,
    fontSize: 24,
  },

  subtitle: {
    marginTop: 4,
    color: "#666",
    fontSize: 14,
  },

  layout: {
    display: "grid",
    gridTemplateColumns: "1.05fr 1.35fr",
    gap: 16,
    alignItems: "start",
  },

  leftCol: {
    minWidth: 0,
  },

  rightCol: {
    minWidth: 0,
  },

  primaryBtn: {
    border: "none",
    background: "#0B7285",
    color: "white",
    borderRadius: 10,
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 700,
  },

  reloadBtn: {
    border: "1px solid #ddd",
    background: "#fff",
    borderRadius: 10,
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 600,
  },

  actionWrap: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
  },

  actionBtn: {
    border: "1px solid #ddd",
    background: "#fff",
    borderRadius: 8,
    padding: "6px 10px",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 12,
  },

  successBtn: {
    border: "1px solid #8ad19a",
    background: "#e3f7e8",
    borderRadius: 8,
    padding: "6px 10px",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 12,
  },

  dangerBtn: {
    border: "1px solid #f0b1b1",
    background: "#fff1f1",
    borderRadius: 8,
    padding: "6px 10px",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 12,
    color: "#8a1f1f",
  },

  info: {
    padding: 12,
    borderRadius: 10,
    background: "#f7f7f7",
  },

  error: {
    padding: 12,
    borderRadius: 10,
    background: "#ffe5e5",
    color: "#8a1f1f",
    border: "1px solid #f2b1b1",
    marginBottom: 16,
  },

  tableWrap: {
    overflowX: "auto",
    border: "1px solid #e5e5e5",
    borderRadius: 14,
    background: "#fff",
  },

  detailTableWrap: {
    overflowX: "auto",
    border: "1px solid #ececec",
    borderRadius: 12,
    background: "#fff",
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
  },

  th: {
    textAlign: "left",
    padding: 12,
    borderBottom: "1px solid #ececec",
    fontSize: 13,
    color: "#555",
    background: "#fafafa",
    whiteSpace: "nowrap",
  },

  td: {
    padding: 12,
    borderBottom: "1px solid #f2f2f2",
    fontSize: 14,
    verticalAlign: "middle",
  },

  empty: {
    padding: 20,
    textAlign: "center",
    color: "#777",
  },

  selectedRow: {
    background: "#f8fcff",
  },

  placeholder: {
    padding: 20,
    borderRadius: 14,
    border: "1px dashed #cfd8dc",
    background: "#fff",
    color: "#52606D",
  },

  detailCard: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    border: "1px solid #e5e5e5",
    borderRadius: 14,
    background: "#fff",
    padding: 16,
  },

  detailHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },

  detailTitle: {
    margin: 0,
    fontSize: 20,
  },

  detailMeta: {
    marginTop: 6,
    fontSize: 13,
    color: "#52606D",
  },

  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 10,
  },

  summaryBox: {
    border: "1px solid #ececec",
    borderRadius: 12,
    padding: 12,
    background: "#fafafa",
  },

  summaryLabel: {
    fontSize: 12,
    color: "#667085",
    marginBottom: 6,
  },

  summaryValue: {
    fontSize: 22,
    fontWeight: 800,
    color: "#243B53",
  },

  input: {
    width: "100%",
    minWidth: 90,
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #d9e2ec",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  },
};
