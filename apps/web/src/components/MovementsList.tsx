import type { Movement } from "../types/movement";

type Props = {
  movements: Movement[];
};

export default function MovementsList({ movements }: Props) {
  const ordered = [...movements].sort((a, b) => {
    const bd = b.date ?? b.at ?? "";
    const ad = a.date ?? a.at ?? "";
    return new Date(bd).getTime() - new Date(ad).getTime();
  });

  return (
    <div className="border rounded p-4 bg-white">
      <h2 className="font-bold mb-3">Storico movimenti</h2>

      <ul className="space-y-2 text-sm">
        {ordered.map((m) => {
          const type = m.type ?? m.kind ?? "";
          const qty = m.quantity ?? m.qty ?? 0;

          const sign = type === "IN" || type === "INVENTORY" ? "+" : "−";

          const color =
            type === "IN"
              ? "text-green-600"
              : type === "OUT"
              ? "text-red-600"
              : type === "ADJUST"
              ? "text-yellow-600"
              : "text-blue-600";

          const dt = m.date ?? m.at;
          const dtLabel = dt ? new Date(dt).toLocaleString() : "-";

          return (
            <li
              key={m.id ?? `${m.sku}-${dt ?? ""}-${type}-${qty}`}
              className="flex justify-between items-center border-b pb-1"
            >
              <div>
                <div className="font-medium">
                  {m.sku}{" "}
                  <span className="text-gray-500">
                    ({type || "—"})
                  </span>
                </div>

                <div className="text-gray-500">
                  {dtLabel}
                  {(m.reason ?? m.note) ? ` · ${m.reason ?? m.note}` : ""}
                </div>
              </div>

              <div className={`font-bold ${color}`}>
                {sign}
                {qty}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
