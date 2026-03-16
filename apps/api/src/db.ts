import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL mancante");
}

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function testDbConnection() {
  const client = await pool.connect();
  try {
    const res = await client.query("SELECT NOW() as now");
    console.log("✅ PostgreSQL connesso:", res.rows[0]?.now);
  } finally {
    client.release();
  }
}

export async function initDb() {

  /* =========================
     MOVEMENTS
  ========================= */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS movements (
      id TEXT PRIMARY KEY,
      sku TEXT NOT NULL,
      quantity NUMERIC NOT NULL,
      type TEXT NOT NULL,
      reason TEXT,
      date TIMESTAMPTZ NOT NULL,
      note TEXT,
      documento TEXT,
      tenant_id TEXT
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_movements_sku
    ON movements (sku)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_movements_date
    ON movements (date)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_movements_documento
    ON movements (documento)
  `);

  console.log("✅ Tabella movements pronta");

await pool.query(`
  CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE,
    name TEXT NOT NULL,
    contact_name TEXT,
    phone TEXT,
    vat_number TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  )
`);
  
 console.log("✅ Tabella suppliers pronta"); 
/* =========================
     ORDERS
  ========================= */
await pool.query(`
  CREATE TABLE IF NOT EXISTS orders (
    order_id TEXT PRIMARY KEY,
    supplier TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ,
    notes TEXT
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS order_lines (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    qty_ordered_conf NUMERIC NOT NULL,
    qty_received_conf NUMERIC NOT NULL DEFAULT 0
  )
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_orders_created_at
  ON orders (created_at)
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_orders_status
  ON orders (status)
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_order_lines_order_id
  ON order_lines (order_id)
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_order_lines_sku
  ON order_lines (sku)
`);

console.log("✅ Tabelle orders e order_lines pronte");

  /* =========================
     INVENTARIO
  ========================= */

  await pool.query(`
  CREATE TABLE IF NOT EXISTS inventory_sessions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT,
    status TEXT NOT NULL, -- DRAFT | COUNTING | CLOSED | APPLIED | CANCELLED
    effective_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by TEXT,
    notes TEXT
  );
`);

await pool.query(`
  CREATE UNIQUE INDEX IF NOT EXISTS ux_inventory_sessions_tenant_code
  ON inventory_sessions (tenant_id, code);
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS ix_inventory_sessions_tenant_status
  ON inventory_sessions (tenant_id, status);
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS ix_inventory_sessions_effective_at
  ON inventory_sessions (effective_at);
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS inventory_lines (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    sku TEXT NOT NULL,

    theoretical_qty_bt NUMERIC NOT NULL DEFAULT 0,
    counted_qty_bt NUMERIC,
    difference_qty_bt NUMERIC,

    cost_snapshot NUMERIC,
    difference_value NUMERIC,

    note TEXT,
    counted_by TEXT,
    counted_at TIMESTAMP,

    CONSTRAINT fk_inventory_lines_session
      FOREIGN KEY (session_id) REFERENCES inventory_sessions(id)
      ON DELETE CASCADE
  );
`);

await pool.query(`
  CREATE UNIQUE INDEX IF NOT EXISTS ux_inventory_lines_session_sku
  ON inventory_lines (session_id, sku);
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS ix_inventory_lines_session_id
  ON inventory_lines (session_id);
`);

await pool.query(`
  CREATE INDEX IF NOT EXISTS ix_inventory_lines_sku
  ON inventory_lines (sku);
`);
  
  
  /* =========================
     CIC PENDING ROWS
  ========================= */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cic_pending_rows (
      id TEXT PRIMARY KEY,

      doc_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      order_date TIMESTAMPTZ NOT NULL,
      tenant_id TEXT NOT NULL,

      product_id TEXT,
      variant_id TEXT,
      raw_resolved_sku TEXT,

      qty NUMERIC NOT NULL,
      total NUMERIC NOT NULL,
      price NUMERIC,
      description TEXT,

      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMPTZ
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_cic_pending_status
    ON cic_pending_rows (status)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_cic_pending_doc
    ON cic_pending_rows (doc_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_cic_pending_created
    ON cic_pending_rows (created_at)
  `);

  console.log("✅ Tabella cic_pending_rows pronta");

  /* =========================
     CIC UNRESOLVED
  ========================= */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cic_unresolved (
      id TEXT PRIMARY KEY,

      product_id TEXT,
      variant_id TEXT,
      raw_sku TEXT,

      doc_id TEXT,
      operation TEXT,

      total NUMERIC,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_cic_unresolved_doc
    ON cic_unresolved (doc_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_cic_unresolved_created
    ON cic_unresolved (created_at)
  `);

  console.log("✅ Tabella cic_unresolved pronta");

}
