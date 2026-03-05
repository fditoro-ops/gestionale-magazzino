// src/data/cicUnresolved.store.ts
import fs from "fs";
import path from "path";

export type CicUnresolved = {
  key: string;              // es: "prod:<uuid>" oppure "var:<uuid>"
  productId?: string;
  variantId?: string;
  rawSku: string;

  firstSeenAt: string;
  lastSeenAt: string;
  count: number;

  lastDocId?: string;
  lastOperation?: string;
  lastTotal?: number;
};

const FILE = path.resolve("data/cic-unresolved.json");

function loadAll(): CicUnresolved[] {
  try {
    if (!fs.existsSync(FILE)) return [];
    const raw = fs.readFileSync(FILE, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveAll(rows: CicUnresolved[]) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(rows, null, 2), "utf-8");
}

export function upsertUnresolved(input: {
  productId?: string;
  variantId?: string;
  rawSku: string;
  docId?: string;
  operation?: string;
  total?: number;
}) {
  const now = new Date().toISOString();

  const key =
    input.productId
      ? `prod:${input.productId}`
      : input.variantId
        ? `var:${input.variantId}`
        : `sku:${input.rawSku}`;

  const all = loadAll();
  const idx = all.findIndex((x) => x.key === key);

  if (idx >= 0) {
    all[idx] = {
      ...all[idx],
      lastSeenAt: now,
      count: (all[idx].count ?? 0) + 1,
      lastDocId: input.docId ?? all[idx].lastDocId,
      lastOperation: input.operation ?? all[idx].lastOperation,
      lastTotal: typeof input.total === "number" ? input.total : all[idx].lastTotal,
    };
  } else {
    all.push({
      key,
      productId: input.productId,
      variantId: input.variantId,
      rawSku: input.rawSku,
      firstSeenAt: now,
      lastSeenAt: now,
      count: 1,
      lastDocId: input.docId,
      lastOperation: input.operation,
      lastTotal: input.total,
    });
  }

  saveAll(all);
}

export function listUnresolved() {
  // più recenti prima
  return loadAll().sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1));
}
