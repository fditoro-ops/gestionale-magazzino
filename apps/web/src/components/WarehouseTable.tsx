import { useMemo, useState } from "react";

type WarehouseRow = {
  itemId: string;
  sku: string;
  name: string;
  stockBt: number;
  minStockCl?: number;
  underMin: boolean;
  categoryId?: string;
  supplier?: string;
};

export default function WarehouseTable({
  rows,
  onPickSku,
}: {
  rows: WarehouseRow[];
  onPickSku?: (sku: string) => void;
}) {
  const [q, setQ] = useState("");
  const [onlyUnderMin, setOnlyUnderMin] = useState(false);

  const filtered = useMemo(() => {
    const qNorm = q.trim().toUpperCase();
    let r = rows;

    if (qNorm) {
      r = r.filter((x) => {
        return (
          x.sku.toUpperCase().includes(qNorm) ||
          x.name.toUpperCase().includes(qNorm)
        );
      });
    }

    if (onlyUnderMin) {
      r = r.filter((x) => x.underMin);
    }

    return [...r].sort((a, b) => {
      if (a.underMin !== b.underMin) return a.underMin ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [rows, q, onlyUnderMin]);

  return (
    <div className="grid gap-4">
      {/* Toolbar */}
      <div className="panel-glass p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h2 className="text-base font-semibold text-gray-900 m-0">
              Magazzino
            </h2>
            <span className="text-xs text-gray-500">
              {filtered.length} righe
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cerca SKU o nome..."
              className="h-10 w-72 max-w-full rounded-lg border border-gray-200 bg-white/80 backdrop-blur-sm px-3 text-sm outline-none focus:ring-2 focus:ring-teal-600/30"
            />

            <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
              <input
                type="checkbox"
                checked={onlyUnderMin}
                onChange={(e) => setOnlyUnderMin(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              Solo sotto scorta
            </label>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-white/40 bg-white/70 backdrop-blur-md overflow-hidden shadow-sm">
        <table className="table">
          <thead className="bg-white/50 backdrop-blur-sm text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="th">SKU</th>
              <th className="th">Nome</th>
              <th className="th text-right">Stock (BT)</th>
              <th className="th text-right">Min (CL)</th>
              <th className="th">Stato</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((r) => (
              <tr
                key={r.itemId}
                onClick={() => onPickSku?.(r.sku)}
                className={`transition-colors ${
                  r.underMin ? "bg-red-50/30" : ""
                } hover:bg-white/40 ${onPickSku ? "cursor-pointer" : ""}`}
              >
                <td className="td">
                  <span className="font-semibold text-gray-900">{r.sku}</span>
                </td>

                <td className="td">{r.name}</td>

                <td className="td text-right font-semibold tabular-nums text-gray-800">
                  {r.stockBt}
                </td>

                <td className="td text-right tabular-nums text-gray-700">
                  {typeof r.minStockCl === "number" ? r.minStockCl : "-"}
                </td>

                <td className="td">
                  {r.underMin ? (
                    <span className="pill pill-bad">Sotto scorta</span>
                  ) : (
                    <span className="pill pill-ok">OK</span>
                  )}
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td className="td py-6 text-gray-500" colSpan={5}>
                  Nessun risultato.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-gray-500">
        Tip: clicca una riga per precompilare lo SKU nei movimenti.
      </div>
    </div>
  );
}