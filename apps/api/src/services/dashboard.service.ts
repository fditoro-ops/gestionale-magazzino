import { pool } from "../db.js";

export async function getDashboardSummary(params: {
  tenantId: string;
  from?: string;
  to?: string;
}) {
  const { tenantId, from, to } = params;

  const values: any[] = [tenantId];
  let whereDocs = `WHERE d.tenant_id = $1 AND d.status = 'VALID'`;

  // =========================
  // 📅 FILTRI DATA
  // Base unica = sales_documents
  // =========================
  if (from) {
    values.push(from);
    whereDocs += ` AND d.document_date >= $${values.length}`;
  }

  if (to) {
    values.push(to);
    whereDocs += ` AND d.document_date <= $${values.length}`;
  }

  // fallback: oggi Europe/Rome
  if (!from && !to) {
    whereDocs += `
      AND d.document_date >= (date_trunc('day', NOW() AT TIME ZONE 'Europe/Rome'))
      AND d.document_date < ((date_trunc('day', NOW() AT TIME ZONE 'Europe/Rome')) + interval '1 day')
    `;
  }

  // =========================
  // 📊 KPI DOCUMENTI + RIGHE
  // =========================
  const summaryRes = await pool.query(
    `
    WITH base_docs AS (
      SELECT
        d.document_id,
        d.document_date,
        d.total_amount
      FROM sales_documents d
      ${whereDocs}
    ),
    base_lines AS (
      SELECT
        l.document_id,
        l.sku,
        l.description,
        l.qty,
        l.line_total
      FROM sales_lines l
      INNER JOIN base_docs bd
        ON bd.document_id = l.document_id
    )
    SELECT
      (SELECT COUNT(*)::int FROM base_docs) AS documents_count,
      (SELECT COALESCE(SUM(total_amount), 0)::numeric FROM base_docs) AS total_sales,
      (SELECT COALESCE(AVG(total_amount), 0)::numeric FROM base_docs) AS avg_ticket,
      (SELECT COUNT(*)::int FROM base_lines) AS lines_count
    `,
    values
  );

  // =========================
  // 🏆 TOP PRODOTTI
  // Allineati a CIC: niente filtro resolved_ok
  // =========================
  const topProductsRes = await pool.query(
    `
    WITH base_docs AS (
      SELECT
        d.document_id
      FROM sales_documents d
      ${whereDocs}
    ),
    base_lines AS (
      SELECT
        l.document_id,
        l.sku,
        l.description,
        l.qty,
        l.line_total,
        COALESCE(
          NULLIF(BTRIM(l.description), ''),
          NULLIF(BTRIM(l.sku), ''),
          'SENZA_DESCRIZIONE'
        ) AS product_name
      FROM sales_lines l
      INNER JOIN base_docs bd
        ON bd.document_id = l.document_id
    )
    SELECT
      product_name,
      COALESCE(NULLIF(BTRIM(sku), ''), '-') AS sku,
      COALESCE(SUM(qty), 0)::numeric AS qty_sold,
      COALESCE(SUM(line_total), 0)::numeric AS total_sales
    FROM base_lines
    GROUP BY product_name, COALESCE(NULLIF(BTRIM(sku), ''), '-')
    ORDER BY total_sales DESC, qty_sold DESC
    LIMIT 10
    `,
    values
  );

  const row = summaryRes.rows[0] || {};

  return {
    documentsCount: Number(row.documents_count || 0),
    totalSales: Number(row.total_sales || 0),
    avgTicket: Number(row.avg_ticket || 0),
    linesCount: Number(row.lines_count || 0),
    topProducts: topProductsRes.rows.map((r) => ({
      productName: String(r.product_name || ""),
      sku: String(r.sku || "-"),
      qtySold: Number(r.qty_sold || 0),
      totalSales: Number(r.total_sales || 0),
    })),
  };
}
