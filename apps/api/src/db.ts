import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL mancante");
}

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
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
