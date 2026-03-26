import { pool } from "../db.js";

export async function getDashboardSummary(params: {
  tenantId: string;
  from?: string;
  to?: string;
}) {
  const { tenantId, from, to } = params;

  const values: any[] = [tenantId];
  let where = `WHERE tenant_id = $1`;

  if (from) {
    values.push(from);
    where += ` AND document_date >= $${values.length}`;
  }

  if (to) {
    values.push(to);
    where += ` AND document_date <= $${values.length}`;
  }

  const docsRes = await pool.query(
    `
    SELECT
      COUNT(*)::int AS documents_count,
      COALESCE(SUM(total_amount), 0)::numeric AS total_sales,
      COALESCE(AVG(total_amount), 0)::numeric AS avg_ticket
    FROM sales_documents
    ${where}
      AND status = 'VALID'
    `,
    values
  );

  const linesRes = await pool.query(
    `
    SELECT
      COUNT(*)::int AS lines_count
    FROM sales_lines
    ${where.replace("document_date", "created_at")}
    `,
    values
  );

  const topProductsRes = await pool.query(
    `
    SELECT
      COALESCE(NULLIF(BTRIM(description), ''), sku) AS product_name,
      sku,
      COALESCE(SUM(qty), 0)::numeric AS qty_sold,
      COALESCE(SUM(line_total), 0)::numeric AS total_sales
    FROM sales_lines
    ${where.replace("document_date", "created_at")}
      AND resolved_ok = true
    GROUP BY sku, COALESCE(NULLIF(BTRIM(description), ''), sku)
    ORDER BY total_sales DESC, qty_sold DESC
    LIMIT 10
    `,
    values
  );

  return {
    documentsCount: Number(docsRes.rows[0]?.documents_count || 0),
    totalSales: Number(docsRes.rows[0]?.total_sales || 0),
    avgTicket: Number(docsRes.rows[0]?.avg_ticket || 0),
    linesCount: Number(linesRes.rows[0]?.lines_count || 0),
    topProducts: topProductsRes.rows.map((row) => ({
      productName: String(row.product_name || ""),
      sku: String(row.sku || ""),
      qtySold: Number(row.qty_sold || 0),
      totalSales: Number(row.total_sales || 0),
    })),
  };
}
