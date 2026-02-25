// src/components/orders/orders.types.ts
export type Supplier = "DORECA" | "ALPORI" | "VARI";
export type OrderStatus = "DRAFT" | "SENT" | "PARTIAL" | "RECEIVED";

export type OrderLine = {
  sku: string;
  qtyOrderedPz: number;
  qtyReceivedPz: number;
};

export type Order = {
  orderId: string;
  supplier: Supplier;
  status: OrderStatus;
  createdAt: string;
  sentAt?: string | null;
  receivedAt?: string | null;
  notes?: string | null;
  lines: OrderLine[];
};

export type OrdersFilters = {
  q: string;
  supplier: Supplier | "ALL";
  status: OrderStatus | "ALL";
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;   // YYYY-MM-DD
};
