import express from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { requireAuth, signAuthToken, type AuthRequest } from "../middleware/auth.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({
        ok: false,
        error: "Email e password obbligatorie",
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        email,
        password_hash,
        first_name,
        last_name,
        role,
        is_active
      FROM users
      WHERE lower(email) = lower($1)
      LIMIT 1
      `,
      [email]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({
        ok: false,
        error: "Credenziali non valide",
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        ok: false,
        error: "Utente disattivato",
      });
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash);

    if (!passwordOk) {
      return res.status(401).json({
        ok: false,
        error: "Credenziali non valide",
      });
    }

    const token = signAuthToken({
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.first_name,
      lastName: user.last_name,
    });

    await pool.query(
      `
      INSERT INTO audit_log (user_id, action, entity, entity_id)
      VALUES ($1, 'LOGIN', 'USER', $1)
      `,
      [user.id]
    );

    return res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("POST /auth/login error:", error);
    return res.status(500).json({ ok: false, error: "Errore login" });
  }
});

router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  return res.json({
    ok: true,
    user: req.user,
  });
});

export default router;
