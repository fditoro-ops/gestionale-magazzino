export type MovementType = "IN" | "OUT" | "ADJUST" | "INVENTORY";

export type MovementReason =
  | "VENDITA"
  | "RESO_CLIENTE"
  | "SCARTO"
  | "FURTO"
  | "RETTIFICA"
  | "INVENTARIO"
  | "RICEZIONE_ORDINE";

export type Movement = {
  id: string;
  sku: string;
  quantity: number;
  type: MovementType;
  reason?: MovementReason;
  note?: string;
  date: string;
};
