import { Router } from "express";
import { reprocessSinglePending } from "../services/pendingReprocess.service.js";

const router = Router();

/**
 * POST /pending/:id/reprocess
 * Riprocessa una singola pending row
 */
router.post("/pending/:id/reprocess", async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_ID",
      });
    }

    const result = await reprocessSinglePending({
      pendingId: id,
    });

    return res.json(result);
  } catch (err: any) {
    console.error("❌ POST /pending/:id/reprocess error:", err);

    return res.status(500).json({
      ok: false,
      error: "REPROCESS_FAILED",
      message: err.message,
    });
  }
});

export default router;
