import express from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

/**
 * GET /users
 * Solo ADMIN
 */
router.get("/", requireAuth, requireRole(["ADMIN"]), async (_req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        id,
        email,
        first_name,
        last_name,
        role,
        is_active,
        created_at
      FROM users
      ORDER BY created_at DESC
      `
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("GET /users error:", error);
    return res.status(500).json({ ok: false, error: "Errore caricamento utenti" });
  }
});

/**
 * POST /users
 * Solo ADMIN
 */
router.post("/", requireAuth, requireRole(["ADMIN"]), async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const firstName = String(req.body?.firstName || "").trim();
    const lastName = String(req.body?.lastName || "").trim();
    const role = String(req.body?.role || "").trim().toUpperCase();

    if (!email || !password || !firstName || !role) {
      return res.status(400).json({
        ok: false,
        error: "Email, password, nome e ruolo sono obbligatori",
      });
    }

    const allowedRoles = ["ADMIN", "MAGAZZINO", "OPERATORE", "CONTABILITA"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        ok: false,
        error: "Ruolo non valido",
      });
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
      RETURNING
        id,
        email,
        first_name,
        last_name,
        role,
        is_active,
        created_at
      `,
      [email, passwordHash, firstName, lastName || null, role]
    );

    return res.status(201).json({
      ok: true,
      user: result.rows[0],
    });
  } catch (error: any) {
    console.error("POST /users error:", error);

    if (error?.code === "23505") {
      return res.status(409).json({
        ok: false,
        error: "Esiste già un utente con questa email",
      });
    }

    return res.status(500).json({ ok: false, error: "Errore creazione utente" });
  }
});

/**
 * PATCH /users/:id/toggle-active
 * Solo ADMIN
 */
router.patch(
  "/:id/toggle-active",
  requireAuth,
  requireRole(["ADMIN"]),
  async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();

      const existing = await pool.query(
        `
        SELECT id, is_active
        FROM users
        WHERE id = $1
        LIMIT 1
        `,
        [id]
      );

      const user = existing.rows[0];

      if (!user) {
        return res.status(404).json({ ok: false, error: "Utente non trovato" });
      }

      const result = await pool.query(
        `
        UPDATE users
        SET is_active = NOT is_active
        WHERE id = $1
        RETURNING
          id,
          email,
          first_name,
          last_name,
          role,
          is_active,
          created_at
        `,
        [id]
      );

      return res.json({
        ok: true,
        user: result.rows[0],
      });
    } catch (error) {
      console.error("PATCH /users/:id/toggle-active error:", error);
      return res.status(500).json({ ok: false, error: "Errore aggiornamento utente" });
    }
  }
);

export default router;
