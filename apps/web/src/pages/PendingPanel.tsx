import { useEffect, useMemo, useState } from "react";
import { authFetch } from "../api/authFetch";

type PendingReason =
  | "UNMAPPED_PRODUCT"
  | "UNCLASSIFIED_SKU"
  | "RECIPE_NOT_FOUND"
  | "RECIPE_INVALID";

type PendingStatus = "PENDING" | "PROCESSED" | "ERROR";



type PendingRow = {
  id: string;
  rawResolvedSku?: string | null;
  resolvedSku?: string | null;
  qty: number;
  total: number;
  reason: PendingReason;
  status: PendingStatus;
  createdAt?: string;
  orderDate?: string;
  description?: string | null;
  productName?: string | null;
  productId?: string | null;
  variantId?: string | null;
  receiptNumber?: string | null;
  docId?: string | null;
  rawRow?: any;

  cicProductName?: string | null;
  cicVariantName?: string | null;
  catalogSku?: string | null;
  recipeSku?: string | null;
  recipeName?: string | null;
};

const reasonStyle: Record<PendingReason, string> = {
  UNMAPPED_PRODUCT: "bg-slate-100 text-slate-700",
  UNCLASSIFIED_SKU: "bg-amber-100 text-amber-800",
  RECIPE_NOT_FOUND: "bg-orange-100 text-orange-800",
  RECIPE_INVALID: "bg-red-100 text-red-800",
};

const reasonLabel: Record<PendingReason, string> = {
  UNMAPPED_PRODUCT: "SKU mancante",
  UNCLASSIFIED_SKU: "Da classificare",
  RECIPE_NOT_FOUND: "Ricetta mancante",
  RECIPE_INVALID: "Ricetta non valida",
};

function formatMoney(value: number | null | undefined) {
  const amount = Number(value || 0);
  return amount.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
  });
}

function formatDate(value?: string) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function IntegrationPendingPanel() {
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [reasonFilter, setReasonFilter] = useState<PendingReason | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<PendingStatus | "ALL">("PENDING");
  const [manualSku, setManualSku] = useState("");

async function loadPending() {
  try {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    if (reasonFilter !== "ALL") params.set("reason", reasonFilter);
    if (query.trim()) params.set("q", query.trim());

const response = await authFetch(`/pending?${params.toString()}`);

let raw;
try {
  raw = await response.text();
} catch {
  throw new Error("Errore lettura risposta server");
}

let json;
try {
  json = raw ? JSON.parse(raw) : {};
} catch {
  console.error("❌ RESPONSE NON JSON:", raw);
  throw new Error("Errore server (non JSON)");
}

    const normalizedRows =
      json?.data ||
      json?.rows ||
      [];

    setRows(normalizedRows);

    if (!selectedId && normalizedRows.length) {
      setSelectedId(normalizedRows[0].id);
    } else if (
      selectedId &&
      !normalizedRows.some((r: PendingRow) => r.id === selectedId)
    ) {
      setSelectedId(normalizedRows[0]?.id ?? null);
    }
  } catch (err: any) {
    setError(err?.message || "Errore imprevisto");
  } finally {
    setLoading(false);
  }
}

  useEffect(() => {
    loadPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reasonFilter, statusFilter]);

const filteredRows = useMemo(() => {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => {
    const sku = String(row.rawResolvedSku || row.resolvedSku || "").toLowerCase();
    const name = String(row.description || row.productName || "").toLowerCase();
    const productId = String(row.productId || "").toLowerCase();
    const variantId = String(row.variantId || "").toLowerCase();
    const docId = String(row.docId || "").toLowerCase();

    return (
      sku.includes(q) ||
      name.includes(q) ||
      productId.includes(q) ||
      variantId.includes(q) ||
      docId.includes(q)
    );
  });
}, [rows, query]);
  
  const selected = filteredRows.find((r) => r.id === selectedId) || filteredRows[0] || null;

  useEffect(() => {
    if (selected && selected.id !== selectedId) {
      setSelectedId(selected.id);
    }
  }, [selected, selectedId]);

  const counts = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.status === "PENDING") acc.pending += 1;
        if (row.status === "PROCESSED") acc.processed += 1;
        if (row.reason === "RECIPE_INVALID") acc.invalid += 1;
        return acc;
      },
      { total: 0, pending: 0, processed: 0, invalid: 0 }
    );
  }, [rows]);

  async function postAction(path: string, body?: Record<string, unknown>) {
    try {
      setSaving(true);
      setError(null);
      const response = await authFetch(path, {
        method: "POST",
        body: JSON.stringify(body || {}),
      });
let raw;
try {
  raw = await response.text();
} catch {
  throw new Error("Errore lettura risposta server");
}

let json;
try {
  json = raw ? JSON.parse(raw) : {};
} catch {
  console.error("❌ RESPONSE NON JSON:", raw);
  throw new Error("Errore server (non JSON)");
}

// 🔥 QUESTA È LA RIGA CHE TI MANCA
if (!response.ok || json?.ok === false) {
  throw new Error(json?.error || "Operazione non riuscita");
}

await loadPending();
      setManualSku("");
    } catch (err: any) {
      setError(err?.message || "Operazione non riuscita");
    } finally {
      setSaving(false);
    }
  }

  async function handleReprocessOne() {
    if (!selected) return;
    await postAction(`/pending/${selected.id}/reprocess`);
  }

  async function handleReprocessAll() {
    await postAction(`/pending/reprocess-all`);
  }

  async function handleSetIgnore() {
    if (!selected) return;
    await postAction(`/pending/${selected.id}/ignore`);
  }

  async function handleCreateRecipe() {
    if (!selected) return;
    await postAction(`/pending/${selected.id}/create-recipe`);
  }

async function handleAssignSku() {
  if (!selected) return;

  const sku = manualSku.trim().toUpperCase();

  if (!sku) {
    setError("Inserisci uno SKU valido");
    return;
  }

  try {
    setSaving(true);
    setError(null);

    const response = await authFetch(
      `/pending/${selected.id}/assign-sku`,
      {
        method: "POST",
        body: JSON.stringify({
          resolvedSku: sku, // ✅ FIX PRINCIPALE
        }),
      }
    );

let raw;
try {
  raw = await response.text();
} catch {
  throw new Error("Errore lettura risposta server");
}

let json;
try {
  json = raw ? JSON.parse(raw) : {};
} catch {
  console.error("❌ RESPONSE NON JSON:", raw);
  throw new Error("Errore server (risposta non valida)");
}

    if (!response.ok || json?.ok === false) {
      throw new Error(json?.error || "Errore assegnazione SKU");
    }

    // ✅ refresh lista
    await loadPending();

    // ✅ reset input
    setManualSku("");

  } catch (err: any) {
    setError(err?.message || "Errore imprevisto");
  } finally {
    setSaving(false);
  }
}

  return (
    <div className="min-h-screen bg-slate-50 p-4 text-slate-900 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Integrazione · Pending CIC</h1>
              <p className="mt-1 text-sm text-slate-500">
                Qui risolvi gli articoli non mappati, classifichi RECIPE o IGNORE e rilanci il reprocess.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm">
                <div className="text-slate-500">Totali</div>
                <div className="text-lg font-semibold">{counts.total}</div>
              </div>
              <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <div className="text-amber-600">Pending</div>
                <div className="text-lg font-semibold">{counts.pending}</div>
              </div>
              <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">
                <div className="text-red-600">Ricette invalide</div>
                <div className="text-lg font-semibold">{counts.invalid}</div>
              </div>
              <button
                onClick={handleReprocessAll}
                disabled={saving || loading}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-sm disabled:opacity-50"
              >
                Reprocess all
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="flex flex-col gap-3 lg:flex-row">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                  placeholder="Cerca per SKU o nome prodotto"
                />
                <select
                  value={reasonFilter}
                  onChange={(e) => setReasonFilter(e.target.value as PendingReason | "ALL")}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                >
                  <option value="ALL">Tutti i motivi</option>
                  <option value="UNMAPPED_PRODUCT">UNMAPPED_PRODUCT</option>
                  <option value="UNCLASSIFIED_SKU">UNCLASSIFIED_SKU</option>
                  <option value="RECIPE_NOT_FOUND">RECIPE_NOT_FOUND</option>
                  <option value="RECIPE_INVALID">RECIPE_INVALID</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as PendingStatus | "ALL")}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                >
                  <option value="PENDING">Solo pending</option>
                  <option value="PROCESSED">Solo risolti</option>
                  <option value="ERROR">Solo errori</option>
                  <option value="ALL">Tutti</option>
                </select>
                <button
                  onClick={loadPending}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium hover:bg-slate-100"
                >
                  Aggiorna
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
              <div className="grid grid-cols-[1.5fr_0.7fr_1fr_0.9fr_0.7fr] gap-4 border-b border-slate-200 px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <div>Prodotto</div>
                <div>Qty / Totale</div>
                <div>Motivo</div>
                <div>Creato</div>
                <div></div>
              </div>

              {loading ? (
                <div className="px-5 py-8 text-sm text-slate-500">Caricamento pending…</div>
              ) : filteredRows.length === 0 ? (
                <div className="px-5 py-8 text-sm text-slate-500">Nessun pending trovato.</div>
              ) : (
                filteredRows.map((row) => {
                  const isSelected = row.id === selected?.id;
                  return (
<button
  key={row.id}
  onClick={() => setSelectedId(row.id)}
  className={`grid w-full grid-cols-[1.5fr_0.7fr_1fr_0.9fr_0.7fr] gap-4 border-b border-slate-100 px-5 py-4 text-left last:border-b-0 ${
    isSelected ? "bg-slate-50" : "hover:bg-slate-50"
  }`}
>
  <div>
    <div className="text-sm font-semibold">
      {row.cicVariantName ||
        row.cicProductName ||
        row.recipeName ||
        row.description ||
        row.productName ||
        row.productId ||
        "Senza descrizione"}
    </div>

    <div className="mt-1 text-xs text-slate-500">
      {row.catalogSku
        ? `SKU: ${row.catalogSku}`
        : row.rawResolvedSku || row.resolvedSku || "SKU assente"}
      {row.recipeSku ? ` · Ricetta: ${row.recipeSku}` : ""}
      {row.productId ? ` · prod: ${row.productId}` : ""}
      {row.variantId ? ` · var: ${row.variantId}` : ""}
    </div>
  </div>

  <div className="text-sm">
    <div>{row.qty} pz</div>
    <div className="mt-1 text-xs text-slate-500">{formatMoney(row.total)}</div>
  </div>

  <div>
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${reasonStyle[row.reason]}`}>
      {reasonLabel[row.reason]}
    </span>
  </div>

  <div className="text-sm text-slate-600">
    {formatDate(row.createdAt || row.orderDate)}
  </div>

  <div className="text-right text-sm text-slate-500">Apri</div>
</button>
                    
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            {!selected ? (
              <div className="text-sm text-slate-500">Seleziona una riga pending per vedere i dettagli.</div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dettaglio pending</div>
<h2 className="mt-1 text-xl font-semibold">
  {selected.cicVariantName ||
    selected.cicProductName ||
    selected.recipeName ||
    selected.description ||
    selected.productName ||
    selected.productId ||
    "Senza descrizione"}
</h2>
                    
<div className="mt-1 text-sm text-slate-500">
  {selected.catalogSku
    ? `SKU: ${selected.catalogSku}`
    : selected.rawResolvedSku || selected.resolvedSku || "SKU assente"}
  {selected.recipeSku ? ` · Ricetta: ${selected.recipeSku}` : ""}
</div>
                    
<div className="mt-2 text-xs text-slate-500">
  {selected.productId ? `Prodotto CIC: ${selected.productId}` : "Prodotto CIC: -"}
  {" · "}
  {selected.variantId ? `Variante CIC: ${selected.variantId}` : "Variante CIC: -"}
</div>
                    {selected.rawRow && (
  <div className="mt-4 rounded-2xl bg-slate-50 p-3">
    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
      Raw CIC
    </div>
    <pre className="max-h-48 overflow-auto text-xs text-slate-600">
      {JSON.stringify(selected.rawRow, null, 2)}
    </pre>
  </div>
)}
                    
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${reasonStyle[selected.reason]}`}>
                    {reasonLabel[selected.reason]}
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <div className="text-slate-500">Quantità</div>
                    <div className="mt-1 font-semibold">{selected.qty}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <div className="text-slate-500">Totale</div>
                    <div className="mt-1 font-semibold">{formatMoney(selected.total)}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <div className="text-slate-500">Motivo</div>
                    <div className="mt-1 font-semibold">{selected.reason}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <div className="text-slate-500">Documento</div>
                    <div className="mt-1 font-semibold">{selected.docId || selected.receiptNumber || "-"}</div>
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  <button
                    onClick={handleReprocessOne}
                    disabled={saving}
                    className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Reprocessa riga
                  </button>
                  <button
                    onClick={handleSetIgnore}
                    disabled={saving}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
                  >
                    Imposta IGNORE
                  </button>
                  <button
                    onClick={handleCreateRecipe}
                    disabled={saving}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
                  >
                    Crea ricetta
                  </button>
                </div>

                <div className="mt-8 border-t border-slate-200 pt-5">
                  <div className="text-sm font-semibold">Assegna SKU manuale</div>
                  <div className="mt-3 flex gap-2">
                    <input
                      value={manualSku}
                      onChange={(e) => setManualSku(e.target.value)}
                      className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none"
                      placeholder="Es. SKU000411"
                    />
                    <button
                      onClick={handleAssignSku}
                      disabled={saving || !manualSku.trim()}
                      className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      Salva
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
