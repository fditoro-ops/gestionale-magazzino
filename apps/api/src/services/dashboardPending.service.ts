import { pool } from "../db.js";

type PendingAlertRow = {
  sku: string;
  description: string;
  reason: string;
  rowsCount: number;
  qtyTotal: number;
  salesTotal: number;
};

export async function getDashboardPendingAlerts(params: {
  tenantId: string;
}) {
  const { tenantId } = params;

  const summaryRes = await pool.query(
    `
    SELECT
      COUNT(*)::int AS pending_rows,
      COUNT(DISTINCT COALESCE(NULLIF(BTRIM(raw_resolved_sku), ''), product_id, variant_id))::int AS pending_entities,
      COALESCE(SUM(total), 0)::numeric AS pending_sales_total
    FROM cic_pending_rows
    WHERE tenant_id = $1
      AND status = 'PENDING'
    `,
    [tenantId]
  );

  const topRes = await pool.query(
    `
    SELECT
      COALESCE(NULLIF(BTRIM(raw_resolved_sku), ''), '') AS sku,
      COALESCE(NULLIF(BTRIM(description), ''), 'Senza descrizione') AS description,
      reason,
      COUNT(*)::int AS rows_count,
      COALESCE(SUM(qty), 0)::numeric AS qty_total,
      COALESCE(SUM(total), 0)::numeric AS sales_total
    FROM cic_pending_rows
    WHERE tenant_id = $1
      AND status = 'PENDING'
    GROUP BY
      COALESCE(NULLIF(BTRIM(raw_resolved_sku), ''), ''),
      COALESCE(NULLIF(BTRIM(description), ''), 'Senza descrizione'),
      reason
    ORDER BY sales_total DESC, rows_count DESC
    LIMIT 10
    `,
    [tenantId]
  );

  const byReasonRes = await pool.query(
    `
    SELECT
      reason,
      COUNT(*)::int AS rows_count,
      COALESCE(SUM(total), 0)::numeric AS sales_total
    FROM cic_pending_rows
    WHERE tenant_id = $1
      AND status = 'PENDING'
    GROUP BY reason
    ORDER BY rows_count DESC, sales_total DESC
    `,
    [tenantId]
  );

  return {
    pendingRows: Number(summaryRes.rows[0]?.pending_rows || 0),
    pendingEntities: Number(summaryRes.rows[0]?.pending_entities || 0),
    pendingSalesTotal: Number(summaryRes.rows[0]?.pending_sales_total || 0),

    byReason: byReasonRes.rows.map((row) => ({
      reason: String(row.reason || ""),
      rowsCount: Number(row.rows_count || 0),
      salesTotal: Number(row.sales_total || 0),
    })),

    topPending: topRes.rows.map((row): PendingAlertRow => ({
      sku: String(row.sku || ""),
      description: String(row.description || ""),
      reason: String(row.reason || ""),
      rowsCount: Number(row.rows_count || 0),
      qtyTotal: Number(row.qty_total || 0),
      salesTotal: Number(row.sales_total || 0),
    })),
  };
}
