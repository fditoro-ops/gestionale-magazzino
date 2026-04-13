import { pool } from "../db.js";

export async function getDashboardSummary(params: {
  tenantId: string;
  from?: string;
  to?: string;
}) {
  const { tenantId, from, to } = params;

  const values: any[] = [tenantId];

  // 🔥 separiamo le WHERE
  let whereDocs = `WHERE tenant_id = $1`;
  let whereLines = `WHERE 1=1`;

  // =========================
  // 📅 FILTRI DATA
  // =========================

  if (from) {
    values.push(from);
    whereDocs += ` AND document_date >= $${values.length}`;
    whereLines += ` AND created_at >= $${values.length}`;
  }

  if (to) {
    values.push(to);
    whereDocs += ` AND document_date <= $${values.length}`;
    whereLines += ` AND created_at <= $${values.length}`;
  }

  // 🔥 fallback: OGGI (timezone ITA)
  if (!from && !to) {
    whereDocs += `
      AND document_date >= date_trunc('day', NOW() AT TIME ZONE 'Europe/Rome')
      AND document_date < date_trunc('day', NOW() AT TIME ZONE 'Europe/Rome') + interval '1 day'
    `;

    whereLines += `
      AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'Europe/Rome')
      AND created_at < date_trunc('day', NOW() AT TIME ZONE 'Europe/Rome') + interval '1 day'
    `;
  }

  // =========================
  // 📊 DOCUMENTI
  // =========================

  const docsRes = await pool.query(
    `
    SELECT
      COUNT(*)::int AS documents_count,
      COALESCE(SUM(total_amount), 0)::numeric AS total_sales,
      COALESCE(AVG(total_amount), 0)::numeric AS avg_ticket
    FROM sales_documents
    ${whereDocs}
      AND status = 'VALID'
    `,
    values
  );

  // =========================
  // 📦 RIGHE
  // =========================

  const linesRes = await pool.query(
    `
    SELECT
      COUNT(*)::int AS lines_count
    FROM sales_lines
    ${whereLines}
    `,
    values
  );

  // =========================
  // 🏆 TOP PRODOTTI
  // =========================

  const topProductsRes = await pool.query(
    `
    SELECT
      COALESCE(NULLIF(BTRIM(description), ''), sku) AS product_name,
      sku,
      COALESCE(SUM(qty), 0)::numeric AS qty_sold,
      COALESCE(SUM(line_total), 0)::numeric AS total_sales
    FROM sales_lines
    ${whereLines}
      AND resolved_ok = true
    GROUP BY sku, COALESCE(NULLIF(BTRIM(description), ''), sku)
    ORDER BY total_sales DESC, qty_sold DESC
    LIMIT 10
    `,
    values
  );

  // =========================
  // 🎯 RETURN
  // =========================

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
