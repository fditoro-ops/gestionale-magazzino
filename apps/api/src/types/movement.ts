export type MovementType =
  | "IN"
  | "OUT"
  | "ADJUST"
  | "INVENTORY";

export interface Movement {
  id: string;
  sku: string;
  quantity: number;
  type: MovementType;
  date: string; // ISO
  note?: string;
}
