import { Router } from "express";

const router = Router();

router.get("/", (req, res) => {
  res.json({ ok: true, message: "Passive invoices module alive 🚀" });
});

export default router;
