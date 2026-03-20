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
  business_date: getTodayLocalDate(),
  operator_id: "",
  operator_name: "",
  theoretical_base: "",
  cash_declared: "",
  card_declared: "",
  satispay_declared: "",
  other_declared: "",
  notes: "",
};

function getTodayLocalDate() {
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

function badgeStyle(status: CashClosureStatus): React.CSSProperties {
  if (status === "DRAFT") {
    return {
      background: "#E0F2FE",
      color: "#075985",
      border: "1px solid #BAE6FD",
    };
  }

  if (status === "CLOSED") {
    return {
      background: "#DCFCE7",
      color: "#166534",
      border: "1px solid #BBF7D0",
    };
  }

  if (status === "VERIFIED") {
    return {
      background: "#EDE9FE",
      color: "#5B21B6",
      border: "1px solid #DDD6FE",
    };
  }

  return {
    background: "#FEE2E2",
    color: "#991B1B",
    border: "1px solid #FECACA",
  };
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

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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
  const canEdit = !selected || isDraft;

  const deltaColor =
    delta === 0 ? "#166534" : Math.abs(delta) <= 5 ? "#B45309" : "#B91C1C";

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

  function handleNew() {
    setSelected(null);
    setSelectedId(null);
    setForm({
      ...EMPTY_FORM,
      business_date: getTodayLocalDate(),
    });
    setMessage("");
    setError("");
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
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

      const res = await authFetch(
        selectedId ? `/cash-closures/${selectedId}` : "/cash-closures",
        {
          method: selectedId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Errore salvataggio");
      }

      setMessage(selectedId ? "Bozza aggiornata" : "Bozza creata");
      await loadRows();
      await loadDetail(json.id);
    } catch (err: any) {
      setError(err?.message || "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  }

  async function handleClose() {
    if (!selectedId) return;

    const ok = window.confirm(
      "Confermi la chiusura cassa? Dopo la chiusura non sarà più modificabile dall'operatore."
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

      setMessage("Chiusura cassa completata");
      await loadRows();
      await loadDetail(selectedId);
    } catch (err: any) {
      setError(err?.message || "Errore chiusura");
    } finally {
      setClosing(false);
    }
  }

  async function handleReceiptUpload(file: File) {
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

  return (
    <>
      <style>{`
        .cc-page {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .cc-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .cc-title {
          margin: 0;
          font-size: 28px;
          font-weight: 800;
          color: #243B53;
        }

        .cc-subtitle {
          margin-top: 6px;
          color: #627D98;
          font-size: 14px;
        }

        .cc-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.9fr);
          gap: 18px;
        }

        .cc-card {
          background: rgba(255,255,255,0.88);
          border: 1px solid rgba(217,226,236,0.95);
          border-radius: 18px;
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
          padding: 18px;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }

        .cc-card-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 14px;
        }

        .cc-card-title {
          margin: 0;
          font-size: 18px;
          font-weight: 800;
          color: #243B53;
        }

        .cc-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .cc-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .cc-label {
          font-size: 13px;
          font-weight: 700;
          color: #486581;
        }

        .cc-input,
        .cc-textarea {
          width: 100%;
          box-sizing: border-box;
          border-radius: 12px;
          border: 1px solid #D9E2EC;
          background: white;
          color: #243B53;
          font-size: 15px;
          outline: none;
        }

        .cc-input {
          min-height: 46px;
          padding: 10px 12px;
        }

        .cc-input-big {
          min-height: 54px;
          padding: 12px 14px;
          font-size: 22px;
          font-weight: 800;
        }

        .cc-textarea {
          min-height: 96px;
          padding: 10px 12px;
          resize: vertical;
        }

        .cc-results {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 14px;
        }

        .cc-result-box {
          border-radius: 16px;
          padding: 16px;
          background: linear-gradient(180deg, #F8FBFC 0%, #F2F6F8 100%);
          border: 1px solid #D9E2EC;
        }

        .cc-result-label {
          font-size: 13px;
          font-weight: 700;
          color: #627D98;
          margin-bottom: 8px;
        }

        .cc-result-value {
          font-size: 28px;
          font-weight: 800;
          color: #243B53;
        }

        .cc-upload-box,
        .cc-meta-box,
        .cc-alert-box {
          margin-top: 14px;
          border-radius: 16px;
          padding: 14px;
        }

        .cc-upload-box {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          background: #F8FBFC;
          border: 1px dashed #BCCCDC;
        }

        .cc-meta-box {
          background: #F8FBFC;
          border: 1px solid #D9E2EC;
          display: grid;
          gap: 6px;
          color: #486581;
          font-size: 14px;
        }

        .cc-alert-box {
          background: #FFF8E8;
          border: 1px solid #F7D070;
        }

        .cc-alert-title {
          font-size: 14px;
          font-weight: 800;
          color: #8D5E00;
          margin-bottom: 8px;
        }

        .cc-badges {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .cc-badge {
          display: inline-flex;
          align-items: center;
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
        }

        .cc-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: 16px;
        }

        .cc-btn-primary,
        .cc-btn-secondary,
        .cc-btn-danger {
          border: none;
          cursor: pointer;
          border-radius: 12px;
          min-height: 46px;
          padding: 0 16px;
          font-size: 14px;
          font-weight: 800;
          transition: 0.15s ease;
        }

        .cc-btn-primary {
          background: #0B7285;
          color: white;
        }

        .cc-btn-secondary {
          background: white;
          color: #243B53;
          border: 1px solid #D9E2EC;
        }

        .cc-btn-danger {
          background: #C0392B;
          color: white;
        }

        .cc-btn-primary:disabled,
        .cc-btn-secondary:disabled,
        .cc-btn-danger:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .cc-message,
        .cc-error {
          border-radius: 14px;
          padding: 12px 14px;
          font-weight: 700;
        }

        .cc-message {
          background: #ECFDF5;
          border: 1px solid #A7F3D0;
          color: #065F46;
        }

        .cc-error {
          background: #FEF2F2;
          border: 1px solid #FECACA;
          color: #991B1B;
        }

        .cc-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .cc-list-item {
          width: 100%;
          text-align: left;
          border-radius: 16px;
          background: white;
          border: 1px solid #D9E2EC;
          padding: 14px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .cc-list-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .cc-list-date {
          font-size: 12px;
          font-weight: 700;
          color: #627D98;
        }

        .cc-list-name {
          font-size: 16px;
          font-weight: 800;
          color: #243B53;
        }

        .cc-list-row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          color: #486581;
          font-size: 13px;
          flex-wrap: wrap;
        }

        .cc-link {
          color: #0B7285;
          text-decoration: none;
          font-weight: 800;
        }

        .cc-muted {
          font-size: 13px;
          color: #627D98;
        }

        @media (max-width: 960px) {
          .cc-layout {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 680px) {
          .cc-grid,
          .cc-results {
            grid-template-columns: 1fr;
          }

          .cc-title {
            font-size: 24px;
          }

          .cc-result-value {
            font-size: 24px;
          }

          .cc-card {
            padding: 14px;
          }
        }
      `}</style>

      <div className="cc-page">
        <div className="cc-header">
          <div>
            <h1 className="cc-title">Chiusura Cassa</h1>
            <div className="cc-subtitle">
              Inserimento rapido, controllo delta e storico operativo
            </div>
          </div>

          <button type="button" className="cc-btn-primary" onClick={handleNew}>
            Nuova chiusura
          </button>
        </div>

        {message ? <div className="cc-message">{message}</div> : null}
        {error ? <div className="cc-error">{error}</div> : null}

        <div className="cc-layout">
          <section className="cc-card">
            <div className="cc-card-head">
              <h2 className="cc-card-title">Dettaglio chiusura</h2>
              <span className="cc-muted">
                {loadingDetail ? "Caricamento..." : selected ? statusLabel(selected.status) : "Nuova bozza"}
              </span>
            </div>

            <div className="cc-grid">
              <label className="cc-field">
                <span className="cc-label">Data competenza</span>
                <input
                  className="cc-input"
                  type="date"
                  value={form.business_date}
                  onChange={(e) => setField("business_date", e.target.value)}
                  disabled={!canEdit}
                />
              </label>

              <label className="cc-field">
                <span className="cc-label">ID operatore</span>
                <input
                  className="cc-input"
                  type="text"
                  value={form.operator_id}
                  onChange={(e) => setField("operator_id", e.target.value)}
                  placeholder="es. usr_001"
                  disabled={!canEdit}
                />
              </label>

              <label className="cc-field">
                <span className="cc-label">Nome operatore</span>
                <input
                  className="cc-input"
                  type="text"
                  value={form.operator_name}
                  onChange={(e) => setField("operator_name", e.target.value)}
                  placeholder="es. Fabio"
                  disabled={!canEdit}
                />
              </label>

              <label className="cc-field">
                <span className="cc-label">Teorico base</span>
                <input
                  className="cc-input cc-input-big"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={form.theoretical_base}
                  onChange={(e) => setField("theoretical_base", e.target.value)}
                  placeholder="0,00"
                  disabled={!canEdit}
                />
              </label>

              <label className="cc-field">
                <span className="cc-label">Contanti</span>
                <input
                  className="cc-input cc-input-big"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={form.cash_declared}
                  onChange={(e) => setField("cash_declared", e.target.value)}
                  placeholder="0,00"
                  disabled={!canEdit}
                />
              </label>

              <label className="cc-field">
                <span className="cc-label">Carte</span>
                <input
                  className="cc-input cc-input-big"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={form.card_declared}
                  onChange={(e) => setField("card_declared", e.target.value)}
                  placeholder="0,00"
                  disabled={!canEdit}
                />
              </label>

              <label className="cc-field">
                <span className="cc-label">Satispay</span>
                <input
                  className="cc-input cc-input-big"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={form.satispay_declared}
                  onChange={(e) => setField("satispay_declared", e.target.value)}
                  placeholder="0,00"
                  disabled={!canEdit}
                />
              </label>

              <label className="cc-field">
                <span className="cc-label">Altri</span>
                <input
                  className="cc-input cc-input-big"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={form.other_declared}
                  onChange={(e) => setField("other_declared", e.target.value)}
                  placeholder="0,00"
                  disabled={!canEdit}
                />
              </label>
            </div>

            <div className="cc-results">
              <div className="cc-result-box">
                <div className="cc-result-label">Totale dichiarato</div>
                <div className="cc-result-value">{formatMoney(declaredTotal)}</div>
              </div>

              <div
                className="cc-result-box"
                style={{ border: `1px solid ${deltaColor}` }}
              >
                <div className="cc-result-label">Delta</div>
                <div className="cc-result-value" style={{ color: deltaColor }}>
                  {formatMoney(delta)}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <label className="cc-field">
                <span className="cc-label">Note</span>
                <textarea
                  className="cc-textarea"
                  value={form.notes}
                  onChange={(e) => setField("notes", e.target.value)}
                  placeholder="Note operative"
                  disabled={!canEdit}
                />
              </label>
            </div>

            <div className="cc-upload-box">
              <div>
                <div className="cc-label">Foto scontrino</div>
                <div className="cc-muted">
                  {selected?.receipt_image_name
                    ? `Caricata: ${selected.receipt_image_name}`
                    : "Nessuna foto caricata"}
                </div>
              </div>

              <label>
                <span
                  className="cc-btn-secondary"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: !selectedId || !isDraft ? 0.6 : 1,
                    cursor: !selectedId || !isDraft ? "not-allowed" : "pointer",
                  }}
                >
                  {uploading ? "Caricamento..." : "Carica foto"}
                </span>

                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  disabled={!selectedId || !isDraft || uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleReceiptUpload(file);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            </div>

            {selected?.receipt_image_url ? (
              <div style={{ marginTop: 10 }}>
                <a
                  href={selected.receipt_image_url}
                  target="_blank"
                  rel="noreferrer"
                  className="cc-link"
                >
                  Apri immagine scontrino
                </a>
              </div>
            ) : null}

            {selected?.alert_flags?.length ? (
              <div className="cc-alert-box">
                <div className="cc-alert-title">Alert</div>
                <div className="cc-badges">
                  {selected.alert_flags.map((alert) => (
                    <span
                      key={alert}
                      className="cc-badge"
                      style={{
                        background: "#FEF3C7",
                        color: "#92400E",
                        border: "1px solid #FDE68A",
                      }}
                    >
                      {alertLabel(alert)}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="cc-actions">
              <button
                type="button"
                className="cc-btn-primary"
                onClick={handleSave}
                disabled={saving || !canEdit}
              >
                {saving
                  ? "Salvataggio..."
                  : selectedId
                    ? "Salva bozza"
                    : "Crea bozza"}
              </button>

              <button
                type="button"
                className="cc-btn-danger"
                onClick={handleClose}
                disabled={!selectedId || !isDraft || closing}
              >
                {closing ? "Chiusura..." : "Chiudi cassa"}
              </button>
            </div>

            {selected ? (
              <div className="cc-meta-box">
                <div>
                  <strong>Stato:</strong> {statusLabel(selected.status)}
                </div>
                <div>
                  <strong>Creata:</strong> {formatDateTime(selected.created_at)}
                </div>
                <div>
                  <strong>Aggiornata:</strong> {formatDateTime(selected.updated_at)}
                </div>
                <div>
                  <strong>Chiusa:</strong> {formatDateTime(selected.closed_at)}
                </div>
                <div>
                  <strong>Email inviata:</strong> {selected.email_sent ? "Sì" : "No"}
                </div>
                {selected.email_error ? (
                  <div>
                    <strong>Errore email:</strong> {selected.email_error}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <aside className="cc-card">
            <div className="cc-card-head">
              <h2 className="cc-card-title">Storico chiusure</h2>
              <button
                type="button"
                className="cc-btn-secondary"
                onClick={() => void loadRows()}
              >
                Aggiorna
              </button>
            </div>

            {loadingList ? (
              <div className="cc-muted">Caricamento...</div>
            ) : rows.length === 0 ? (
              <div className="cc-muted">Nessuna chiusura presente</div>
            ) : (
              <div className="cc-list">
                {rows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className="cc-list-item"
                    onClick={() => void loadDetail(row.id)}
                    style={{
                      border:
                        row.id === selectedId
                          ? "2px solid #0B7285"
                          : "1px solid #D9E2EC",
                    }}
                  >
                    <div className="cc-list-top">
                      <span className="cc-list-date">
                        {row.business_date.slice(0, 10)}
                      </span>

                      <span
                        className="cc-badge"
                        style={badgeStyle(row.status)}
                      >
                        {statusLabel(row.status)}
                      </span>
                    </div>

                    <div className="cc-list-name">
                      {row.operator_name || row.operator_id || "Operatore"}
                    </div>

                    <div className="cc-list-row">
                      <span>Teorico: {formatMoney(row.theoretical_base)}</span>
                      <span>Dichiarato: {formatMoney(row.declared_total)}</span>
                    </div>

                    <div
                      className="cc-list-row"
                      style={{ color: row.delta === 0 ? "#166534" : Math.abs(row.delta) <= 5 ? "#B45309" : "#B91C1C", fontWeight: 800 }}
                    >
                      <span>Delta: {formatMoney(row.delta)}</span>
                    </div>

                    {row.alert_flags?.length ? (
                      <div className="cc-badges">
                        {row.alert_flags.map((alert) => (
                          <span
                            key={alert}
                            className="cc-badge"
                            style={{
                              background: "#F3F7FA",
                              color: "#486581",
                              border: "1px solid #D9E2EC",
                            }}
                          >
                            {alertLabel(alert)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
