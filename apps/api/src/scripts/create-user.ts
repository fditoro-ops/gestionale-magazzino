import bcrypt from "bcryptjs";
import { pool } from "../db.js";

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  const firstName = process.argv[4] || "Admin";
  const lastName = process.argv[5] || "Core";
  const role = process.argv[6] || "ADMIN";

  if (!email || !password) {
    console.error(
      "Uso: npm run create:user -- email password [firstName] [lastName] [role]"
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const result = await pool.query(
    `
    INSERT INTO users (
      email,
      password_hash,
      first_name,
      last_name,
      role,
      is_active
    )
    VALUES ($1, $2, $3, $4, $5, TRUE)
    RETURNING id, email, first_name, last_name, role, is_active
    `,
    [email.toLowerCase(), passwordHash, firstName, lastName, role]
  );

  console.log("✅ Utente creato:", result.rows[0]);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Errore creazione utente:", err);
  process.exit(1);
});
