import { authFetch } from "./authFetch.js";

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

  cash_declared: number;
  card_declared: number;
  satispay_declared: number;
  other_declared: number;

  declared_total: number;
  delta: number;

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

export type ListCashClosuresParams = {
  dateFrom?: string;
  dateTo?: string;
  status?: CashClosureStatus;
  operatorId?: string;
};

export type CreateCashClosureInput = {
  business_date: string;
  operator_id?: string | null;
  operator_name?: string | null;

  theoretical_base: number;
  cash_declared?: number;
  card_declared?: number;
  satispay_declared?: number;
  other_declared?: number;

  notes?: string | null;
};

export type UpdateCashClosureInput = Partial<CreateCashClosureInput>;

function qs(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export async function listCashClosures(params: ListCashClosuresParams = {}): Promise<CashClosure[]> {
  const res = await authFetch(
    `/cash-closures${qs({
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      status: params.status,
      operatorId: params.operatorId,
    })}`
  );
  if (!res.ok) throw new Error("Errore caricamento chiusure cassa");
  return res.json();
}

export async function getCashClosure(id: string): Promise<CashClosure> {
  const res = await authFetch(`/cash-closures/${id}`);
  if (!res.ok) throw new Error("Errore caricamento dettaglio chiusura");
  return res.json();
}

export async function createCashClosure(input: CreateCashClosureInput): Promise<CashClosure> {
  const res = await authFetch(`/cash-closures`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("Errore creazione chiusura cassa");
  return res.json();
}

export async function updateCashClosure(id: string, input: UpdateCashClosureInput): Promise<CashClosure> {
  const res = await authFetch(`/cash-closures/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("Errore aggiornamento chiusura cassa");
  return res.json();
}

export async function closeCashClosure(id: string): Promise<CashClosure> {
  const res = await authFetch(`/cash-closures/${id}/close`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Errore chiusura cassa");
  return res.json();
}

export async function verifyCashClosure(id: string): Promise<CashClosure> {
  const res = await authFetch(`/cash-closures/${id}/verify`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Errore verifica chiusura cassa");
  return res.json();
}

export async function cancelCashClosure(id: string): Promise<CashClosure> {
  const res = await authFetch(`/cash-closures/${id}/cancel`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Errore annullamento chiusura cassa");
  return res.json();
}

export async function uploadCashClosureReceipt(id: string, file: File): Promise<CashClosure> {
  const fd = new FormData();
  fd.append("receipt", file);

  const res = await authFetch(`/cash-closures/${id}/receipt`, {
    method: "POST",
    body: fd,
  });

  if (!res.ok) throw new Error("Errore upload scontrino");
  return res.json();
}
