import fs from "fs";
import path from "path";

export type Supplier = "DORECA" | "ALPORI" | "VARI";
export type OrderStatus = "DRAFT" | "SENT" | "PARTIAL" | "RECEIVED";

export type OrderLine = {
  sku: string;
  qtyOrderedConf: number;   // ✅ confezioni ordinate
  qtyReceivedConf: number;  // ✅ confezioni ricevute
};

export type Order = {
  orderId: string;
  supplier: "DORECA" | "ALPORI" | "VARI";
  status: "DRAFT" | "SENT" | "PARTIAL" | "RECEIVED";
  createdAt: string;
  sentAt?: string | null;
  receivedAt?: string | null;
  notes?: string | null;
  lines: OrderLine[];
};

const FILE = path.resolve("data/orders.json");

export function loadOrders(fallback: Order[] = []): Order[] {
  if (!fs.existsSync(FILE)) return fallback;
  return JSON.parse(fs.readFileSync(FILE, "utf-8"));
}

export function saveOrders(orders: Order[]) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(orders, null, 2));
}
