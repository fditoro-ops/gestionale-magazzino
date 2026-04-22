import { Router, Request, Response } from "express";
import multer from "multer";
import { pool } from "../db.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

function extractTag(xml: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "i");
  const match = xml.match(regex);
  return match?.[1]?.trim() || null;
}

function parseNumber(value: string | null): number {
  if (!value) return 0;
  const normalized = value.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

router.get("/", (_req: Request, res: Response) => {
  res.json({ ok: true, message: "Passive invoices module alive 🚀" });
});

router.post(
  "/import",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const tenantId = String(req.headers["x-tenant-id"] || "IMP001");

      if (!req.file) {
        return res.status(400).json({ ok: false, error: "File mancante" });
      }

      const xmlString = req.file.buffer.toString("utf-8");

      const supplierName =
        extractTag(xmlString, "Denominazione") ||
        extractTag(xmlString, "Nome") ||
        "FORNITORE";

      const supplierVat =
        extractTag(xmlString, "IdCodice") ||
        extractTag(xmlString, "CodiceFiscale");

      const invoiceNumber = extractTag(xmlString, "Numero") || "N/A";
      const invoiceDate =
        extractTag(xmlString, "Data") ||
        new Date().toISOString().slice(0, 10);

      const totalAmount = parseNumber(
        extractTag(xmlString, "ImportoTotaleDocumento")
      );

      const inv = await pool.query(
        `
        INSERT INTO passive_invoices (
          tenant_id,
          source,
          source_file_name,
          supplier_name,
          supplier_vat,
          invoice_number,
          invoice_date,
          total_amount,
          xml_raw,
          status
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id
        `,
        [
          tenantId,
          "ARUBA",
          req.file.originalname,
          supplierName,
          supplierVat,
          invoiceNumber,
          invoiceDate,
          totalAmount,
          xmlString,
          "PARSED",
        ]
      );

      const invoiceId = inv.rows[0].id;

      await pool.query(
        `
        INSERT INTO passive_invoice_events (
          tenant_id,
          invoice_id,
          type,
          message
        )
        VALUES ($1,$2,$3,$4)
        `,
        [tenantId, invoiceId, "IMPORTED", "Import XML manuale"]
      );

      res.json({
        ok: true,
        invoiceId,
        supplierName,
        invoiceNumber,
        totalAmount,
      });
    } catch (err) {
      console.error("PASSIVE INVOICE IMPORT ERROR", err);
      res.status(500).json({
        ok: false,
        error: "Errore import fattura passiva",
      });
    }
  }
);

export default router;
