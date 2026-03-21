import crypto from "crypto";
import { pool } from "../db.js";

export type SalesDocumentStatus = "VALID" | "VOID";

export type SaveSalesDocumentInput = {
  documentId: string;
  receiptNumber?: string;
  source?: string;
  status: SalesDocumentStatus;
  documentDate: Date;
  totalAmount: number;
  paymentsTotal: number;
  tenantId: string;
  rawPayload?: unknown;
};

export type SaveSalesLineInput = {
  lineNo: number;
  sku?: string;
  description?: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  productId?: string;
  variantId?: string;
  mode?: string;
  hasRecipe: boolean;
  resolvedOk: boolean;
  tenantId: string;
};

function getBusinessDayKey(input: string | Date) {
  const d = new Date(input);

  if (Number.isNaN(d.getTime())) {
    return "";
  }

  // giornata lavorativa:
  // 06:00 -> 02:59 del giorno successivo
  // quindi 00:00-05:59 appartengono al giorno prima
  if (d.getHours() < 6) {
    d.setDate(d.getDate() - 1);
  }

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export async function saveSalesDocumentWithLines(
  doc: SaveSalesDocumentInput,
  lines: SaveSalesLineInput[]
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
      INSERT INTO sales_documents (
        document_id,
        receipt_number,
        source,
        status,
        document_date,
        total_amount,
        payments_total,
        tenant_id,
        raw_payload,
        created_at,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
      ON CONFLICT (document_id)
      DO UPDATE SET
        receipt_number = EXCLUDED.receipt_number,
        source = EXCLUDED.source,
        status = EXCLUDED.status,
        document_date = EXCLUDED.document_date,
        total_amount = EXCLUDED.total_amount,
        payments_total = EXCLUDED.payments_total,
        tenant_id = EXCLUDED.tenant_id,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
      `,
      [
        doc.documentId,
        doc.receiptNumber || "",
        doc.source || "CIC",
        doc.status,
        doc.documentDate,
        Number(doc.totalAmount || 0),
        Number(doc.paymentsTotal || 0),
        doc.tenantId,
        doc.rawPayload ?? null,
      ]
    );

    await client.query(`DELETE FROM sales_lines WHERE document_id = $1`, [
      doc.documentId,
    ]);

    for (const line of lines) {
      const lineId = crypto
        .createHash("sha1")
        .update(
          [
            doc.documentId,
            String(line.lineNo),
            line.productId || "",
            line.variantId || "",
            line.sku || "",
          ].join(":")
        )
        .digest("hex");

      await client.query(
        `
        INSERT INTO sales_lines (
          id,
          document_id,
          line_no,
          sku,
          description,
          qty,
          unit_price,
          line_total,
          product_id,
          variant_id,
          mode,
          has_recipe,
          resolved_ok,
          tenant_id,
          created_at,
          updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW())
        `,
        [
          lineId,
          doc.documentId,
          Number(line.lineNo || 0),
          line.sku || "",
          line.description || "",
          Number(line.qty || 0),
          Number(line.unitPrice || 0),
          Number(line.lineTotal || 0),
          line.productId || "",
          line.variantId || "",
          line.mode || "",
          Boolean(line.hasRecipe),
          Boolean(line.resolvedOk),
          line.tenantId,
        ]
      );
    }

    await client.query("COMMIT");

    return {
      ok: true,
      documentId: doc.documentId,
      linesSaved: lines.length,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getSalesFeed(params?: {
  from?: string;
  to?: string;
  tenantId?: string;
}) {
  const where: string[] = [];
  const values: Array<string> = [];

  if (params?.tenantId) {
    values.push(params.tenantId);
    where.push(`tenant_id = $${values.length}`);
  }

  if (params?.from) {
    values.push(params.from);
    where.push(`document_date >= $${values.length}`);
  }

  if (params?.to) {
    values.push(params.to);
    where.push(`document_date <= $${values.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const docsRes = await pool.query(
    `
    SELECT
      document_id AS "documentId",
      receipt_number AS "receiptNumber",
      source,
      status,
      document_date AS "date",
      total_amount AS "totalAmount",
      payments_total AS "paymentsTotal",
      tenant_id AS "tenantId"
    FROM sales_documents
    ${whereSql}
    ORDER BY document_date DESC, document_id DESC
    `,
    values
  );

  const linesRes = await pool.query(
    `
    SELECT
      id,
      document_id AS "documentId",
      line_no AS "lineNo",
      sku,
      description,
      qty,
      unit_price AS "unitPrice",
      line_total AS "lineTotal",
      product_id AS "productId",
      variant_id AS "variantId",
      mode,
      has_recipe AS "hasRecipe",
      resolved_ok AS "resolvedOk",
      tenant_id AS "tenantId"
    FROM sales_lines
    ${
      where.length
        ? `WHERE document_id IN (
            SELECT document_id
            FROM sales_documents
            ${whereSql}
          )`
        : ""
    }
    ORDER BY document_id DESC, line_no ASC
    `,
    values
  );

  const documents = docsRes.rows.map((row) => ({
    ...row,
    businessDate: getBusinessDayKey(row.date),
  }));

  const businessDateByDocumentId = new Map<string, string>(
    documents.map((doc) => [String(doc.documentId), String(doc.businessDate || "")])
  );

  const lines = linesRes.rows.map((row) => ({
    ...row,
    businessDate: businessDateByDocumentId.get(String(row.documentId)) || "",
  }));

  return {
    documents,
    lines,
  };
}
