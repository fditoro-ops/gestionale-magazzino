export type CashClosureStatus =
  | "DRAFT"
  | "CLOSED"
  | "VERIFIED"
  | "CANCELLED";

export type CashClosure = {
  id: string;
  tenant_id: string;

  business_date: string;
  operator_id: string | null;
  operator_name: string | null;

  theoretical_base: number;
  receipt_total: number | null;

  cash_declared: number;
  card_declared: number;
  satispay_declared: number;
  other_declared: number;

  pos1_declared: number;
  pos2_declared: number;
  qromo_declared: number;

  electronic_total: number | null;
  declared_total: number;
  delta: number;
  receipt_delta: number | null;

  receipt_image_url: string | null;
  receipt_image_name: string | null;

  notes: string | null;

  status: CashClosureStatus;
  alert_flags: string[];

  email_sent: boolean;
  email_sent_at: string | null;
  email_error: string | null;

  closed_at: string | null;
  verified_at: string | null;
  verified_by: string | null;

  created_at: string;
  updated_at: string;
};
