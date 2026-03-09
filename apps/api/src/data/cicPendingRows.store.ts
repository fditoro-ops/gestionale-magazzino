import fs from "fs";
import path from "path";

export type CicPendingReason =
  | "UNMAPPED_PRODUCT"
  | "UNCLASSIFIED_SKU"
  | "RECIPE_NOT_FOUND";

export type CicPendingStatus = "PENDING" | "PROCESSED";

export type CicPendingRow = {
  id: string;

  docId: string;
  operation: string;
  orderDate: string;
  tenantId: string;

  productId?: string;
  variantId?: string;
  rawResolvedSku?: string;

  qty: number;
  total: number;
  price?: number;
  description?: string;

  reason: CicPendingReason;
  status: CicPendingStatus;

  createdAt: string;
  processedAt?: string | null;

  rawRow?: any;
};

const DATA_DIR = path.resolve(process.cwd(), "apps/api/data");
const FILE_PATH = path.join(DATA_DIR, "cicPendingRows.json");

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(FILE_PATH, "[]", "utf8");
  }
}

export function loadPendingRows(): CicPendingRow[] {
  ensureDataFile();

  try {
    const raw = fs.readFileSync(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("❌ loadPendingRows error:", err);
    return [];
  }
}

function savePendingRows(rows: CicPendingRow[]) {
  ensureDataFile();
  fs.writeFileSync(FILE_PATH, JSON.stringify(rows, null, 2), "utf8");
}

function buildPendingRowId(row: {
  docId: string;
  productId?: string;
  variantId?: string;
  reason: CicPendingReason;
}) {
  return [
    row.docId || "",
    row.productId || "",
    row.variantId || "",
    row.reason || "",
  ].join("::");
}

export function upsertPendingRow(
  input: Omit<CicPendingRow, "id" | "createdAt" | "status" | "processedAt">
) {
  const rows = loadPendingRows();

  const id = buildPendingRowId({
    docId: input.docId,
    productId: input.productId,
    variantId: input.variantId,
    reason: input.reason,
  });

  const existingIndex = rows.findIndex((r) => r.id === id);

  const row: CicPendingRow = {
    ...input,
    id,
    status: "PENDING",
    createdAt:
      existingIndex >= 0 ? rows[existingIndex].createdAt : new Date().toISOString(),
    processedAt: null,
  };

  if (existingIndex >= 0) {
    rows[existingIndex] = row;
  } else {
    rows.push(row);
  }

  savePendingRows(rows);

  console.log("🅿️ Pending row salvata:", {
    id: row.id,
    docId: row.docId,
    productId: row.productId,
    variantId: row.variantId,
    reason: row.reason,
  });

  return row;
}

export function listPendingRows(status?: CicPendingStatus) {
  const rows = loadPendingRows();
  if (!status) return rows;
  return rows.filter((r) => r.status === status);
}

export function markPendingRowProcessed(id: string) {
  const rows = loadPendingRows();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) return false;

  rows[idx] = {
    ...rows[idx],
    status: "PROCESSED",
    processedAt: new Date().toISOString(),
  };

  savePendingRows(rows);
  return true;
}
