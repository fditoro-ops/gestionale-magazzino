import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

function nextSupplierId(ids: string[]): string {
  const max = ids.reduce((acc, id) => {
    const n = parseInt(String(id || "").replace("SUP", ""), 10);
    return Number.isFinite(n) ? Math.max(acc, n) : acc;
  }, 0);

  return `SUP${String(max + 1).padStart(3, "0")}`;
}

/* ---------------- GET /suppliers ---------------- */

router.get("/", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        code,
        name,
        contact_name,
        phone,
        vat_number,
        created_at
      FROM suppliers
      ORDER BY name ASC
    `);

    return res.json(result.rows);
  } catch (err: any) {
    console.error("GET /suppliers error:", err);
    return res.status(500).json({
      error: "Errore caricamento fornitori",
    });
  }
});

/* ---------------- POST /suppliers ---------------- */

router.post("/", async (req, res) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    const contactName = String(req.body?.contactName ?? "").trim();
    const phone = String(req.body?.phone ?? "").trim();
    const vatNumber = String(req.body?.vatNumber ?? "").trim();
    const codeRaw = String(req.body?.code ?? "").trim().toUpperCase();

    if (!name) {
      return res.status(400).json({ error: "Nome fornitore obbligatorio" });
    }

    if (!codeRaw) {
      return res.status(400).json({ error: "Codice fornitore obbligatorio" });
    }

    const existingCode = await pool.query(
      `SELECT id FROM suppliers WHERE code = $1 LIMIT 1`,
      [codeRaw]
    );

    if (existingCode.rowCount) {
      return res.status(400).json({ error: `Codice fornitore ${codeRaw} già esistente` });
    }

    const allIds = await pool.query(`SELECT id FROM suppliers`);
    const newId = nextSupplierId(allIds.rows.map((r: any) => String(r.id)));

    const insert = await pool.query(
      `
      INSERT INTO suppliers (
        id,
        code,
        name,
        contact_name,
        phone,
        vat_number
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        id,
        code,
        name,
        contact_name,
        phone,
        vat_number,
        created_at
      `,
      [
        newId,
        codeRaw,
        name,
        contactName || null,
        phone || null,
        vatNumber || null,
      ]
    );

    return res.status(201).json(insert.rows[0]);
  } catch (err: any) {
    console.error("POST /suppliers error:", err);
    return res.status(500).json({
      error: "Errore creazione fornitore",
    });
  }
});

/* ---------------- PATCH /suppliers/:id ---------------- */

router.patch("/:id", async (req, res) => {
  try {
    const id = String(req.params.id ?? "").trim();

    if (!id) {
      return res.status(400).json({ error: "ID fornitore mancante" });
    }

    const current = await pool.query(
      `SELECT * FROM suppliers WHERE id = $1 LIMIT 1`,
      [id]
    );

    if (!current.rowCount) {
      return res.status(404).json({ error: `Fornitore ${id} non trovato` });
    }

    const row = current.rows[0];

    const name = req.body?.name != null ? String(req.body.name).trim() : row.name;
    const contactName =
      req.body?.contactName != null
        ? String(req.body.contactName).trim()
        : row.contact_name ?? "";
    const phone =
      req.body?.phone != null ? String(req.body.phone).trim() : row.phone ?? "";
    const vatNumber =
      req.body?.vatNumber != null
        ? String(req.body.vatNumber).trim()
        : row.vat_number ?? "";

    if (!name) {
      return res.status(400).json({ error: "Nome fornitore obbligatorio" });
    }

    const updated = await pool.query(
      `
      UPDATE suppliers
      SET
        name = $1,
        contact_name = $2,
        phone = $3,
        vat_number = $4
      WHERE id = $5
      RETURNING
        id,
        code,
        name,
        contact_name,
        phone,
        vat_number,
        created_at
      `,
      [
        name,
        contactName || null,
        phone || null,
        vatNumber || null,
        id,
      ]
    );

    return res.json(updated.rows[0]);
  } catch (err: any) {
    console.error("PATCH /suppliers/:id error:", err);
    return res.status(500).json({
      error: "Errore aggiornamento fornitore",
    });
  }
});

export default router;
