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

function normalizeInventoryMultiplier(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return n;
}

function toBtFromCountedInput(
  countedInput: number,
  inventoryMultiplier: number | null | undefined
): number {
  const multiplier = normalizeInventoryMultiplier(inventoryMultiplier);
  return countedInput * multiplier;
}

/**
 * Build giacenze as-of coerente con:
 * - Movements come source of truth
 * - INVENTORY = reset per SKU
 * - IN = carico
 * - OUT = scarico
 * - ADJUST = delta
 */
async function buildGiacenzeAsOf(effectiveAt: string) {
  const movementsQ = await pool.query(
    `
    SELECT
      sku,
      quantity,
      type,
      date,
      id
    FROM movements
    WHERE tenant_id = $1
      AND date <= $2
      AND sku IS NOT NULL
      AND sku <> ''
    ORDER BY sku ASC, date ASC, id ASC
    `,
    [TENANT_ID, effectiveAt]
  );

const itemsQ = await pool.query(
  `
  SELECT
    sku,
    "lastCostCents",
    "inventoryMultiplier",
    active
  FROM "Item"
  WHERE active = true
    AND sku IS NOT NULL
    AND sku <> ''
  ORDER BY sku ASC
  `
);

const metaBySku = new Map<
  string,
  { lastCostCents: number | null; inventoryMultiplier: number }
>();

  const stockBySku = new Map<string, number>();

  for (const row of itemsQ.rows) {
    const sku = String(row.sku ?? "").toUpperCase().trim();
    const lastCost =
      row.lastCostCents !== null && row.lastCostCents !== undefined
        ? Number(row.lastCostCents)
        : null;

const inventoryMultiplierRaw =
  row.inventoryMultiplier !== null && row.inventoryMultiplier !== undefined
    ? Number(row.inventoryMultiplier)
    : 1;

const inventoryMultiplier =
  Number.isFinite(inventoryMultiplierRaw) && inventoryMultiplierRaw > 0
    ? inventoryMultiplierRaw
    : 1;

metaBySku.set(sku, {
  lastCostCents: lastCost,
  inventoryMultiplier,
});

    stockBySku.set(sku, 0);
  }

  for (const row of movementsQ.rows) {
    const sku = String(row.sku ?? "").toUpperCase().trim();

    if (!stockBySku.has(sku)) continue;

    const qty = Number(row.quantity || 0);
    const type = String(row.type || "");
    const current = stockBySku.get(sku) ?? 0;

    if (type === "INVENTORY") {
      stockBySku.set(sku, qty);
      continue;
    }

    if (type === "IN") {
      stockBySku.set(sku, current + qty);
      continue;
    }

    if (type === "OUT") {
      stockBySku.set(sku, current - Math.abs(qty));
      continue;
    }

    if (type === "ADJUST") {
      stockBySku.set(sku, current + qty);
      continue;
    }
  }

return Array.from(stockBySku.entries())
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([sku, theoretical_qty_bt]) => ({
    sku,
    theoretical_qty_bt,
    cost_snapshot: metaBySku.get(sku)?.lastCostCents ?? null,
    inventory_multiplier: metaBySku.get(sku)?.inventoryMultiplier ?? 1,
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
        notes,
        applied_at
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

// DASHBOARD INVENTARIO
router.get("/dashboard", async (_req, res) => {
  try {
    const sessionsQ = await pool.query(
      `
      SELECT COUNT(*)::int AS total_sessions
      FROM inventory_sessions
      WHERE tenant_id = $1
      `,
      [TENANT_ID]
    );

    const appliedQ = await pool.query(
      `
      SELECT
        id,
        code,
        name,
        status,
        effective_at,
        created_at,
        applied_at
      FROM inventory_sessions
      WHERE tenant_id = $1
        AND status = 'APPLIED'
      ORDER BY effective_at DESC, created_at DESC
      LIMIT 1
      `,
      [TENANT_ID]
    );

    const openQ = await pool.query(
      `
      SELECT
        id,
        code,
        name,
        status,
        effective_at,
        created_at
      FROM inventory_sessions
      WHERE tenant_id = $1
        AND status IN ('DRAFT', 'COUNTING', 'CLOSED')
      ORDER BY effective_at DESC, created_at DESC
      LIMIT 1
      `,
      [TENANT_ID]
    );

    const openSummaryQ = await pool.query(
      `
      SELECT
        COUNT(*)::int AS total_lines,
        COUNT(l.counted_qty_bt)::int AS counted_lines,
        (COUNT(*) - COUNT(l.counted_qty_bt))::int AS missing_lines,
        COUNT(*) FILTER (
          WHERE l.counted_qty_bt IS NOT NULL
            AND l.difference_qty_bt IS NOT NULL
            AND l.difference_qty_bt <> 0
        )::int AS different_lines
      FROM inventory_lines l
      INNER JOIN inventory_sessions s
        ON s.id = l.session_id
      WHERE s.tenant_id = $1
        AND s.status IN ('DRAFT', 'COUNTING', 'CLOSED')
      `,
      [TENANT_ID]
    );

    const lastAppliedSummaryQ = await pool.query(
      `
      SELECT
        COUNT(*)::int AS total_lines,
        COUNT(*) FILTER (
          WHERE counted_qty_bt IS NOT NULL
            AND difference_qty_bt IS NOT NULL
            AND difference_qty_bt <> 0
        )::int AS different_lines
      FROM inventory_lines
      WHERE session_id = (
        SELECT id
        FROM inventory_sessions
        WHERE tenant_id = $1
          AND status = 'APPLIED'
        ORDER BY effective_at DESC, created_at DESC
        LIMIT 1
      )
      `,
      [TENANT_ID]
    );

    const lastAppliedValueQ = await pool.query(
      `
      SELECT
        COALESCE(SUM(difference_value), 0)::numeric AS inventory_loss_value_cents
      FROM inventory_lines
      WHERE session_id = (
        SELECT id
        FROM inventory_sessions
        WHERE tenant_id = $1
          AND status = 'APPLIED'
        ORDER BY effective_at DESC, created_at DESC
        LIMIT 1
      )
      `,
      [TENANT_ID]
    );

    const openValueQ = await pool.query(
      `
      SELECT
        COALESCE(SUM(difference_value), 0)::numeric AS inventory_loss_value_cents
      FROM inventory_lines
      WHERE session_id = (
        SELECT id
        FROM inventory_sessions
        WHERE tenant_id = $1
          AND status IN ('DRAFT', 'COUNTING', 'CLOSED')
        ORDER BY effective_at DESC, created_at DESC
        LIMIT 1
      )
      `,
      [TENANT_ID]
    );

    const diffItemsQ = await pool.query(
      `
      SELECT
        l.sku,
        l.theoretical_qty_bt,
        l.counted_qty,
        l.counted_qty_bt,
        l.difference_qty_bt,
        l.difference_value
      FROM inventory_lines l
      WHERE l.session_id = (
        SELECT id
        FROM inventory_sessions
        WHERE tenant_id = $1
          AND status IN ('DRAFT', 'COUNTING', 'CLOSED')
        ORDER BY effective_at DESC, created_at DESC
        LIMIT 1
      )
      AND l.difference_qty_bt IS NOT NULL
      AND l.difference_qty_bt <> 0
      ORDER BY ABS(l.difference_qty_bt) DESC
      LIMIT 10
      `,
      [TENANT_ID]
    );

    const lastAppliedInventoryLossValueCents = Number(
      lastAppliedValueQ.rows[0]?.inventory_loss_value_cents ?? 0
    );

    const lastAppliedInventoryLossValueEur =
      lastAppliedInventoryLossValueCents / 100;

    const openInventoryLossValueCents = Number(
      openValueQ.rows[0]?.inventory_loss_value_cents ?? 0
    );

    const openInventoryLossValueEur =
      openInventoryLossValueCents / 100;

    res.json({
      ok: true,
      dashboard: {
        total_sessions: sessionsQ.rows[0]?.total_sessions ?? 0,
        last_applied_session: appliedQ.rows[0] ?? null,
        last_open_session: openQ.rows[0] ?? null,
        open_sessions_summary: openSummaryQ.rows[0] ?? {
          total_lines: 0,
          counted_lines: 0,
          missing_lines: 0,
          different_lines: 0,
        },
        last_applied_summary: lastAppliedSummaryQ.rows[0] ?? {
          total_lines: 0,
          different_lines: 0,
        },
        top_differences: diffItemsQ.rows ?? [],
        last_applied_inventory_loss_value_cents:
          lastAppliedInventoryLossValueCents,
        last_applied_inventory_loss_value_eur:
          lastAppliedInventoryLossValueEur,
        open_inventory_loss_value_cents: openInventoryLossValueCents,
        open_inventory_loss_value_eur: openInventoryLossValueEur,
      },
    });
  } catch (err: any) {
    console.error("GET /inventory/dashboard error", err);
    res.status(500).json({
      ok: false,
      error: err.message,
    });
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
      [
        id,
        TENANT_ID,
        code,
        name ?? null,
        status,
        effective_at,
        created_by ?? null,
        notes ?? null,
      ]
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
  counted_qty,
  counted_qty_bt,
  difference_qty_bt,
  cost_snapshot,
  difference_value,
  note,
  counted_by,
  counted_at,
  inventory_multiplier
)
VALUES ($1,$2,$3,$4,NULL,NULL,NULL,$5,NULL,NULL,NULL,NULL,$6)
        `,
[
  makeId(),
  id,
  row.sku,
  row.theoretical_qty_bt ?? 0,
  row.cost_snapshot,
  row.inventory_multiplier ?? 1,
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
    const { counted_qty, note, counted_by } = req.body ?? {};

    const countedInput = toNum(counted_qty);
    if (countedInput === null) {
      return res.status(400).json({
        ok: false,
        error: "counted_qty deve essere numerico",
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
    const costSnapshot =
      row.cost_snapshot !== null ? Number(row.cost_snapshot) : null;

const inventoryMultiplier = normalizeInventoryMultiplier(
  row.inventory_multiplier
);
const countedBt = toBtFromCountedInput(
  countedInput,
  inventoryMultiplier
);
    const difference = countedBt - theoretical;
    const differenceValue =
      costSnapshot !== null ? difference * costSnapshot : null;

    const { rows } = await pool.query(
      `
      UPDATE inventory_lines
      SET
        counted_qty = $2,
        counted_qty_bt = $3,
        difference_qty_bt = $4,
        difference_value = $5,
        note = $6,
        counted_by = $7,
        counted_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [
        id,
        countedInput,
        countedBt,
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

    const counted = await pool.query(
      `
      SELECT COUNT(*)::int AS c
      FROM inventory_lines
      WHERE session_id = $1
        AND counted_qty_bt IS NOT NULL
      `,
      [id]
    );

    if (Number(counted.rows[0]?.c || 0) === 0) {
      return res.status(400).json({
        ok: false,
        error: "Devi contare almeno una riga prima di chiudere la sessione",
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

// RIAPRI SESSIONE
router.post("/sessions/:id/reopen", async (req, res) => {
  try {
    const { id } = req.params;

    const s = await pool.query(
      `
      SELECT *
      FROM inventory_sessions
      WHERE id = $1
        AND tenant_id = $2
      LIMIT 1
      `,
      [id, TENANT_ID]
    );

    const session = s.rows[0];

    if (!session) {
      return res.status(404).json({
        ok: false,
        error: "Sessione non trovata",
      });
    }

    if (session.status !== "CLOSED") {
      return res.status(400).json({
        ok: false,
        error: "Solo una sessione CLOSED può essere riaperta",
      });
    }

    const { rows } = await pool.query(
      `
      UPDATE inventory_sessions
      SET status = 'COUNTING'
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    res.json({
      ok: true,
      session: rows[0],
    });
  } catch (err: any) {
    console.error("POST /inventory/sessions/:id/reopen error", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// APPLICA INVENTARIO
router.post("/sessions/:id/apply", async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    await client.query("BEGIN");

    const s = await client.query(
      `
      SELECT *
      FROM inventory_sessions
      WHERE id = $1
        AND tenant_id = $2
      LIMIT 1
      `,
      [id, TENANT_ID]
    );

    const session = s.rows[0];

    if (!session) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        ok: false,
        error: "Sessione non trovata",
      });
    }

    if (session.status !== "CLOSED") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        error: "Solo una sessione CLOSED può essere applicata",
      });
    }

    const l = await client.query(
      `
      SELECT *
      FROM inventory_lines
      WHERE session_id = $1
      ORDER BY sku ASC
      `,
      [id]
    );

    const lines = l.rows;

    if (!lines.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        error: "Nessuna riga inventario presente",
      });
    }

    const countedLines = lines.filter(
      (x) => x.counted_qty_bt !== null && x.counted_qty_bt !== undefined
    );

    if (!countedLines.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        error: "Nessuna riga contata da applicare",
      });
    }

    const futureMovements = await client.query(
      `
      SELECT COUNT(*)::int AS c
      FROM movements
      WHERE tenant_id = $1
        AND date > $2
      `,
      [TENANT_ID, session.effective_at]
    );

    const existingMovements = await client.query(
      `
      SELECT COUNT(*)::int AS c
      FROM movements
      WHERE tenant_id = $1
        AND documento = $2
        AND type = 'INVENTORY'
      `,
      [TENANT_ID, session.code]
    );

    if (Number(existingMovements.rows[0]?.c || 0) > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        error: "Movimenti INVENTORY già presenti per questa sessione",
      });
    }

    const futureCount = Number(futureMovements.rows[0]?.c || 0);

    for (const line of countedLines) {
      await client.query(
        `
        INSERT INTO movements (
          id,
          sku,
          quantity,
          type,
          reason,
          date,
          note,
          documento,
          tenant_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `,
        [
          makeId(),
          line.sku,
          Number(line.counted_qty_bt),
          "INVENTORY",
          "INVENTARIO",
          session.effective_at,
          `Inventario ${session.code}${line.note ? ` - ${line.note}` : ""}`,
          session.code,
          TENANT_ID,
        ]
      );
    }

    const updated = await client.query(
      `
      UPDATE inventory_sessions
      SET
        status = 'APPLIED',
        applied_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      session: updated.rows[0],
      applied_lines: countedLines.length,
      warning:
        futureCount > 0
          ? `Esistono ${futureCount} movimenti successivi a effective_at. Inventario applicato retrodatando i reset.`
          : null,
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("POST /inventory/sessions/:id/apply error", err);
    return res.status(500).json({
      ok: false,
      error: err.message,
    });
  } finally {
    client.release();
  }
});

// ANNULLA SESSIONE NON APPLICATA
router.post("/sessions/:id/cancel", async (req, res) => {
  try {
    const { id } = req.params;

    const s = await pool.query(
      `
      SELECT *
      FROM inventory_sessions
      WHERE id = $1
        AND tenant_id = $2
      LIMIT 1
      `,
      [id, TENANT_ID]
    );

    const session = s.rows[0];

    if (!session) {
      return res.status(404).json({
        ok: false,
        error: "Sessione non trovata",
      });
    }

    if (session.status === "APPLIED") {
      return res.status(400).json({
        ok: false,
        error:
          "Una sessione APPLIED non può essere annullata con cancel. Usa DELETE /sessions/:id",
      });
    }

    if (session.status === "CANCELLED") {
      return res.status(400).json({
        ok: false,
        error: "La sessione è già CANCELLED",
      });
    }

    const { rows } = await pool.query(
      `
      UPDATE inventory_sessions
      SET status = 'CANCELLED'
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    res.json({
      ok: true,
      session: rows[0],
    });
  } catch (err: any) {
    console.error("POST /inventory/sessions/:id/cancel error", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ELIMINA SESSIONE INVENTARIO ANCHE SE APPLIED
router.delete("/sessions/:id", async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    await client.query("BEGIN");

    const s = await client.query(
      `
      SELECT *
      FROM inventory_sessions
      WHERE id = $1
        AND tenant_id = $2
      LIMIT 1
      `,
      [id, TENANT_ID]
    );

    const session = s.rows[0];

    if (!session) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        ok: false,
        error: "Sessione non trovata",
      });
    }

    await client.query(
      `
      DELETE FROM movements
      WHERE tenant_id = $1
        AND documento = $2
        AND type = 'INVENTORY'
      `,
      [TENANT_ID, session.code]
    );

    await client.query(
      `
      UPDATE inventory_sessions
      SET
        status = 'CANCELLED',
        applied_at = NULL
      WHERE id = $1
      `,
      [id]
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      deleted_session_id: id,
      deleted_inventory_code: session.code,
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("DELETE /inventory/sessions/:id error", err);
    return res.status(500).json({
      ok: false,
      error: err.message,
    });
  } finally {
    client.release();
  }
});

// SUMMARY SESSIONE
router.get("/sessions/:id/summary", async (req, res) => {
  try {
    const { id } = req.params;

    const s = await pool.query(
      `
      SELECT *
      FROM inventory_sessions
      WHERE id = $1
        AND tenant_id = $2
      LIMIT 1
      `,
      [id, TENANT_ID]
    );

    const session = s.rows[0];

    if (!session) {
      return res.status(404).json({
        ok: false,
        error: "Sessione non trovata",
      });
    }

    const { rows } = await pool.query(
      `
      SELECT
        COUNT(*)::int AS total_lines,
        COUNT(counted_qty_bt)::int AS counted_lines,
        (COUNT(*) - COUNT(counted_qty_bt))::int AS missing_lines,
        COUNT(*) FILTER (
          WHERE counted_qty_bt IS NOT NULL
            AND difference_qty_bt IS NOT NULL
            AND difference_qty_bt <> 0
        )::int AS different_lines
      FROM inventory_lines
      WHERE session_id = $1
      `,
      [id]
    );

    res.json({
      ok: true,
      session_id: id,
      summary: rows[0],
    });
  } catch (err: any) {
    console.error("GET /inventory/sessions/:id/summary error", err);
    res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
});

export default router;
