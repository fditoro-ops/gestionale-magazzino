import { Router } from "express";

import {
  listRecipes,
  getRecipeById,
  createRecipe,
  updateRecipe,
  updateRecipeStatus,
} from "../data/recipes.store.js";

const router = Router();

// =========================
// GET ALL
// =========================
router.get("/", async (req, res) => {
  try {
    const tenantId = String(req.headers["x-tenant-id"] || "IMP001");

    const recipes = await listRecipes(tenantId);

    res.json({ ok: true, data: recipes });
  } catch (err) {
    console.error("GET /recipes error", err);
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

// =========================
// GET BY ID
// =========================
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const recipe = await getRecipeById(id);

    if (!recipe) {
      return res.status(404).json({ ok: false, error: "Not found" });
    }

    res.json({ ok: true, data: recipe });
  } catch (err) {
    console.error("GET /recipes/:id error", err);
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

// =========================
// CREATE
// =========================
router.post("/", async (req, res) => {
  try {
    const tenantId = String(req.headers["x-tenant-id"] || "IMP001");

    const { product_sku, name } = req.body;

    if (!product_sku || !name) {
      return res.status(400).json({
        ok: false,
        error: "product_sku and name are required",
      });
    }

    const recipe = await createRecipe({
      tenant_id: tenantId,
      product_sku,
      name,
    });

    res.json({ ok: true, data: recipe });
  } catch (err: any) {
    console.error("POST /recipes error", err);

    // gestione unique SKU
    if (err.code === "23505") {
      return res.status(400).json({
        ok: false,
        error: "Recipe already exists for this product_sku",
      });
    }

    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

// =========================
// UPDATE
// =========================
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { name, product_sku } = req.body;

    const recipe = await updateRecipe(id, {
      name,
      product_sku,
    });

    if (!recipe) {
      return res.status(404).json({ ok: false, error: "Not found" });
    }

    res.json({ ok: true, data: recipe });
  } catch (err) {
    console.error("PUT /recipes/:id error", err);
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

// =========================
// UPDATE STATUS
// =========================
router.patch("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["DRAFT", "ACTIVE", "INACTIVE"].includes(status)) {
      return res.status(400).json({
        ok: false,
        error: "Invalid status",
      });
    }

    const recipe = await updateRecipeStatus(id, status);

    if (!recipe) {
      return res.status(404).json({ ok: false, error: "Not found" });
    }

    res.json({ ok: true, data: recipe });
  } catch (err) {
    console.error("PATCH /recipes/:id/status error", err);
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

export default router;
