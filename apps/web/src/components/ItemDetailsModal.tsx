import { useEffect, useMemo, useState } from "react";
import { X, Power, ChevronDown } from "lucide-react";

export type Item = {
  itemId?: string;
  sku: string;
  name?: string;
  brand?: string | null;

  categoryId?: string | null;
  supplier?: string | null;

  stockKind?: "UNIT" | "VOLUME_CONTAINER";
  unitToCl?: number | null;

  containerSizeCl?: number | null;
  containerLabel?: string | null;

  minStockCl?: number | null;
  packSize?: number | null;

  lastCostCents?: number | null;
  costCurrency?: string | null;

  imageUrl?: string | null;
  active?: boolean;
};

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

export default function ItemDetailsModal({
  open,
  item,
  onClose,
  onSavePatch,
  loading,
}: {
  open: boolean;
  item: Item | null;
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
  const [stockKind, setStockKind] = useState<"UNIT" | "VOLUME_CONTAINER">("UNIT");
  const [unitToCl, setUnitToCl] = useState<number>(33);

  const [containerSizeCl, setContainerSizeCl] = useState<number>(70);
  const [containerLabel, setContainerLabel] = useState<string>("Bottiglia");

  const [minStockCl, setMinStockCl] = useState<number>(0);
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
    setCategoryId(item.categoryId ?? "");

    setPackSize(
      typeof item.packSize === "number" && item.packSize > 0 ? String(item.packSize) : ""
    );

    setStockKind((item.stockKind ?? "UNIT") as any);
    setUnitToCl(Number(item.unitToCl ?? 33));

    setContainerSizeCl(Number(item.containerSizeCl ?? 70));
    setContainerLabel(item.containerLabel ?? "Bottiglia");

    setMinStockCl(Number(item.minStockCl ?? 0));
    setLastCostEuro(centsToEuroString(item.lastCostCents));

    setImageUrl(item.imageUrl ?? "");
    setActive(Boolean(item.active ?? true));
  }, [open, item]);

  if (!open || !item) return null;

  async function handleSave() {
  setErr(null);

  if (!item) return; // ✅ FIX TS18047

  if (!name.trim()) {
    setErr("Nome articolo obbligatorio.");
    return;
  }

  if (!isHttpUrl(imageUrl)) {
    setErr("URL immagine non valido (deve iniziare con http/https).");
    return;
  }

  const patch: any = {
    name: name.trim(),
    brand: brand.trim() || null,
    supplier: supplier || "VARI",
    categoryId: categoryId.trim() || null,
    packSize: packSize.trim() ? Number(packSize) : null,
    stockKind,
    minStockCl: Number(minStockCl ?? 0),
    lastCostCents: euroToCents(lastCostEuro),
    costCurrency: "EUR",
    imageUrl: imageUrl.trim() || null,
    active,
  };

if (stockKind === "UNIT") {
  patch.unitToCl = Number(unitToCl ?? 0);
} else {
  patch.containerSizeCl = Number(containerSizeCl ?? 0);
  patch.containerLabel = containerLabel.trim() || "Bottiglia";
}
    
  try {
    await onSavePatch(item.sku, patch);
    onClose();
  } catch (e: any) {
    setErr(e?.message ?? "Errore salvataggio");
  }
}
  const labelCls = "text-xs font-medium text-gray-600";
  const helpCls = "text-xs text-gray-500";

  // ✅ stessa altezza OVUNQUE
  const inputCls =
    "w-full h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-sm text-gray-900 shadow-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-teal-600/20";

  // ✅ select “vero” ma identico all’input (freccia custom)
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
          {/* header */}
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

          {/* BODY */}
          <div className="p-5">
            {err && (
              <div className="mb-3 text-sm text-red-600">{err}</div>
            )}

            <div className="grid grid-cols-12 gap-x-6 gap-y-4 items-start">
              {/* Nome articolo */}
              <div className="col-span-12 md:col-span-6 min-w-0 grid gap-1">
                <label className={labelCls}>Nome articolo</label>
                <input
                  className={inputCls}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              {/* Brand */}
              <div className="col-span-12 md:col-span-3 min-w-0 grid gap-1">
                <label className={labelCls}>Brand</label>
                <input
                  className={inputCls}
                  placeholder="Opzionale"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                />
              </div>

              {/* Fornitore */}
              <div className="col-span-12 md:col-span-3 min-w-0 grid gap-1">
                <label className={labelCls}>Fornitore</label>

                <div className="relative">
                  <select
                    className={selectCls}
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                  >
                    <option value="DORECA">DORECA</option>
                    <option value="ALPORI">ALPORI</option>
                    <option value="VARI">VARI</option>
                  </select>

                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                </div>
              </div>

              {/* Categoria */}
              <div className="col-span-12 md:col-span-6 min-w-0 grid gap-1">
                <label className={labelCls}>Categoria</label>
                <input
                  className={inputCls}
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                />
                <div className={helpCls}>
                  Per ora testo libero (poi lo colleghiamo alla select).
                </div>
              </div>

              {/* Pezzi per cassa */}
              <div className="col-span-12 md:col-span-2 min-w-0 grid gap-1">
                <label className={labelCls}>Pezzi per cassa</label>
                <input
                  className={inputCls}
                  type="number"
                  value={packSize}
                  onChange={(e) => setPackSize(e.target.value)}
                />
              </div>

              {/* Ultimo costo */}
              <div className="col-span-12 md:col-span-4 min-w-0 grid gap-1">
                <label className={labelCls}>Ultimo costo (EUR)</label>
                <input
                  className={inputCls}
                  placeholder="Es. 18,90"
                  value={lastCostEuro}
                  onChange={(e) => setLastCostEuro(e.target.value)}
                />
              </div>

              {/* Gestione stock */}
              <div className="col-span-12 md:col-span-4 min-w-0 grid gap-1">
                <label className={labelCls}>Gestione stock</label>

                <div className="relative">
                  <select
                    className={selectCls}
                    value={stockKind}
                    onChange={(e) => setStockKind(e.target.value as any)}
                  >
                    <option value="UNIT">Pezzi (PZ)</option>
                    <option value="VOLUME_CONTAINER">Volume (CL)</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                </div>

                <div className={helpCls}>
                  PZ: lattine/bottiglie. CL: bottiglie da spillare.
                </div>
              </div>

{stockKind === "UNIT" ? (
  <div className="col-span-12 md:col-span-4 min-w-0 grid gap-1">
    <label className={labelCls}>CL per pezzo</label>
    <input
      className={inputCls}
      type="number"
      value={unitToCl}
      onChange={(e) => setUnitToCl(Number(e.target.value))}
    />
  </div>
) : (
  <>
    <div className="col-span-12 md:col-span-2 min-w-0 grid gap-1">
      <label className={labelCls}>CL contenitore</label>
      <input
        className={inputCls}
        type="number"
        value={containerSizeCl}
        onChange={(e) => setContainerSizeCl(Number(e.target.value))}
      />
    </div>

    <div className="col-span-12 md:col-span-2 min-w-0 grid gap-1">
      <label className={labelCls}>Nome contenitore</label>
      <input
        className={inputCls}
        value={containerLabel}
        onChange={(e) => setContainerLabel(e.target.value)}
        placeholder="Es. Bottiglia"
      />
    </div>
  </>
)}

              {/* Scorta minima */}
              <div className="col-span-12 md:col-span-4 min-w-0 grid gap-1">
                <label className={labelCls}>Scorta minima (CL)</label>
                <input
                  className={inputCls}
                  type="number"
                  value={minStockCl}
                  onChange={(e) => setMinStockCl(Number(e.target.value))}
                />
              </div>

              {/* URL immagine */}
              <div className="col-span-12 md:col-span-7 min-w-0 grid gap-1">
                <label className={labelCls}>URL immagine</label>
                <input
                  className={inputCls}
                  placeholder="https://..."
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                />
                <div className={helpCls}>Opzionale. Deve iniziare con http/https.</div>
              </div>

              {/* Anteprima */}
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

          {/* footer */}
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
