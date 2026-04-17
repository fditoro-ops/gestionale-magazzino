import { pool } from "../db.js";

type DashboardParams = {
  tenantId: string;
  from?: string;
  to?: string;
};

type SqlFilter = {
  values: any[];
  whereDocs: string;
};

function buildDocsFilter(params: DashboardParams): SqlFilter {
  const { tenantId, from, to } = params;

  const values: any[] = [tenantId];
  let whereDocs = `WHERE d.tenant_id = $1 AND d.status = 'VALID'`;

  if (from) {
    values.push(from);
    whereDocs += ` AND d.document_date >= $${values.length}`;
  }

  if (to) {
    values.push(to);
    whereDocs += ` AND d.document_date <= $${values.length}`;
  }

  // fallback: oggi (Europe/Rome)
  if (!from && !to) {
    whereDocs += `
      AND d.document_date >= date_trunc('day', now() AT TIME ZONE 'Europe/Rome')
      AND d.document_date < date_trunc('day', now() AT TIME ZONE 'Europe/Rome') + interval '1 day'
    `;
  }

  return { values, whereDocs };
}

async function querySummary(params: DashboardParams) {
  const { values, whereDocs } = buildDocsFilter(params);

  const res = await pool.query(
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
        l.line_id,
        l.sku,
        l.description,
        l.qty,
        l.line_total,
        l.resolved_ok
      FROM sales_lines l
      INNER JOIN base_docs bd
        ON bd.document_id = l.document_id
    )
    SELECT
      (SELECT COUNT(*)::int FROM base_docs) AS documents_count,
      (SELECT COALESCE(SUM(total_amount), 0)::numeric FROM base_docs) AS total_sales,
      (SELECT COALESCE(AVG(total_amount), 0)::numeric FROM base_docs) AS avg_ticket,
      (SELECT COUNT(*)::int FROM base_lines) AS lines_count,
      (SELECT COALESCE(SUM(qty), 0)::numeric FROM base_lines) AS qty_sold
    `,
    values
  );

  const row = res.rows[0] || {};

  return {
    documentsCount: Number(row.documents_count || 0),
    totalSales: Number(row.total_sales || 0),
    avgTicket: Number(row.avg_ticket || 0),
    linesCount: Number(row.lines_count || 0),
    qtySold: Number(row.qty_sold || 0),
  };
}

async function queryTopProducts(params: DashboardParams) {
  const { values, whereDocs } = buildDocsFilter(params);

  const res = await pool.query(
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

  return res.rows.map((row) => ({
    productName: String(row.product_name || ""),
    sku: String(row.sku || "-"),
    qtySold: Number(row.qty_sold || 0),
    totalSales: Number(row.total_sales || 0),
  }));
}

async function queryDailyTrendLast7Days(tenantId: string) {
  const values = [tenantId];

  const res = await pool.query(
    `
    WITH days AS (
      SELECT generate_series(
        date_trunc('day', (now() AT TIME ZONE 'Europe/Rome')) - interval '6 day',
        date_trunc('day', (now() AT TIME ZONE 'Europe/Rome')),
        interval '1 day'
      )::timestamp AS day
    ),
    docs AS (
      SELECT
        date_trunc('day', d.document_date)::timestamp AS day,
        COUNT(*)::int AS documents_count,
        COALESCE(SUM(d.total_amount), 0)::numeric AS total_sales
      FROM sales_documents d
      WHERE d.tenant_id = $1
        AND d.status = 'VALID'
        AND d.document_date >= date_trunc('day', now() AT TIME ZONE 'Europe/Rome') - interval '6 day'
        AND d.document_date < date_trunc('day', now() AT TIME ZONE 'Europe/Rome') + interval '1 day'
      GROUP BY 1
    )
    SELECT
      to_char(days.day, 'DD/MM') AS label,
      days.day::date AS day,
      COALESCE(docs.documents_count, 0)::int AS documents_count,
      COALESCE(docs.total_sales, 0)::numeric AS total_sales
    FROM days
    LEFT JOIN docs ON docs.day = days.day
    ORDER BY days.day ASC
    `,
    values
  );

  return res.rows.map((row) => ({
    label: String(row.label || ""),
    day: String(row.day || ""),
    documentsCount: Number(row.documents_count || 0),
    totalSales: Number(row.total_sales || 0),
  }));
}

async function queryTodaySummary(tenantId: string) {
  return querySummary({ tenantId });
}

async function queryLast7DaysSummary(tenantId: string) {
  const res = await querySummary({
    tenantId,
    from: "__LAST_7_DAYS__FROM__",
    to: "__LAST_7_DAYS__TO__",
  });

  return res;
}

async function queryLast7DaysSummaryReal(tenantId: string) {
  const values = [tenantId];

  const res = await pool.query(
    `
    WITH base_docs AS (
      SELECT
        d.document_id,
        d.document_date,
        d.total_amount
      FROM sales_documents d
      WHERE d.tenant_id = $1
        AND d.status = 'VALID'
        AND d.document_date >= date_trunc('day', now() AT TIME ZONE 'Europe/Rome') - interval '6 day'
        AND d.document_date < date_trunc('day', now() AT TIME ZONE 'Europe/Rome') + interval '1 day'
    ),
    base_lines AS (
      SELECT
        l.document_id,
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
      (SELECT COUNT(*)::int FROM base_lines) AS lines_count,
      (SELECT COALESCE(SUM(qty), 0)::numeric FROM base_lines) AS qty_sold
    `,
    values
  );

  const row = res.rows[0] || {};

  return {
    documentsCount: Number(row.documents_count || 0),
    totalSales: Number(row.total_sales || 0),
    avgTicket: Number(row.avg_ticket || 0),
    linesCount: Number(row.lines_count || 0),
    qtySold: Number(row.qty_sold || 0),
  };
}

async function queryPendingBreakdown(params: DashboardParams) {
  const { values, whereDocs } = buildDocsFilter(params);

  const res = await pool.query(
    `
    WITH base_docs AS (
      SELECT
        d.document_id
      FROM sales_documents d
      ${whereDocs}
    ),
    pending_rows AS (
      SELECT
        COALESCE(NULLIF(BTRIM(l.pending_reason), ''), 'UNMAPPED_PRODUCT') AS reason,
        COALESCE(
          NULLIF(BTRIM(l.description), ''),
          NULLIF(BTRIM(l.sku), ''),
          'SENZA_DESCRIZIONE'
        ) AS item_name,
        COALESCE(NULLIF(BTRIM(l.sku), ''), '-') AS sku,
        COALESCE(SUM(l.qty), 0)::numeric AS qty,
        COALESCE(SUM(l.line_total), 0)::numeric AS total_sales,
        COUNT(*)::int AS rows_count
      FROM sales_lines l
      INNER JOIN base_docs bd
        ON bd.document_id = l.document_id
      WHERE COALESCE(l.resolved_ok, false) = false
      GROUP BY
        COALESCE(NULLIF(BTRIM(l.pending_reason), ''), 'UNMAPPED_PRODUCT'),
        COALESCE(NULLIF(BTRIM(l.description), ''), NULLIF(BTRIM(l.sku), ''), 'SENZA_DESCRIZIONE'),
        COALESCE(NULLIF(BTRIM(l.sku), ''), '-')
    )
    SELECT
      reason,
      item_name,
      sku,
      qty,
      total_sales,
      rows_count
    FROM pending_rows
    ORDER BY total_sales DESC, qty DESC, rows_count DESC
    LIMIT 20
    `,
    values
  );

  const byReasonRes = await pool.query(
    `
    WITH base_docs AS (
      SELECT
        d.document_id
      FROM sales_documents d
      ${whereDocs}
    )
    SELECT
      COALESCE(NULLIF(BTRIM(l.pending_reason), ''), 'UNMAPPED_PRODUCT') AS reason,
      COUNT(*)::int AS rows_count,
      COALESCE(SUM(l.qty), 0)::numeric AS qty,
      COALESCE(SUM(l.line_total), 0)::numeric AS total_sales
    FROM sales_lines l
    INNER JOIN base_docs bd
      ON bd.document_id = l.document_id
    WHERE COALESCE(l.resolved_ok, false) = false
    GROUP BY COALESCE(NULLIF(BTRIM(l.pending_reason), ''), 'UNMAPPED_PRODUCT')
    ORDER BY total_sales DESC, qty DESC, rows_count DESC
    `,
    values
  );

  return {
    byItem: res.rows.map((row) => ({
      reason: String(row.reason || "UNMAPPED_PRODUCT"),
      itemName: String(row.item_name || ""),
      sku: String(row.sku || "-"),
      qty: Number(row.qty || 0),
      totalSales: Number(row.total_sales || 0),
      rowsCount: Number(row.rows_count || 0),
    })),
    byReason: byReasonRes.rows.map((row) => ({
      reason: String(row.reason || "UNMAPPED_PRODUCT"),
      rowsCount: Number(row.rows_count || 0),
      qty: Number(row.qty || 0),
      totalSales: Number(row.total_sales || 0),
    })),
  };
}

async function queryRecipeCoverage(params: DashboardParams) {
  const { values, whereDocs } = buildDocsFilter(params);

  const res = await pool.query(
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
        l.qty,
        l.line_total,
        COALESCE(l.resolved_ok, false) AS resolved_ok
      FROM sales_lines l
      INNER JOIN base_docs bd
        ON bd.document_id = l.document_id
    )
    SELECT
      COALESCE(SUM(line_total), 0)::numeric AS total_sales,
      COALESCE(SUM(qty), 0)::numeric AS total_qty,
      COALESCE(SUM(CASE WHEN resolved_ok = true THEN line_total ELSE 0 END), 0)::numeric AS covered_sales,
      COALESCE(SUM(CASE WHEN resolved_ok = true THEN qty ELSE 0 END), 0)::numeric AS covered_qty,
      COALESCE(SUM(CASE WHEN resolved_ok = false THEN line_total ELSE 0 END), 0)::numeric AS uncovered_sales,
      COALESCE(SUM(CASE WHEN resolved_ok = false THEN qty ELSE 0 END), 0)::numeric AS uncovered_qty
    FROM base_lines
    `,
    values
  );

  const row = res.rows[0] || {};

  const totalSales = Number(row.total_sales || 0);
  const totalQty = Number(row.total_qty || 0);
  const coveredSales = Number(row.covered_sales || 0);
  const coveredQty = Number(row.covered_qty || 0);
  const uncoveredSales = Number(row.uncovered_sales || 0);
  const uncoveredQty = Number(row.uncovered_qty || 0);

  const salesCoveragePct =
    totalSales > 0 ? Number(((coveredSales / totalSales) * 100).toFixed(2)) : 0;

  const qtyCoveragePct =
    totalQty > 0 ? Number(((coveredQty / totalQty) * 100).toFixed(2)) : 0;

  return {
    totalSales,
    totalQty,
    coveredSales,
    coveredQty,
    uncoveredSales,
    uncoveredQty,
    salesCoveragePct,
    qtyCoveragePct,
  };
}

async function queryTopArticlesSold(params: DashboardParams) {
  const { values, whereDocs } = buildDocsFilter(params);

  const res = await pool.query(
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
        COALESCE(NULLIF(BTRIM(l.sku), ''), '-') AS sku,
        COALESCE(
          NULLIF(BTRIM(l.description), ''),
          NULLIF(BTRIM(l.sku), ''),
          'SENZA_DESCRIZIONE'
        ) AS article_name,
        COALESCE(l.resolved_ok, false) AS resolved_ok,
        COALESCE(l.qty, 0)::numeric AS qty,
        COALESCE(l.line_total, 0)::numeric AS line_total
      FROM sales_lines l
      INNER JOIN base_docs bd
        ON bd.document_id = l.document_id
    )
    SELECT
      sku,
      article_name,
      resolved_ok,
      COALESCE(SUM(qty), 0)::numeric AS qty_sold,
      COALESCE(SUM(line_total), 0)::numeric AS total_sales
    FROM base_lines
    GROUP BY sku, article_name, resolved_ok
    ORDER BY qty_sold DESC, total_sales DESC
    LIMIT 10
    `,
    values
  );

  return res.rows.map((row) => ({
    sku: String(row.sku || "-"),
    articleName: String(row.article_name || ""),
    qtySold: Number(row.qty_sold || 0),
    totalSales: Number(row.total_sales || 0),
    hasRecipe: Boolean(row.resolved_ok),
  }));
}

export async function getDashboardSummary(params: DashboardParams) {
  const [summary, topProducts] = await Promise.all([
    querySummary(params),
    queryTopProducts(params),
  ]);

  return {
    ...summary,
    topProducts,
  };
}

export async function getDashboardOverview(tenantId: string) {
  const [today, last7Days, trend7d, pending, coverage, topArticles, summaryToday] =
    await Promise.all([
      queryTodaySummary(tenantId),
      queryLast7DaysSummaryReal(tenantId),
      queryDailyTrendLast7Days(tenantId),
      queryPendingBreakdown({ tenantId, from: undefined, to: undefined }),
      queryRecipeCoverage({ tenantId, from: undefined, to: undefined }),
      queryTopArticlesSold({ tenantId, from: undefined, to: undefined }),
      querySummary({ tenantId }),
    ]);

  const mainReason =
    pending.byReason.length > 0 ? pending.byReason[0].reason : null;

  const pendingSales = coverage.uncoveredSales;
  const pendingRows =
    pending.byReason.reduce((acc, row) => acc + row.rowsCount, 0) || 0;

  const involvedItems = pending.byItem.length;

  return {
    cards: {
      venditeTotaliStoriche: 0,
      ticketMedioStorico: 0,
      documentiTotali: 0,
      righeTotali: 0,

      venditeInAttesaDiScarico: pendingSales,
      righePending: pendingRows,
      elementiCoinvolti: involvedItems,
      motivoPrincipale: mainReason,

      venditeUltimi7Giorni: last7Days.totalSales,
      scontriniUltimi7Giorni: last7Days.documentsCount,
      pezziVendutiUltimi7Giorni: last7Days.qtySold,
      ticketMedioUltimi7Giorni: last7Days.avgTicket,

      venditeOggi: today.totalSales,
      scontriniOggi: today.documentsCount,

      senzaRicetta: coverage.uncoveredSales,
      coperturaRicettePct: coverage.salesCoveragePct,
    },

    trend7d,

    pending,

    topProducts: await queryTopProducts({
      tenantId,
      from: undefined,
      to: undefined,
    }),

    topArticles,

    summaryToday,

    coverage,
  };
}

export async function getDashboardHistoricalTotals(tenantId: string) {
  const res = await pool.query(
    `
    SELECT
      COUNT(*)::int AS documents_count,
      COALESCE(SUM(total_amount), 0)::numeric AS total_sales,
      COALESCE(AVG(total_amount), 0)::numeric AS avg_ticket
    FROM sales_documents
    WHERE tenant_id = $1
      AND status = 'VALID'
    `,
    [tenantId]
  );

  const linesRes = await pool.query(
    `
    SELECT
      COUNT(*)::int AS lines_count
    FROM sales_lines l
    INNER JOIN sales_documents d
      ON d.document_id = l.document_id
    WHERE d.tenant_id = $1
      AND d.status = 'VALID'
    `,
    [tenantId]
  );

  const row = res.rows[0] || {};
  const linesRow = linesRes.rows[0] || {};

  return {
    documentsCount: Number(row.documents_count || 0),
    totalSales: Number(row.total_sales || 0),
    avgTicket: Number(row.avg_ticket || 0),
    linesCount: Number(linesRow.lines_count || 0),
  };
}

export async function getDashboardPageData(tenantId: string) {
  const [overview, historical] = await Promise.all([
    getDashboardOverview(tenantId),
    getDashboardHistoricalTotals(tenantId),
  ]);

  return {
    ...overview,
    cards: {
      ...overview.cards,
      venditeTotaliStoriche: historical.totalSales,
      ticketMedioStorico: historical.avgTicket,
      documentiTotali: historical.documentsCount,
      righeTotali: historical.linesCount,
    },
  };
}
