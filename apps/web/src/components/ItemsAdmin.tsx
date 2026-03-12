import { useEffect, useMemo, useState } from "react";
import ItemDetailsModal, { type Item } from "./ItemDetailsModal";
import { RefreshCw, Plus, Pencil, X } from "lucide-react";

const API_BASE =
  import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type StockKind = "UNIT" | "VOLUME_CONTAINER";
type Supplier = "DORECA" | "ALPORI" | "VARI";

const CATEGORIES = [
  { id: "bevande", label: "Bevande" },
  { id: "vino", label: "Vino" },
  { id: "birra", label: "Birra" },
  { id: "amari", label: "Amari" },
  { id: "distillati_altri", label: "Altri distillati" },
  { id: "gin", label: "Gin" },
  { id: "vodka", label: "Vodka" },
  { id: "whiskey", label: "Whiskey" },
  { id: "rhum", label: "Rhum" },
  { id: "tequila", label: "Tequila" },
] as const;

const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as readonly string[];

function normalizeCategoryId(raw: any): (typeof CATEGORIES)[number]["id"] {
  const s = (raw ?? "").toString();
  return (CATEGORY_IDS as readonly string[]).includes(s) ? (s as any) : "bevande";
}

const SUPPLIERS = [
  { id: "DORECA", label: "Doreca" },
  { id: "ALPORI", label: "Alpori" },
  { id: "VARI", label: "Vari" },
] as const;

function euroToCents(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function normalizeSku(s: string) {
  return s.toUpperCase().trim();
}

function isHttpUrl(s: string) {
  if (!s.trim()) return true;
  return /^https?:\/\/.+/i.test(s);
}

export default function ItemsAdmin() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  // ✅ accordion create
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // CREATE STATE
  const [newSku, setNewSku] = useState("");
  const [newName, setNewName] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [newPackSize, setNewPackSize] = useState("");

  const [newCategoryId, setNewCategoryId] = useState<
    (typeof CATEGORIES)[number]["id"]
  >("bevande");

  const [newSupplier, setNewSupplier] = useState<Supplier>("VARI");

  const [newStockKind, setNewStockKind] = useState<StockKind>("UNIT");
  const [newUnitToCl, setNewUnitToCl] = useState(33);
  const [newContainerSizeCl, setNewContainerSizeCl] = useState(70);
  const [newContainerLabel, setNewContainerLabel] = useState("Bottiglia");
  const [newMinStockCl, setNewMinStockCl] = useState(0);
  const [newLastCostEuro, setNewLastCostEuro] = useState("");
  const [newImageUrl, setNewImageUrl] = useState("");

  // MODAL
  const [selected, setSelected] = useState<Item | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const labelCls = "text-xs font-medium text-gray-600";
  const inputCls =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-gray-100";
  const helpCls = "text-xs text-gray-500";

  async function reload() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`${API_BASE}/items`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setErr("Errore caricamento articoli");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toUpperCase();
    if (!qq) return items;
    return items.filter((i) => {
      const sku = (i.sku ?? "").toUpperCase();
      const name = (i.name ?? "").toUpperCase();
      const brand = (i.brand ?? "").toUpperCase();
      return sku.includes(qq) || name.includes(qq) || brand.includes(qq);
    });
  }, [items, q]);

  function resetCreateForm() {
    setNewSku("");
    setNewName("");
    setNewBrand("");
    setNewPackSize("");
    setNewCategoryId("bevande");
    setNewSupplier("VARI");
    setNewStockKind("UNIT");
    setNewUnitToCl(33);
    setNewContainerSizeCl(70);
    setNewContainerLabel("Bottiglia");
    setNewMinStockCl(0);
    setNewLastCostEuro("");
    setNewImageUrl("");
  }

  async function createItem() {
    setErr(null);

    const sku = normalizeSku(newSku);
    if (!sku || !newName.trim()) {
      setErr("SKU e Nome articolo sono obbligatori.");
      return;
    }

    if (!isHttpUrl(newImageUrl)) {
      setErr("URL immagine non valido.");
      return;
    }

    const payload: any = {
      sku,
      name: newName.trim(),
      categoryId: newCategoryId,
      supplier: newSupplier,
      active: true,
      stockKind: newStockKind,
      baseUnit: "CL",
      minStockCl: newMinStockCl,
      brand: newBrand.trim() || null,
      packSize: newPackSize.trim() ? Number(newPackSize) : null,
      lastCostCents: euroToCents(newLastCostEuro),
      costCurrency: "EUR",
      imageUrl: newImageUrl.trim() || null,
    };

    if (newStockKind === "UNIT") {
      payload.unitToCl = newUnitToCl;
    } else {
      payload.containerSizeCl = newContainerSizeCl;
      payload.containerLabel = newContainerLabel;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Errore creazione articolo");
      }

      await reload();

      // ✅ reset + close accordion
      resetCreateForm();
      setIsCreateOpen(false);
    } catch (e: any) {
      setErr(e?.message ?? "Errore creazione articolo");
    } finally {
      setLoading(false);
    }
  }

  async function savePatch(sku: string, patch: any) {
    const res = await fetch(`${API_BASE}/items/${encodeURIComponent(sku)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || "Errore salvataggio");
    }

    await reload();
  }

  return (
    <div className="grid gap-4">
      {/* HEADER */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="m-0">Anagrafica articoli</h2>
          <div className="text-xs text-gray-500">
            Crea e gestisci SKU, fornitori, categorie e parametri stock
          </div>
        </div>

        <button
          className="btn-ghost btn-icon"
          onClick={reload}
          disabled={loading}
          title="Ricarica"
        >
          <RefreshCw className="icon-16" />
          Aggiorna
        </button>
      </div>

      {/* SEARCH */}
      <div className="card">
        <div className="card-body grid gap-2">
          <label className={labelCls}>Cerca</label>
          <input
            className={inputCls}
            placeholder="Cerca per SKU, nome o brand…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}

      {/* ✅ CREATE (COLLAPSIBLE) */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Nuovo articolo</div>
            <div className="card-subtitle">
              Compila i campi principali e crea la nuova SKU
            </div>
          </div>

          <button
            className={`btn-icon ${isCreateOpen ? "btn-ghost" : "btn-primary"}`}
            onClick={() => setIsCreateOpen((v) => !v)}
            disabled={loading}
            title={isCreateOpen ? "Chiudi" : "Apri"}
          >
            {isCreateOpen ? <X className="icon-16" /> : <Plus className="icon-16" />}
            {isCreateOpen ? "Chiudi" : "Nuovo"}
          </button>
        </div>

        {isCreateOpen && (
          <div className="card-body">
            <div className="grid grid-cols-12 gap-3">
              {/* SKU */}
              <div className="col-span-12 md:col-span-3 grid gap-1">
                <label className={labelCls}>SKU</label>
                <input
                  className={inputCls}
                  value={newSku}
                  onChange={(e) => setNewSku(e.target.value)}
                  placeholder="Es. SKU231"
                />
              </div>

              {/* Nome */}
              <div className="col-span-12 md:col-span-6 grid gap-1">
                <label className={labelCls}>Nome articolo</label>
                <input
                  className={inputCls}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Es. Gin Bombay London Dry 1L"
                />
              </div>

              {/* Brand */}
              <div className="col-span-12 md:col-span-3 grid gap-1">
                <label className={labelCls}>Brand</label>
                <input
                  className={inputCls}
                  value={newBrand}
                  onChange={(e) => setNewBrand(e.target.value)}
                  placeholder="Opzionale"
                />
              </div>

              {/* Pack size */}
              <div className="col-span-12 md:col-span-3 grid gap-1">
                <label className={labelCls}>Pezzi per cassa</label>
                <input
                  className={inputCls}
                  type="number"
                  min={1}
                  value={newPackSize}
                  onChange={(e) => setNewPackSize(e.target.value)}
                  placeholder="Es. 24"
                />
              </div>

              {/* Categoria */}
              <div className="col-span-12 md:col-span-4 grid gap-1">
                <label className={labelCls}>Categoria</label>
                <select
                  className={inputCls}
                  value={newCategoryId}
                  onChange={(e) => setNewCategoryId(e.target.value as any)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Fornitore */}
              <div className="col-span-12 md:col-span-2 grid gap-1">
                <label className={labelCls}>Fornitore</label>
                <select
                  className={inputCls}
                  value={newSupplier}
                  onChange={(e) => setNewSupplier(e.target.value as Supplier)}
                >
                  {SUPPLIERS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Stock kind */}
              <div className="col-span-12 md:col-span-3 grid gap-1">
                <label className={labelCls}>Gestione stock</label>
                <select
                  className={inputCls}
                  value={newStockKind}
                  onChange={(e) => setNewStockKind(e.target.value as StockKind)}
                >
                  <option value="UNIT">Pezzi (PZ)</option>
                  <option value="VOLUME_CONTAINER">Volume (CL)</option>
                </select>
                <div className={helpCls}>
                  PZ: lattine/bottiglie. CL: bottiglie da spillare.
                </div>
              </div>

              {/* Stock detail */}
              {newStockKind === "UNIT" ? (
                <div className="col-span-12 md:col-span-3 grid gap-1">
                  <label className={labelCls}>CL per pezzo</label>
                  <input
                    className={inputCls}
                    type="number"
                    value={newUnitToCl}
                    onChange={(e) => setNewUnitToCl(Number(e.target.value))}
                    placeholder="Es. 33"
                  />
                </div>
              ) : (
                <>
                  <div className="col-span-12 md:col-span-3 grid gap-1">
                    <label className={labelCls}>CL contenitore</label>
                    <input
                      className={inputCls}
                      type="number"
                      value={newContainerSizeCl}
                      onChange={(e) =>
                        setNewContainerSizeCl(Number(e.target.value))
                      }
                      placeholder="Es. 70"
                    />
                  </div>

                  <div className="col-span-12 md:col-span-3 grid gap-1">
                    <label className={labelCls}>Nome contenitore</label>
                    <input
                      className={inputCls}
                      value={newContainerLabel}
                      onChange={(e) => setNewContainerLabel(e.target.value)}
                      placeholder="Es. Bottiglia"
                    />
                  </div>
                </>
              )}

              {/* Min stock */}
              <div className="col-span-12 md:col-span-3 grid gap-1">
                <label className={labelCls}>Scorta minima (CL)</label>
                <input
                  className={inputCls}
                  type="number"
                  value={newMinStockCl}
                  onChange={(e) => setNewMinStockCl(Number(e.target.value))}
                  placeholder="Es. 0"
                />
              </div>

              {/* Cost */}
              <div className="col-span-12 md:col-span-3 grid gap-1">
                <label className={labelCls}>Ultimo costo (EUR)</label>
                <input
                  className={inputCls}
                  value={newLastCostEuro}
                  onChange={(e) => setNewLastCostEuro(e.target.value)}
                  placeholder="Es. 18,90"
                />
              </div>

              {/* Image */}
              <div className="col-span-12 md:col-span-6 grid gap-1">
                <label className={labelCls}>URL immagine</label>
                <input
                  className={inputCls}
                  value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)}
                  placeholder="https://..."
                />
                <div className={helpCls}>
                  Opzionale. Deve iniziare con http/https.
                </div>
              </div>
            </div>

            {/* actions */}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                className="btn-ghost"
                onClick={() => {
                  resetCreateForm();
                  setIsCreateOpen(false);
                }}
                disabled={loading}
              >
                Annulla
              </button>

              <button
                className="btn-primary btn-icon"
                onClick={createItem}
                disabled={loading}
              >
                <Plus className="icon-16" />
                Crea
              </button>
            </div>
          </div>
        )}
      </div>

      {/* LIST */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Articoli</div>
            <div className="card-subtitle">
              {loading ? "Caricamento…" : `${filtered.length} articoli`}
            </div>
          </div>
        </div>

        <div className="card-body overflow-auto">
          <table className="table">
            <thead className="thead sticky top-0 z-10">
              <tr>
                <th className="th">SKU</th>
                <th className="th">Nome</th>
                <th className="th">Categoria</th>
                <th className="th">Fornitore</th>
                <th className="th">Tipo</th>
                <th className="th text-right">Azioni</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((it) => (
                <tr key={it.itemId ?? it.sku} className="tr-hover">
                  <td className="td font-medium text-gray-900">{it.sku}</td>
                  <td className="td text-gray-700">{it.name}</td>
                  <td className="td text-gray-700">
                    {CATEGORIES.find(
                      (c) => c.id === normalizeCategoryId((it as any).categoryId)
                    )?.label ?? (it as any).categoryId}
                  </td>
                  <td className="td text-gray-700">
                    {(it as any).supplier ?? "VARI"}
                  </td>
                  <td className="td text-gray-700">
                    {(it as any).stockKind === "UNIT" ? "PZ" : "CL"}
                  </td>

                  <td className="td text-right">
                    <button
                      className="btn-ghost btn-icon"
                      onClick={() => {
                        setSelected(it);
                        setDetailsOpen(true);
                      }}
                      disabled={loading}
                      title="Apri dettaglio"
                    >
                      <Pencil className="icon-16" />
                      Apri
                    </button>
                  </td>
                </tr>
              ))}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td className="td text-gray-500" colSpan={6}>
                    Nessun articolo trovato.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ItemDetailsModal
        open={detailsOpen}
        item={selected}
        onClose={() => setDetailsOpen(false)}
        onSavePatch={savePatch}
        loading={loading}
      />
    </div>
  );
}
