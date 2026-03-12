import { useMemo } from "react";
import type { Movement } from "../types/movement";

type ItemLite = {
  sku: string;
  name?: string;
};

type Props = {
  movements: Movement[];
  items: ItemLite[];
};

export default function MovementsList({ movements, items }: Props) {
  const ordered = [...movements].sort((a, b) => {
    const bd = b.date ?? b.at ?? "";
    const ad = a.date ?? a.at ?? "";
    return new Date(bd).getTime() - new Date(ad).getTime();
  });

  const itemNameBySku = useMemo(() => {
    const map = new Map<string, string>();

    for (const item of items) {
      const sku = String(item.sku ?? "").trim();
      const name = String(item.name ?? "").trim();

      if (sku) {
        map.set(sku, name || sku);
      }
    }

    return map;
  }, [items]);

  return (
    <div className="panel-glass p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">
          Storico movimenti
        </h2>
        <div className="text-xs text-gray-500">
          {ordered.length} movimenti
        </div>
      </div>

      <ul className="divide-y divide-gray-200/60">
        {ordered.map((m) => {
          const type = (m.type ?? m.kind ?? "") as string;
          const qty = Number(m.quantity ?? m.qty ?? 0);
          const productName = itemNameBySku.get(m.sku) || m.sku;

          const sign = type === "IN" || type === "INVENTORY" ? "+" : "−";

          const color =
            type === "IN"
              ? "text-green-700"
              : type === "OUT"
              ? "text-red-700"
              : type === "ADJUST"
              ? "text-amber-700"
              : "text-sky-700";

          const badge =
            type === "IN"
              ? "bg-green-50/80 text-green-700 border-green-200/60"
              : type === "OUT"
              ? "bg-red-50/80 text-red-700 border-red-200/60"
              : type === "ADJUST"
              ? "bg-amber-50/80 text-amber-700 border-amber-200/60"
              : "bg-sky-50/80 text-sky-700 border-sky-200/60";

          const dt = m.date ?? m.at;
          const dtLabel = dt ? new Date(dt).toLocaleString() : "-";
          const meta = (m.reason ?? m.note) ? `${m.reason ?? m.note}` : "";

          return (
            <li
              key={m.id ?? `${m.sku}-${dt ?? ""}-${type}-${qty}`}
              className="py-3 flex items-center justify-between gap-4 hover:bg-white/30 rounded-lg px-2 transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-medium text-gray-900 truncate">
                    {productName}
                  </div>

                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge}`}
                  >
                    {type || "—"}
                  </span>
                </div>

                <div className="text-sm text-gray-500 truncate">
                  <span className="text-gray-400">{m.sku}</span>
                  {" · "}
                  {dtLabel}
                  {meta ? ` · ${meta}` : ""}
                </div>
              </div>

              <div className={`font-semibold tabular-nums ${color}`}>
                {sign}
                {qty}
              </div>
            </li>
          );
        })}
      </ul>

      {ordered.length === 0 && (
        <div className="text-sm text-gray-500 py-6 text-center">
          Nessun movimento trovato.
        </div>
      )}
    </div>
  );
}
