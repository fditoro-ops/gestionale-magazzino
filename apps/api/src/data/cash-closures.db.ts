import { randomUUID } from "crypto";
import { pool } from "../db.js";
import type { CashClosure } from "../types/cash-closure.js";

type ListFilters = {
  tenant_id: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  operatorId?: string;
};

type InsertCashClosureInput = {
  tenant_id: string;
  business_date: string;
  operator_id?: string | null;
  operator_name?: string | null;
  theoretical_base: number;
  cash_declared: number;
  card_declared: number;
  satispay_declared: number;
  other_declared: number;
  declared_total: number;
  delta: number;
  notes?: string | null;
  alert_flags: string[];
};

type UpdateCashClosureInput = {
  business_date?: string;
  operator_id?: string | null;
  operator_name?: string | null;
  theoretical_base?: number;
  cash_declared?: number;
  card_declared?: number;
  satispay_declared?: number;
  other_declared?: number;
  declared_total?: number;
  delta?: number;
  notes?: string | null;
  alert_flags?: string[];
  receipt_image_url?: string | null;
  receipt_image_name?: string | null;
  status?: string;
  email_sent?: boolean;
  email_sent_at?: string | null;
  email_error?: string | null;
  closed_at?: string | null;
  verified_at?: string | null;
  verified_by?: string | null;
};

function mapRow(row: any): CashClosure {
  return {
    ...row,
    theoretical_base: Number(row.theoretical_base),
    cash_declared: Number(row.cash_declared),
    card_declared: Number(row.card_declared),
    satispay_declared: Number(row.satispay_declared),
    other_declared: Number(row.other_declared),
    declared_total: Number(row.declared_total),
    delta: Number(row.delta),
    alert_flags: Array.isArray(row.alert_flags) ? row.alert_flags : [],
  };
}

export async function listCashClosuresDb(filters: ListFilters): Promise<CashClosure[]> {
  const values: any[] = [filters.tenant_id];
  const where = [`tenant_id = $1`];

  if (filters.dateFrom) {
    values.push(filters.dateFrom);
    where.push(`business_date >= $${values.length}`);
  }

  if (filters.dateTo) {
    values.push(filters.dateTo);
    where.push(`business_date <= $${values.length}`);
  }

  if (filters.status) {
    values.push(filters.status);
    where.push(`status = $${values.length}`);
  }

  if (filters.operatorId) {
    values.push(filters.operatorId);
    where.push(`operator_id = $${values.length}`);
  }

  const sql = `
    SELECT *
    FROM cash_closures
    WHERE ${where.join(" AND ")}
    ORDER BY business_date DESC, created_at DESC
  `;

  const { rows } = await pool.query(sql, values);
  return rows.map(mapRow);
}

export async function getCashClosureByIdDb(
  tenant_id: string,
  id: string
): Promise<CashClosure | null> {
  const { rows } = await pool.query(
    `
    SELECT *
    FROM cash_closures
    WHERE tenant_id = $1
      AND id = $2
    LIMIT 1
    `,
    [tenant_id, id]
  );

  if (!rows[0]) return null;
  return mapRow(rows[0]);
}

export async function createCashClosureDb(
  input: InsertCashClosureInput
): Promise<CashClosure> {
  const id = randomUUID();

  const { rows } = await pool.query(
    `
    INSERT INTO cash_closures (
      id,
      tenant_id,
      business_date,
      operator_id,
      operator_name,
      theoretical_base,
      cash_declared,
      card_declared,
      satispay_declared,
      other_declared,
      declared_total,
      delta,
      notes,
      alert_flags
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb
    )
    RETURNING *
    `,
    [
      id,
      input.tenant_id,
      input.business_date,
      input.operator_id ?? null,
      input.operator_name ?? null,
      input.theoretical_base,
      input.cash_declared,
      input.card_declared,
      input.satispay_declared,
      input.other_declared,
      input.declared_total,
      input.delta,
      input.notes ?? null,
      JSON.stringify(input.alert_flags ?? []),
    ]
  );

  return mapRow(rows[0]);
}

export async function updateCashClosureDb(
  tenant_id: string,
  id: string,
  patch: UpdateCashClosureInput
): Promise<CashClosure | null> {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);

  if (!entries.length) {
    return getCashClosureByIdDb(tenant_id, id);
  }

  const values: any[] = [tenant_id, id];
  const sets: string[] = [];

  for (const [key, value] of entries) {
    values.push(key === "alert_flags" ? JSON.stringify(value ?? []) : value);

    const param = `$${values.length}`;

    if (key === "alert_flags") {
      sets.push(`${key} = ${param}::jsonb`);
    } else {
      sets.push(`${key} = ${param}`);
    }
  }

  values.push(new Date().toISOString());
  sets.push(`updated_at = $${values.length}`);

  const sql = `
    UPDATE cash_closures
    SET ${sets.join(", ")}
    WHERE tenant_id = $1
      AND id = $2
    RETURNING *
  `;

  const { rows } = await pool.query(sql, values);
  if (!rows[0]) return null;

  return mapRow(rows[0]);
}
