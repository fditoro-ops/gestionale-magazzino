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
}
