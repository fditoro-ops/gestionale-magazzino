import multer from "multer";
import { XMLParser } from "fast-xml-parser";
import { pool } from "../db.js";

const upload = multer({ storage: multer.memoryStorage() });

router.post("/import", upload.single("file"), async (req, res) => {
  try {
    const tenantId = String(req.headers["x-tenant-id"] || "IMP001");

    if (!req.file) {
      return res.status(400).json({ ok: false, error: "File mancante" });
    }

    const xmlString = req.file.buffer.toString("utf-8");

    const parser = new XMLParser({
      ignoreAttributes: false,
    });

    const json = parser.parse(xmlString);

    const body = json?.FatturaElettronica?.FatturaElettronicaBody;
    const header = json?.FatturaElettronica?.FatturaElettronicaHeader;

    const dati = body?.DatiGenerali?.DatiGeneraliDocumento;

    const supplierName =
      header?.CedentePrestatore?.DatiAnagrafici?.Anagrafica?.Denominazione ||
      "FORNITORE";

    const invoiceNumber = dati?.Numero || "N/A";
    const invoiceDate = dati?.Data || new Date().toISOString();
    const totalAmount = Number(dati?.ImportoTotaleDocumento || 0);

    const inv = await pool.query(
      `
      INSERT INTO passive_invoices (
        tenant_id,
        supplier_name,
        invoice_number,
        invoice_date,
        total_amount,
        xml_raw,
        status
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id
      `,
      [
        tenantId,
        supplierName,
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
      [tenantId, invoiceId, "IMPORTED", "Import XML"]
    );

    res.json({
      ok: true,
      invoiceId,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Errore import" });
  }
});
