import express from "express";
import crypto from "crypto";
import { pool } from "../db.js";

const router = express.Router();

const TENANT_ID = "IMP001";

type InventoryStatus =
  | "DRAFT"
  | "COUNTING"
  | "CLOSED"
  | "APPLIED"
  | "CANCELLED";

function makeId() {
  return crypto.randomUUID();
}

function makeInventoryCode(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 900 + 100);
  return `INV-${yyyy}${mm}${dd}-${rand}`;
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * TODO:
 * sostituire questa funzione con la vera buildGiacenzeBT({ asOf })
 * o con una query coerente con la tua logica Movimentazione = source of truth
 */
async function buildGiacenzeAsOf(_effectiveAt: string) {
  const { rows } = await pool.query(
    `
    SELECT
      i.sku,
      COALESCE(SUM(
        CASE
          WHEN m.type = 'IN' THEN m.quantity::numeric
          WHEN m.type = 'OUT' THEN -m.quantity::numeric
          WHEN m.type = 'ADJUST' THEN m.quantity::numeric
          ELSE 0
        END
      ), 0) AS theoretical_qty_bt
    FROM items i
    LEFT JOIN movements m
      ON m.sku = i.sku
    WHERE 1=1
    GROUP BY i.sku
    ORDER BY i.sku ASC
    `
  );

  return rows.map((r) => ({
    sku: r.sku,
    theoretical_qty_bt: Number(r.theoretical_qty_bt || 0),
    cost_snapshot: null as number | null,
  }));
}

// LISTA SESSIONI
router.get("/sessions", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        id,
        tenant_id,
        code,
        name,
        status,
        effective_at,
        created_at,
        created_by,
        notes
      FROM inventory_sessions
      WHERE tenant_id = $1
      ORDER BY effective_at DESC, created_at DESC
      `,
      [TENANT_ID]
    );

    res.json({ ok: true, sessions: rows });
  } catch (err: any) {
    console.error("GET /inventory/sessions error", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// CREA SESSIONE
router.post("/sessions", async (req, res) => {
  try {
    const { name, effective_at, notes, created_by } = req.body ?? {};

    if (!effective_at) {
      return res.status(400).json({
        ok: false,
        error: "effective_at obbligatorio",
      });
    }

    const id = makeId();
    const code = makeInventoryCode(new Date(effective_at));
    const status: InventoryStatus = "DRAFT";

    const { rows } = await pool.query(
      `
      INSERT INTO inventory_sessions (
        id, tenant_id, code, name, status, effective_at, created_by, notes
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
      `,
      [id, TENANT_ID, code, name ?? null, status, effective_at, created_by ?? null, notes ?? null]
    );

    res.json({ ok: true, session: rows[0] });
  } catch (err: any) {
    console.error("POST /inventory/sessions error", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DETTAGLIO SESSIONE + RIGHE
router.get("/sessions/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const s = await pool.query(
      `
      SELECT *
      FROM inventory_sessions
      WHERE id = $1 AND tenant_id = $2
      LIMIT 1
      `,
      [id, TENANT_ID]
    );

    if (!s.rows[0]) {
      return res.status(404).json({ ok: false, error: "Sessione non trovata" });
    }

    const l = await pool.query(
      `
      SELECT *
      FROM inventory_lines
      WHERE session_id = $1
      ORDER BY sku ASC
      `,
      [id]
    );

    res.json({
      ok: true,
      session: s.rows[0],
      lines: l.rows,
    });
  } catch (err: any) {
    console.error("GET /inventory/sessions/:id error", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GENERA RIGHE
router.post("/sessions/:id/generate-lines", async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query("BEGIN");

    const s = await client.query(
      `
      SELECT *
      FROM inventory_sessions
      WHERE id = $1 AND tenant_id = $2
      LIMIT 1
      `,
      [id, TENANT_ID]
    );

    const session = s.rows[0];
    if (!session) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, error: "Sessione non trovata" });
    }

    if (session.status !== "DRAFT") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        error: "Le righe si possono generare solo da sessione DRAFT",
      });
    }

    const existing = await client.query(
      `SELECT COUNT(*)::int AS c FROM inventory_lines WHERE session_id = $1`,
      [id]
    );

    if (existing.rows[0]?.c > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        error: "Righe già presenti per questa sessione",
      });
    }

    const stockRows = await buildGiacenzeAsOf(session.effective_at);

    for (const row of stockRows) {
      await client.query(
        `
        INSERT INTO inventory_lines (
          id,
          session_id,
          sku,
          theoretical_qty_bt,
          counted_qty_bt,
          difference_qty_bt,
          cost_snapshot,
          difference_value,
          note,
          counted_by,
          counted_at
        )
        VALUES ($1,$2,$3,$4,NULL,NULL,$5,NULL,NULL,NULL,NULL)
        `,
        [
          makeId(),
          id,
          row.sku,
          row.theoretical_qty_bt ?? 0,
          row.cost_snapshot,
        ]
      );
    }

    await client.query(
      `
      UPDATE inventory_sessions
      SET status = 'COUNTING'
      WHERE id = $1
      `,
      [id]
    );

    await client.query("COMMIT");

    res.json({
      ok: true,
      inserted: stockRows.length,
      status: "COUNTING",
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("POST /inventory/sessions/:id/generate-lines error", err);
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    client.release();
  }
});

// AGGIORNA RIGA
router.patch("/lines/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { counted_qty_bt, note, counted_by } = req.body ?? {};

    const counted = toNum(counted_qty_bt);
    if (counted === null) {
      return res.status(400).json({
        ok: false,
        error: "counted_qty_bt deve essere numerico",
      });
    }

    const q = await pool.query(
      `
      SELECT
        l.*,
        s.status
      FROM inventory_lines l
      INNER JOIN inventory_sessions s
        ON s.id = l.session_id
      WHERE l.id = $1
      LIMIT 1
      `,
      [id]
    );

    const row = q.rows[0];
    if (!row) {
      return res.status(404).json({ ok: false, error: "Riga non trovata" });
    }

    if (!["COUNTING", "CLOSED"].includes(row.status)) {
      return res.status(400).json({
        ok: false,
        error: "Riga modificabile solo in COUNTING o CLOSED",
      });
    }

    const theoretical = Number(row.theoretical_qty_bt || 0);
    const costSnapshot = row.cost_snapshot !== null ? Number(row.cost_snapshot) : null;
    const difference = counted - theoretical;
    const differenceValue =
      costSnapshot !== null ? difference * costSnapshot : null;

    const { rows } = await pool.query(
      `
      UPDATE inventory_lines
      SET
        counted_qty_bt = $2,
        difference_qty_bt = $3,
        difference_value = $4,
        note = $5,
        counted_by = $6,
        counted_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [
        id,
        counted,
        difference,
        differenceValue,
        note ?? null,
        counted_by ?? null,
      ]
    );

    res.json({ ok: true, line: rows[0] });
  } catch (err: any) {
    console.error("PATCH /inventory/lines/:id error", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// CHIUDI SESSIONE
router.post("/sessions/:id/close", async (req, res) => {
  try {
    const { id } = req.params;

    const s = await pool.query(
      `
      SELECT *
      FROM inventory_sessions
      WHERE id = $1 AND tenant_id = $2
      LIMIT 1
      `,
      [id, TENANT_ID]
    );

    const session = s.rows[0];
    if (!session) {
      return res.status(404).json({ ok: false, error: "Sessione non trovata" });
    }

    if (session.status !== "COUNTING") {
      return res.status(400).json({
        ok: false,
        error: "Solo una sessione COUNTING può essere chiusa",
      });
    }

    const missing = await pool.query(
      `
      SELECT COUNT(*)::int AS c
      FROM inventory_lines
      WHERE session_id = $1
        AND counted_qty_bt IS NULL
      `,
      [id]
    );

    if (missing.rows[0]?.c > 0) {
      return res.status(400).json({
        ok: false,
        error: `Ci sono ancora ${missing.rows[0].c} righe non contate`,
      });
    }

    const { rows } = await pool.query(
      `
      UPDATE inventory_sessions
      SET status = 'CLOSED'
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    res.json({ ok: true, session: rows[0] });
  } catch (err: any) {
    console.error("POST /inventory/sessions/:id/close error", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
