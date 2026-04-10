import { useEffect, useMemo, useState } from "react";
import ItemDetailsModal, { type Item } from "./ItemDetailsModal";
import { RefreshCw, Plus, Pencil, X } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type SupplierOption = {
  id: string;
  code: string;
  name?: string | null;
};

type ItemUm = "CL" | "PZ";

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

function normalizeCategoryId(raw: unknown): (typeof CATEGORIES)[number]["id"] {
  const s = String(raw ?? "");
  return (CATEGORY_IDS as readonly string[]).includes(s)
    ? (s as (typeof CATEGORIES)[number]["id"])
    : "bevande";
}

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

function parsePositiveNumber(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parseNonNegativeNumber(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function formatItemMeasure(item: any) {
  const um = item?.um;
  const baseQty = Number(item?.baseQty);

  if ((um !== "CL" && um !== "PZ") || !Number.isFinite(baseQty) || baseQty <= 0) {
    return "DATI MANCANTI";
  }

  return `${baseQty} ${um}`;
}

export default function ItemsAdmin() {
  const [items, setItems] = useState<Item[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [newMinStockUnits, setNewMinStockUnits] = useState("");

  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // CREATE STATE
  const [newSku, setNewSku] = useState("");
  const [newName, setNewName] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [newPackSize, setNewPackSize] = useState("");
  const [newCategoryId, setNewCategoryId] = useState<
    (typeof CATEGORIES)[number]["id"]
  >("bevande");
  const [newSupplier, setNewSupplier] = useState<string>("VARI");
  const [newUm, setNewUm] = useState<ItemUm>("PZ");
  const [newBaseQty, setNewBaseQty] = useState("1");
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

  async function loadSuppliers() {
    try {
      const res = await fetch(`${API_BASE}/suppliers`);
      const data = await res.json();

      const rows = Array.isArray(data?.suppliers)
        ? data.suppliers
        : Array.isArray(data)
        ? data
        : [];

      setSuppliers(rows);
    } catch {
      setSuppliers([]);
    }
  }

  useEffect(() => {
    reload();
    loadSuppliers();
  }, []);

const filtered = useMemo(() => {
  const qq = q.trim().toUpperCase();

const filtered = useMemo(() => {
  const qq = q.trim().toUpperCase();

  const rawOnly = items.filter((i: any) => {
    const sku = String(i.sku ?? "").toUpperCase();

    // nasconde i prodotti CIC / finiti tipo SKU000xxx
    if (sku.startsWith("SKU000")) return false;

    return true;
  });

  if (!qq) return rawOnly;

  return rawOnly.filter((i: any) => {
    const sku = String(i.sku ?? "").toUpperCase();
    const name = String(i.name ?? "").toUpperCase();
    const brand = String(i.brand ?? "").toUpperCase();
    return sku.includes(qq) || name.includes(qq) || brand.includes(qq);
  });
}, [items, q]);
  

  if (!qq) return rawOnly;

  return rawOnly.filter((i: any) => {
    const sku = String(i.sku ?? "").toUpperCase();
    const name = String(i.name ?? "").toUpperCase();
    const brand = String(i.brand ?? "").toUpperCase();
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
    setNewUm("PZ");
    setNewBaseQty("1");
    setNewLastCostEuro("");
    setNewImageUrl("");
    setNewMinStockUnits("");
  }

  function handleUmChange(nextUm: ItemUm) {
    setNewUm(nextUm);

    if (nextUm === "PZ" && (!newBaseQty.trim() || newBaseQty === "0")) {
      setNewBaseQty("1");
    }
  }

  async function createItem() {
    setErr(null);

    const sku = normalizeSku(newSku);
    const baseQty = parsePositiveNumber(newBaseQty);
    const packSize = parsePositiveNumber(newPackSize);
    const minStockUnits = parseNonNegativeNumber(newMinStockUnits);
    
    if (!sku || !newName.trim()) {
      setErr("SKU e Nome articolo sono obbligatori.");
      return;
    }

    if (newUm !== "CL" && newUm !== "PZ") {
      setErr("UM non valida.");
      return;
    }

    if (baseQty == null) {
      setErr("Quantità base non valida.");
      return;
    }

    if (newUm === "PZ" && baseQty !== 1) {
      setErr("Per gli articoli a PZ la quantità base deve essere 1.");
      return;
    }

    if (!isHttpUrl(newImageUrl)) {
      setErr("URL immagine non valido.");
      return;
    }

    const payload = {
      sku,
      name: newName.trim(),
      categoryId: newCategoryId,
      category: newCategoryId,
      supplier: newSupplier,
      active: true,
      brand: newBrand.trim() || null,
      packSize,
      um: newUm,
      baseQty,
      costEur: newLastCostEuro.trim()
        ? Number(newLastCostEuro.replace(",", "."))
        : null,
      lastCostCents: euroToCents(newLastCostEuro),
      costCurrency: "EUR",
      minStockUnits,
      imageUrl: newImageUrl.trim() || null,
    };

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
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="m-0">Anagrafica articoli</h2>
          <div className="text-xs text-gray-500">
            Crea e gestisci SKU, fornitori, categorie e unità reali di stock
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
              <div className="col-span-12 md:col-span-3 grid gap-1">
                <label className={labelCls}>SKU</label>
                <input
                  className={inputCls}
                  value={newSku}
                  onChange={(e) => setNewSku(e.target.value)}
                  placeholder="Es. SKU231"
                />
              </div>

              <div className="col-span-12 md:col-span-6 grid gap-1">
                <label className={labelCls}>Nome articolo</label>
                <input
                  className={inputCls}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Es. Gin Bombay London Dry 1L"
                />
              </div>

              <div className="col-span-12 md:col-span-3 grid gap-1">
                <label className={labelCls}>Brand</label>
                <input
                  className={inputCls}
                  value={newBrand}
                  onChange={(e) => setNewBrand(e.target.value)}
                  placeholder="Opzionale"
                />
              </div>

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

              <div className="col-span-12 md:col-span-3 grid gap-1">
  <label className={labelCls}>Scorta minima (Unità)</label>
  <input
    className={inputCls}
    type="number"
    min={0}
    step="any"
    value={newMinStockUnits}
    onChange={(e) => setNewMinStockUnits(e.target.value)}
    placeholder={newUm === "PZ" ? "Es. 6" : "Es. 2"}
  />
  <div className={helpCls}>
    Quantità minima operativa in unità fisiche.
  </div>
</div>
              
              <div className="col-span-12 md:col-span-3 grid gap-1">
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

              <div className="col-span-12 md:col-span-3 grid gap-1">
                <label className={labelCls}>Fornitore</label>
                <select
                  className={inputCls}
                  value={newSupplier}
                  onChange={(e) => setNewSupplier(e.target.value)}
                >
                  <option value="VARI">Vari</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.code}>
                      {s.code}
                      {s.name ? ` · ${s.name}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-12 md:col-span-3 grid gap-1">
                <label className={labelCls}>UM</label>
                <select
                  className={inputCls}
                  value={newUm}
                  onChange={(e) => handleUmChange(e.target.value as ItemUm)}
                >
                  <option value="PZ">Pezzi (PZ)</option>
                  <option value="CL">Centilitri (CL)</option>
                </select>
                <div className={helpCls}>
                  PZ per articoli contati a pezzi. CL per liquidi.
                </div>
              </div>

              <div className="col-span-12 md:col-span-3 grid gap-1">
                <label className={labelCls}>Quantità base</label>
                <input
                  className={inputCls}
                  type="number"
                  min={1}
                  step="any"
                  value={newBaseQty}
                  onChange={(e) => setNewBaseQty(e.target.value)}
                  placeholder={newUm === "PZ" ? "1" : "Es. 70"}
                />
                <div className={helpCls}>
                  {newUm === "PZ"
                    ? "Per gli articoli a pezzi deve essere 1."
                    : "Inserisci la quantità reale in CL."}
                </div>
              </div>

              <div className="col-span-12 md:col-span-3 grid gap-1">
                <label className={labelCls}>Ultimo costo (EUR)</label>
                <input
                  className={inputCls}
                  value={newLastCostEuro}
                  onChange={(e) => setNewLastCostEuro(e.target.value)}
                  placeholder="Es. 18,90"
                />
              </div>

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
                <th className="th">UM</th>
                <th className="th">Quantità base</th>
                <th className="th text-right">Azioni</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((it: any) => (
                <tr key={it.itemId ?? it.sku} className="tr-hover">
                  <td className="td font-medium text-gray-900">{it.sku}</td>
                  <td className="td text-gray-700">{it.name}</td>
                  <td className="td text-gray-700">
                    {CATEGORIES.find(
                      (c) => c.id === normalizeCategoryId(it.categoryId ?? it.category)
                    )?.label ?? it.categoryId ?? it.category}
                  </td>
                  <td className="td text-gray-700">{it.supplier ?? "VARI"}</td>
                  <td className="td text-gray-700">{it.um ?? "DATI MANCANTI"}</td>
                  <td className="td text-gray-700">{formatItemMeasure(it)}</td>

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
                  <td className="td text-gray-500" colSpan={7}>
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
        suppliers={suppliers}
        onClose={() => setDetailsOpen(false)}
        onSavePatch={savePatch}
        loading={loading}
      />
    </div>
  );
}
