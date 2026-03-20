import { useEffect, useMemo, useState } from "react";
import { authFetch } from "../api/authFetch";

type CashClosureStatus =
  | "DRAFT"
  | "CLOSED"
  | "VERIFIED"
  | "CANCELLED";

type CashClosure = {
  id: string;
  tenant_id: string;

  business_date: string;
  operator_id: string | null;
  operator_name: string | null;

  theoretical_base: number;

  cash_declared: number;
  card_declared: number;
  satispay_declared: number;
  other_declared: number;

  declared_total: number;
  delta: number;

  receipt_image_url: string | null;
  receipt_image_name: string | null;

  notes: string | null;

  status: CashClosureStatus;
  alert_flags: string[];

  email_sent: boolean;
  email_sent_at: string | null;
  email_error: string | null;

  closed_at: string | null;
  verified_at: string | null;
  verified_by: string | null;

  created_at: string;
  updated_at: string;
};

type FormState = {
  business_date: string;
  operator_id: string;
  operator_name: string;
  theoretical_base: string;
  cash_declared: string;
  card_declared: string;
  satispay_declared: string;
  other_declared: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  business_date: todayLocalDate(),
  operator_id: "",
  operator_name: "",
  theoretical_base: "",
  cash_declared: "",
  card_declared: "",
  satispay_declared: "",
  other_declared: "",
  notes: "",
};

function todayLocalDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseMoney(value: string) {
  if (!value.trim()) return 0;
  const normalized = value.replace(",", ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value || 0);
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("it-IT");
}

function statusLabel(status: CashClosureStatus) {
  switch (status) {
    case "DRAFT":
      return "Bozza";
    case "CLOSED":
      return "Chiusa";
    case "VERIFIED":
      return "Verificata";
    case "CANCELLED":
      return "Annullata";
    default:
      return status;
  }
}

function alertLabel(code: string) {
  switch (code) {
    case "MISSING_RECEIPT_IMAGE":
      return "Foto scontrino mancante";
    case "DELTA_OVER_THRESHOLD":
      return "Delta oltre soglia";
    case "ALL_VALUES_ZERO":
      return "Tutti i valori a zero";
    case "DECLARED_ZERO_WITH_THEORETICAL":
      return "Dichiarato zero con teorico > 0";
    default:
      return code;
  }
}

export default function CashClosurePage() {
  const [rows, setRows] = useState<CashClosure[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<CashClosure | null>(null);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");

  const theoreticalBase = parseMoney(form.theoretical_base);
  const cashDeclared = parseMoney(form.cash_declared);
  const cardDeclared = parseMoney(form.card_declared);
  const satispayDeclared = parseMoney(form.satispay_declared);
  const otherDeclared = parseMoney(form.other_declared);

  const declaredTotal = useMemo(() => {
    return cashDeclared + cardDeclared + satispayDeclared + otherDeclared;
  }, [cashDeclared, cardDeclared, satispayDeclared, otherDeclared]);

  const delta = useMemo(() => {
    return declaredTotal - theoreticalBase;
  }, [declaredTotal, theoreticalBase]);

  const isDraft = selected?.status === "DRAFT";
  const hasSelected = !!selected;

  useEffect(() => {
    void loadRows();
  }, []);

  async function loadRows() {
    setLoadingList(true);
    setError("");
    try {
      const res = await authFetch("/cash-closures");
      if (!res.ok) throw new Error("Errore caricamento chiusure");
      const data = (await res.json()) as CashClosure[];
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || "Errore caricamento elenco");
    } finally {
      setLoadingList(false);
    }
  }

  async function loadDetail(id: string) {
    setLoadingDetail(true);
    setError("");
    setMessage("");
    try {
      const res = await authFetch(`/cash-closures/${id}`);
      if (!res.ok) throw new Error("Errore caricamento dettaglio");
      const data = (await res.json()) as CashClosure;
      setSelected(data);
      setSelectedId(data.id);
      setForm({
        business_date: data.business_date.slice(0, 10),
        operator_id: data.operator_id ?? "",
        operator_name: data.operator_name ?? "",
        theoretical_base: String(data.theoretical_base ?? ""),
        cash_declared: String(data.cash_declared ?? ""),
        card_declared: String(data.card_declared ?? ""),
        satispay_declared: String(data.satispay_declared ?? ""),
        other_declared: String(data.other_declared ?? ""),
        notes: data.notes ?? "",
      });
    } catch (err: any) {
      setError(err?.message || "Errore caricamento dettaglio");
    } finally {
      setLoadingDetail(false);
    }
  }

  function resetForNew() {
    setSelected(null);
    setSelectedId(null);
    setForm({
      ...EMPTY_FORM,
      business_date: todayLocalDate(),
    });
    setMessage("");
    setError("");
  }

  function patchForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const payload = {
        business_date: form.business_date,
        operator_id: form.operator_id || null,
        operator_name: form.operator_name || null,
        theoretical_base: theoreticalBase,
        cash_declared: cashDeclared,
        card_declared: cardDeclared,
        satispay_declared: satispayDeclared,
        other_declared: otherDeclared,
        notes: form.notes || null,
      };

      const isUpdate = !!selectedId;

      const res = await authFetch(
        isUpdate ? `/cash-closures/${selectedId}` : "/cash-closures",
        {
          method: isUpdate ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Errore salvataggio");
      }

      setMessage(isUpdate ? "Bozza aggiornata" : "Bozza creata");
      await loadRows();
      await loadDetail(json.id);
    } catch (err: any) {
      setError(err?.message || "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  }

  async function handleCloseCash() {
    if (!selectedId) return;

    const ok = window.confirm(
      "Confermi la chiusura cassa? Dopo non sarà più modificabile dall'operatore."
    );
    if (!ok) return;

    setClosing(true);
    setError("");
    setMessage("");

    try {
      const res = await authFetch(`/cash-closures/${selectedId}/close`, {
        method: "POST",
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Errore chiusura cassa");
      }

      setMessage("Cassa chiusa correttamente");
      await loadRows();
      await loadDetail(selectedId);
    } catch (err: any) {
      setError(err?.message || "Errore chiusura");
    } finally {
      setClosing(false);
    }
  }

  async function handleUploadReceipt(file: File) {
    if (!selectedId) {
      setError("Salva prima la bozza, poi carica la foto scontrino");
      return;
    }

    setUploading(true);
    setError("");
    setMessage("");

    try {
      const fd = new FormData();
      fd.append("receipt", file);

      const res = await authFetch(`/cash-closures/${selectedId}/receipt`, {
        method: "POST",
        body: fd,
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Errore upload scontrino");
      }

      setMessage("Foto scontrino caricata");
      await loadRows();
      await loadDetail(selectedId);
    } catch (err: any) {
      setError(err?.message || "Errore upload");
    } finally {
      setUploading(false);
    }
  }

  const deltaTone =
    delta === 0 ? "#166534" : Math.abs(delta) <= 5 ? "#a16207" : "#b91c1c";

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Chiusura cassa</h1>
          <div style={styles.subtitle}>
            Mobile-first, veloce, pensata per operatore
          </div>
        </div>

        <button type="button" onClick={resetForNew} style={styles.primaryButton}>
          Nuova chiusura
        </button>
      </div>

      {!!message && <div style={styles.successBox}>{message}</div>}
      {!!error && <div style={styles.errorBox}>{error}</div>}

      <div style={styles.layout}>
        <section style={styles.leftCol}>
          <div style={styles.card}>
            <div style={styles.cardTitleRow}>
              <h2 style={styles.cardTitle}>Bozza / dettaglio</h2>
              {loadingDetail && <span style={styles.muted}>Caricamento...</span>}
            </div>

            <div style={styles.formGrid}>
              <label style={styles.field}>
                <span style={styles.label}>Data competenza</span>
                <input
                  type="date"
                  value={form.business_date}
                  onChange={(e) => patchForm("business_date", e.target.value)}
                  style={styles.input}
                  disabled={hasSelected && !isDraft}
                />
              </label>

              <label style={styles.field}>
                <span style={styles.label}>Operatore ID</span>
                <input
                  type="text"
                  value={form.operator_id}
                  onChange={(e) => patchForm("operator_id", e.target.value)}
                  placeholder="es. usr_001"
                  style={styles.input}
                  disabled={hasSelected && !isDraft}
                />
              </label>

              <label style={styles.field}>
                <span style={styles.label}>Operatore nome</span>
                <input
                  type="text"
                  value={form.operator_name}
                  onChange={(e) => patchForm("operator_name", e.target.value)}
                  placeholder="es. Fabio"
                  style={styles.input}
                  disabled={hasSelected && !isDraft}
                />
              </label>

              <label style={styles.field}>
                <span style={styles.label}>Teorico base</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={form.theoretical_base}
                  onChange={(e) => patchForm("theoretical_base", e.target.value)}
                  placeholder="0,00"
                  style={styles.bigInput}
                  disabled={hasSelected && !isDraft}
                />
              </label>

              <label style={styles.field}>
                <span style={styles.label}>Contanti</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={form.cash_declared}
                  onChange={(e) => patchForm("cash_declared", e.target.value)}
                  placeholder="0,00"
                  style={styles.bigInput}
                  disabled={hasSelected && !isDraft}
                />
              </label>

              <label style={styles.field}>
                <span style={styles.label}>Carte</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={form.card_declared}
                  onChange={(e) => patchForm("card_declared", e.target.value)}
                  placeholder="0,00"
                  style={styles.bigInput}
                  disabled={hasSelected && !isDraft}
                />
              </label>

              <label style={styles.field}>
                <span style={styles.label}>Satispay</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={form.satispay_declared}
                  onChange={(e) => patchForm("satispay_declared", e.target.value)}
                  placeholder="0,00"
                  style={styles.bigInput}
                  disabled={hasSelected && !isDraft}
                />
              </label>

              <label style={styles.field}>
                <span style={styles.label}>Altri</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={form.other_declared}
                  onChange={(e) => patchForm("other_declared", e.target.value)}
                  placeholder="0,00"
                  style={styles.bigInput}
                  disabled={hasSelected && !isDraft}
                />
              </label>
            </div>

            <div style={styles.resultGrid}>
              <div style={styles.resultCard}>
                <div style={styles.resultLabel}>Totale dichiarato</div>
                <div style={styles.resultValue}>{formatMoney(declaredTotal)}</div>
              </div>

              <div style={{ ...styles.resultCard, borderColor: deltaTone }}>
                <div style={styles.resultLabel}>Delta</div>
                <div style={{ ...styles.resultValue, color: deltaTone }}>
                  {formatMoney(delta)}
                </div>
              </div>
            </div>

            <label style={styles.field}>
              <span style={styles.label}>Note</span>
              <textarea
                value={form.notes}
                onChange={(e) => patchForm("notes", e.target.value)}
                placeholder="Note operative"
                style={styles.textarea}
                disabled={hasSelected && !isDraft}
              />
            </label>

            <div style={styles.uploadBox}>
              <div>
                <div style={styles.label}>Foto scontrino</div>
                <div style={styles.muted}>
                  {selected?.receipt_image_name
                    ? `Caricata: ${selected.receipt_image_name}`
                    : "Nessuna foto caricata"}
                </div>
              </div>

              <label
                style={{
                  ...styles.secondaryButton,
                  opacity: !selectedId || !isDraft ? 0.6 : 1,
                  cursor: !selectedId || !isDraft ? "not-allowed" : "pointer",
                }}
              >
                {uploading ? "Caricamento..." : "Carica foto"}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  disabled={!selectedId || !isDraft || uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleUploadReceipt(file);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            </div>

            {!!selected?.receipt_image_url && (
              <div style={styles.receiptPreviewBox}>
                <a
                  href={selected.receipt_image_url}
                  target="_blank"
                  rel="noreferrer"
                  style={styles.link}
                >
                  Apri immagine scontrino
                </a>
              </div>
            )}

            {!!selected?.alert_flags?.length && (
              <div style={styles.alertBox}>
                <div style={styles.alertTitle}>Alert</div>
                <div style={styles.alertList}>
                  {selected.alert_flags.map((a) => (
                    <span key={a} style={styles.alertBadge}>
                      {alertLabel(a)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={styles.actionRow}>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || (hasSelected && !isDraft)}
                style={{
                  ...styles.primaryButton,
                  opacity: saving || (hasSelected && !isDraft) ? 0.6 : 1,
                }}
              >
                {saving ? "Salvataggio..." : selectedId ? "Salva bozza" : "Crea bozza"}
              </button>

              <button
                type="button"
                onClick={handleCloseCash}
                disabled={!selectedId || !isDraft || closing}
                style={{
                  ...styles.closeButton,
                  opacity: !selectedId || !isDraft || closing ? 0.6 : 1,
                }}
              >
                {closing ? "Chiusura..." : "Chiudi cassa"}
              </button>
            </div>

            {selected && (
              <div style={styles.metaBox}>
                <div><strong>Stato:</strong> {statusLabel(selected.status)}</div>
                <div><strong>Creata:</strong> {formatDateTime(selected.created_at)}</div>
                <div><strong>Aggiornata:</strong> {formatDateTime(selected.updated_at)}</div>
                <div><strong>Chiusa:</strong> {formatDateTime(selected.closed_at)}</div>
                <div>
                  <strong>Email inviata:</strong> {selected.email_sent ? "Sì" : "No"}
                </div>
                {selected.email_error && (
                  <div><strong>Errore email:</strong> {selected.email_error}</div>
                )}
              </div>
            )}
          </div>
        </section>

        <aside style={styles.rightCol}>
          <div style={styles.card}>
            <div style={styles.cardTitleRow}>
              <h2 style={styles.cardTitle}>Storico chiusure</h2>
              <button type="button" onClick={loadRows} style={styles.linkButton}>
                Aggiorna
              </button>
            </div>

            {loadingList ? (
              <div style={styles.muted}>Caricamento...</div>
            ) : rows.length === 0 ? (
              <div style={styles.emptyBox}>Nessuna chiusura presente</div>
            ) : (
              <div style={styles.list}>
                {rows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => void loadDetail(row.id)}
                    style={{
                      ...styles.listItem,
                      border:
                        row.id === selectedId
                          ? "2px solid #111827"
                          : "1px solid #e5e7eb",
                    }}
                  >
                    <div style={styles.listItemTop}>
                      <span style={styles.listDate}>{row.business_date.slice(0, 10)}</span>
                      <span style={styles.statusBadge(row.status)}>
                        {statusLabel(row.status)}
                      </span>
                    </div>

                    <div style={styles.listName}>
                      {row.operator_name || row.operator_id || "Operatore"}
                    </div>

                    <div style={styles.listAmounts}>
                      <span>Teorico: {formatMoney(row.theoretical_base)}</span>
                      <span>Dich.: {formatMoney(row.declared_total)}</span>
                    </div>

                    <div
                      style={{
                        ...styles.deltaInline,
                        color:
                          row.delta === 0
                            ? "#166534"
                            : Math.abs(row.delta) <= 5
                              ? "#a16207"
                              : "#b91c1c",
                      }}
                    >
                      Delta {formatMoney(row.delta)}
                    </div>

                    {!!row.alert_flags?.length && (
                      <div style={styles.inlineBadges}>
                        {row.alert_flags.map((a) => (
                          <span key={a} style={styles.miniBadge}>
                            {alertLabel(a)}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

const styles: Record<string, any> = {
  page: {
    padding: 16,
    maxWidth: 1200,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
  },

  title: {
    margin: 0,
    fontSize: 28,
    lineHeight: 1.1,
    fontWeight: 800,
    color: "#111827",
  },

  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: "#6b7280",
  },

  layout: {
    display: "grid",
    gridTemplateColumns: "1.35fr 0.85fr",
    gap: 16,
  },

  leftCol: {
    minWidth: 0,
  },

  rightCol: {
    minWidth: 0,
  },

  card: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 20,
    padding: 16,
    boxShadow: "0 8px 24px rgba(17,24,39,0.06)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },

  cardTitleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  cardTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
    color: "#111827",
  },

  formGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },

  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },

  label: {
    fontSize: 13,
    fontWeight: 700,
    color: "#374151",
  },

  input: {
    width: "100%",
    minHeight: 44,
    borderRadius: 12,
    border: "1px solid #d1d5db",
    padding: "10px 12px",
    fontSize: 16,
    background: "#fff",
    color: "#111827",
    boxSizing: "border-box",
  },

  bigInput: {
    width: "100%",
    minHeight: 52,
    borderRadius: 14,
    border: "1px solid #d1d5db",
    padding: "12px 14px",
    fontSize: 22,
    fontWeight: 700,
    background: "#fff",
    color: "#111827",
    boxSizing: "border-box",
  },

  textarea: {
    width: "100%",
    minHeight: 100,
    borderRadius: 12,
    border: "1px solid #d1d5db",
    padding: "10px 12px",
    fontSize: 15,
    background: "#fff",
    color: "#111827",
    boxSizing: "border-box",
    resize: "vertical",
  },

  resultGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },

  resultCard: {
    border: "2px solid #e5e7eb",
    borderRadius: 18,
    padding: 16,
    background: "#f9fafb",
  },

  resultLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: "#6b7280",
    marginBottom: 8,
  },

  resultValue: {
    fontSize: 26,
    fontWeight: 800,
    color: "#111827",
  },

  uploadBox: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
    border: "1px dashed #cbd5e1",
    borderRadius: 16,
    padding: 14,
    background: "#f8fafc",
  },

  receiptPreviewBox: {
    padding: 12,
    borderRadius: 14,
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
  },

  alertBox: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 14,
    borderRadius: 16,
    border: "1px solid #fde68a",
    background: "#fffbeb",
  },

  alertTitle: {
    fontSize: 14,
    fontWeight: 800,
    color: "#92400e",
  },

  alertList: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },

  alertBadge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "7px 10px",
    borderRadius: 999,
    background: "#fef3c7",
    color: "#92400e",
    fontSize: 12,
    fontWeight: 700,
  },

  actionRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
  },

  primaryButton: {
    minHeight: 48,
    borderRadius: 14,
    border: "none",
    padding: "0 16px",
    background: "#111827",
    color: "#fff",
    fontSize: 15,
    fontWeight: 800,
    cursor: "pointer",
  },

  secondaryButton: {
    minHeight: 44,
    borderRadius: 12,
    border: "1px solid #d1d5db",
    padding: "0 14px",
    background: "#fff",
    color: "#111827",
    fontSize: 14,
    fontWeight: 700,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },

  closeButton: {
    minHeight: 48,
    borderRadius: 14,
    border: "none",
    padding: "0 16px",
    background: "#b91c1c",
    color: "#fff",
    fontSize: 15,
    fontWeight: 800,
    cursor: "pointer",
  },

  successBox: {
    padding: 12,
    borderRadius: 14,
    background: "#ecfdf5",
    border: "1px solid #a7f3d0",
    color: "#065f46",
    fontWeight: 700,
  },

  errorBox: {
    padding: 12,
    borderRadius: 14,
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#991b1b",
    fontWeight: 700,
  },

  metaBox: {
    display: "grid",
    gap: 6,
    padding: 12,
    borderRadius: 14,
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    fontSize: 14,
    color: "#374151",
  },

  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  listItem: {
    textAlign: "left" as const,
    width: "100%",
    borderRadius: 16,
    background: "#fff",
    padding: 14,
    cursor: "pointer",
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },

  listItemTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    alignItems: "center",
  },

  listDate: {
    fontSize: 13,
    fontWeight: 700,
    color: "#6b7280",
  },

  listName: {
    fontSize: 16,
    fontWeight: 800,
    color: "#111827",
  },

  listAmounts: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
    fontSize: 13,
    color: "#4b5563",
  },

  deltaInline: {
    fontWeight: 800,
    fontSize: 14,
  },

  inlineBadges: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 6,
  },

  miniBadge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 8px",
    borderRadius: 999,
    background: "#f3f4f6",
    color: "#374151",
    fontSize: 11,
    fontWeight: 700,
  },

  emptyBox: {
    padding: 18,
    borderRadius: 14,
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    color: "#6b7280",
  },

  muted: {
    color: "#6b7280",
    fontSize: 13,
  },

  link: {
    color: "#2563eb",
    textDecoration: "none",
    fontWeight: 700,
  },

  linkButton: {
    border: "none",
    background: "transparent",
    color: "#2563eb",
    fontWeight: 700,
    cursor: "pointer",
    padding: 0,
  },

  statusBadge: (status: CashClosureStatus) => {
    const map: Record<CashClosureStatus, { bg: string; color: string }> = {
      DRAFT: { bg: "#e0f2fe", color: "#075985" },
      CLOSED: { bg: "#dcfce7", color: "#166534" },
      VERIFIED: { bg: "#ede9fe", color: "#5b21b6" },
      CANCELLED: { bg: "#fee2e2", color: "#991b1b" },
    };

    return {
      display: "inline-flex",
      alignItems: "center",
      padding: "5px 9px",
      borderRadius: 999,
      background: map[status].bg,
      color: map[status].color,
      fontSize: 11,
      fontWeight: 800,
    };
  },
};

if (typeof window !== "undefined") {
  const styleId = "cash-closure-mobile-style";
  if (!document.getElementById(styleId)) {
    const el = document.createElement("style");
    el.id = styleId;
    el.innerHTML = `
      @media (max-width: 900px) {
        .cash-closure-page-grid-fallback {}
      }
      @media (max-width: 900px) {
        body {
          -webkit-text-size-adjust: 100%;
        }
      }
      @media (max-width: 900px) {
        div[style*="grid-template-columns: 1.35fr 0.85fr"] {
          grid-template-columns: 1fr !important;
        }
        div[style*="grid-template-columns: 1fr 1fr"] {
          grid-template-columns: 1fr !important;
        }
      }
    `;
    document.head.appendChild(el);
  }
}
