import { useEffect, useMemo, useState } from "react";
import { X, Power, ChevronDown } from "lucide-react";

export type Item = {
  itemId?: string;
  sku: string;
  name?: string;
  brand?: string | null;

  categoryId?: string | null;
  category?: string | null;
  supplier?: string | null;

  um?: "CL" | "PZ" | null;
  baseQty?: number | null;

  packSize?: number | null;

  lastCostCents?: number | null;
  costEur?: number | null;
  costCurrency?: string | null;

  imageUrl?: string | null;
  active?: boolean;
};

type SupplierOption = {
  id: string;
  code: string;
  name?: string | null;
};

type ItemUm = "CL" | "PZ";

function centsToEuroString(cents: number | null | undefined) {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "";
  const v = cents / 100;
  return v.toFixed(2).replace(".", ",");
}

function euroToCents(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
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

export default function ItemDetailsModal({
  open,
  item,
  suppliers,
  onClose,
  onSavePatch,
  loading,
}: {
  open: boolean;
  item: Item | null;
  suppliers: SupplierOption[];
  onClose: () => void;
  onSavePatch: (sku: string, patch: any) => Promise<void>;
  loading?: boolean;
}) {
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [supplier, setSupplier] = useState<string>("VARI");
  const [categoryId, setCategoryId] = useState("");

  const [packSize, setPackSize] = useState<string>("");
  const [um, setUm] = useState<ItemUm>("PZ");
  const [baseQty, setBaseQty] = useState<string>("1");

  const [lastCostEuro, setLastCostEuro] = useState<string>("");

  const [imageUrl, setImageUrl] = useState<string>("");
  const [active, setActive] = useState<boolean>(true);

  const sku = item?.sku ?? "";

  const previewUrl = useMemo(() => {
    const u = imageUrl.trim();
    return isHttpUrl(u) && u ? u : "";
  }, [imageUrl]);

  useEffect(() => {
    if (!open || !item) return;

    setErr(null);

    setName(item.name ?? "");
    setBrand(item.brand ?? "");
    setSupplier((item.supplier ?? "VARI") as string);
    setCategoryId((item.categoryId ?? item.category ?? "") as string);

    const parsedPackSize = Number(item.packSize);
    setPackSize(
      Number.isFinite(parsedPackSize) && parsedPackSize > 0
        ? String(parsedPackSize)
        : ""
    );

    const nextUm: ItemUm = item.um === "CL" ? "CL" : "PZ";
    setUm(nextUm);

    const parsedBaseQty = Number(item.baseQty);
    const nextBaseQty =
      Number.isFinite(parsedBaseQty) && parsedBaseQty > 0
        ? String(parsedBaseQty)
        : nextUm === "PZ"
        ? "1"
        : "";
    setBaseQty(nextBaseQty);

    if (
      typeof item.lastCostCents === "number" &&
      Number.isFinite(item.lastCostCents)
    ) {
      setLastCostEuro(centsToEuroString(item.lastCostCents));
    } else if (typeof item.costEur === "number" && Number.isFinite(item.costEur)) {
      setLastCostEuro(String(item.costEur).replace(".", ","));
    } else {
      setLastCostEuro("");
    }

    setImageUrl(item.imageUrl ?? "");
    setActive(Boolean(item.active ?? true));
  }, [open, item]);

  if (!open || !item) return null;

  function handleUmChange(nextUm: ItemUm) {
    setUm(nextUm);

    if (nextUm === "PZ") {
      setBaseQty("1");
    } else if (baseQty.trim() === "1") {
      setBaseQty("");
    }
  }

  async function handleSave() {
    setErr(null);

    if (!item) return;

    if (!name.trim()) {
      setErr("Nome articolo obbligatorio.");
      return;
    }

    if (!isHttpUrl(imageUrl)) {
      setErr("URL immagine non valido (deve iniziare con http/https).");
      return;
    }

    const parsedPackSize = parsePositiveNumber(packSize);
    const parsedBaseQty = parsePositiveNumber(baseQty);

    if (um !== "CL" && um !== "PZ") {
      setErr("UM non valida.");
      return;
    }

    if (parsedBaseQty == null) {
      setErr("Quantità base non valida.");
      return;
    }

    if (um === "PZ" && parsedBaseQty !== 1) {
      setErr("Per gli articoli a PZ la quantità base deve essere 1.");
      return;
    }

    const patch: any = {
      name: name.trim(),
      brand: brand.trim() || null,
      supplier: supplier || "VARI",
      categoryId: categoryId.trim() || null,
      category: categoryId.trim() || null,
      packSize: parsedPackSize,
      um,
      baseQty: parsedBaseQty,
      costEur: lastCostEuro.trim()
        ? Number(lastCostEuro.replace(",", "."))
        : null,
      lastCostCents: euroToCents(lastCostEuro),
      costCurrency: "EUR",
      imageUrl: imageUrl.trim() || null,
      active,
    };

    try {
      await onSavePatch(item.sku, patch);
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Errore salvataggio");
    }
  }

  const labelCls = "text-xs font-medium text-gray-600";
  const helpCls = "text-xs text-gray-500";

  const inputCls =
    "w-full h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-sm text-gray-900 shadow-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-teal-600/20";

  const selectCls =
    "w-full h-9 rounded-lg border border-gray-200 bg-white px-2.5 pr-8 text-sm text-gray-900 shadow-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-teal-600/20 appearance-none";

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/25" onClick={onClose} />

      <div className="absolute inset-0 flex items-start justify-center p-4 sm:p-6">
        <div
          className="w-[min(920px,calc(100vw-32px))] rounded-2xl bg-white border border-gray-200 shadow-xl overflow-hidden"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-200 bg-white">
            <div>
              <div className="text-base font-semibold text-gray-900">
                Dettaglio articolo
              </div>
              <div className="text-xs text-gray-500">{sku}</div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActive((v) => !v)}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${
                  active
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                }`}
                title="Attivo/Disattivo"
              >
                <Power className="h-4 w-4" />
                {active ? "Attivo" : "Disattivo"}
              </button>

              <button
                type="button"
                className="btn-square"
                onClick={onClose}
                title="Chiudi"
              >
                <X className="icon-18" />
              </button>
            </div>
          </div>

          <div className="p-5">
            {err && <div className="mb-3 text-sm text-red-600">{err}</div>}

            <div className="grid grid-cols-12 gap-x-6 gap-y-4 items-start">
              <div className="col-span-12 md:col-span-6 min-w-0 grid gap-1">
                <label className={labelCls}>Nome articolo</label>
                <input
                  className={inputCls}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="col-span-12 md:col-span-3 min-w-0 grid gap-1">
                <label className={labelCls}>Brand</label>
                <input
                  className={inputCls}
                  placeholder="Opzionale"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                />
              </div>

              <div className="col-span-12 md:col-span-3 min-w-0 grid gap-1">
                <label className={labelCls}>Fornitore</label>
                <div className="relative">
                  <select
                    className={selectCls}
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                  >
                    <option value="VARI">VARI</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.code}>
                        {s.code}
                        {s.name ? ` · ${s.name}` : ""}
                      </option>
                    ))}
                  </select>

                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                </div>
              </div>

              <div className="col-span-12 md:col-span-6 min-w-0 grid gap-1">
                <label className={labelCls}>Categoria</label>
                <input
                  className={inputCls}
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                />
                <div className={helpCls}>
                  Per ora testo libero, poi lo colleghiamo alla select.
                </div>
              </div>

              <div className="col-span-12 md:col-span-2 min-w-0 grid gap-1">
                <label className={labelCls}>Pezzi per cassa</label>
                <input
                  className={inputCls}
                  type="number"
                  min={1}
                  step="any"
                  value={packSize}
                  onChange={(e) => setPackSize(e.target.value)}
                />
              </div>

              <div className="col-span-12 md:col-span-4 min-w-0 grid gap-1">
                <label className={labelCls}>Ultimo costo (EUR)</label>
                <input
                  className={inputCls}
                  placeholder="Es. 18,90"
                  value={lastCostEuro}
                  onChange={(e) => setLastCostEuro(e.target.value)}
                />
              </div>

              <div className="col-span-12 md:col-span-3 min-w-0 grid gap-1">
                <label className={labelCls}>UM</label>
                <div className="relative">
                  <select
                    className={selectCls}
                    value={um}
                    onChange={(e) => handleUmChange(e.target.value as ItemUm)}
                  >
                    <option value="PZ">Pezzi (PZ)</option>
                    <option value="CL">Centilitri (CL)</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                </div>

                <div className={helpCls}>
                  PZ per articoli contati a pezzi. CL per liquidi.
                </div>
              </div>

              <div className="col-span-12 md:col-span-3 min-w-0 grid gap-1">
                <label className={labelCls}>Quantità base</label>
                <input
                  className={inputCls}
                  type="number"
                  min={1}
                  step="any"
                  value={baseQty}
                  onChange={(e) => setBaseQty(e.target.value)}
                  placeholder={um === "PZ" ? "1" : "Es. 70"}
                />
                <div className={helpCls}>
                  {um === "PZ"
                    ? "Per gli articoli a pezzi deve essere 1."
                    : "Inserisci la quantità reale in CL."}
                </div>
              </div>

              <div className="col-span-12 md:col-span-6 min-w-0 grid gap-1">
                <label className={labelCls}>URL immagine</label>
                <input
                  className={inputCls}
                  placeholder="https://..."
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                />
                <div className={helpCls}>
                  Opzionale. Deve iniziare con http/https.
                </div>
              </div>

              <div className="col-span-12 md:col-span-5 min-w-0 grid gap-1">
                <label className={labelCls}>Anteprima</label>
                <div className="h-[132px] rounded-xl border border-gray-200 bg-white flex items-center justify-center overflow-hidden">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="Anteprima"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="text-sm text-gray-500">Nessuna immagine</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200 bg-white">
            <button className="btn-ghost" onClick={onClose} disabled={loading}>
              Annulla
            </button>
            <button className="btn-primary" onClick={handleSave} disabled={loading}>
              {loading ? "Salvataggio..." : "Salva"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
