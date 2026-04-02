import { Router } from "express";

import {
  listRecipes,
  getRecipeById,
  createRecipe,
  updateRecipe,
  updateRecipeStatus,
} from "../data/recipes.store.js";

import {
  listRecipeIngredients,
  addRecipeIngredient,
  updateRecipeIngredient,
  deleteRecipeIngredient,
} from "../data/recipeIngredients.store.js";


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
// GET INGREDIENTS
// =========================
router.get("/:id/ingredients", async (req, res) => {
  try {
    const { id } = req.params;

    const recipe = await getRecipeById(id);
    if (!recipe) {
      return res.status(404).json({ ok: false, error: "Recipe not found" });
    }

    const ingredients = await listRecipeIngredients(id);
    res.json({ ok: true, data: ingredients });
  } catch (err) {
    console.error("GET ingredients error", err);
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

// =========================
// ADD INGREDIENT
// =========================
router.post("/:id/ingredients", async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = String(req.headers["x-tenant-id"] || "IMP001");

    const recipe = await getRecipeById(id);
    if (!recipe) {
      return res.status(404).json({ ok: false, error: "Recipe not found" });
    }

    const { ingredient_sku, quantity, um } = req.body;
    const qty = Number(quantity);

    if (!ingredient_sku || !um || !Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({
        ok: false,
        error: "ingredient_sku, quantity > 0 and um are required",
      });
    }

    const ingredient = await addRecipeIngredient({
      recipe_id: id,
      ...req.body,
      quantity: qty,
    });

    // ✅ VALIDAZIONE

    res.json({ ok: true, data: ingredient });
  } catch (err) {
    console.error("POST ingredient error", err);
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

// =========================
// UPDATE INGREDIENT
// =========================
router.put("/:id/ingredients/:ingredientId", async (req, res) => {
  try {
    const { id, ingredientId } = req.params;
    const tenantId = String(req.headers["x-tenant-id"] || "IMP001");

    const ingredient = await updateRecipeIngredient(ingredientId, {
      ...req.body,
    });

    if (!ingredient) {
      return res.status(404).json({ ok: false, error: "Ingredient not found" });
    }

    // ✅ VALIDAZIONE
   
    res.json({ ok: true, data: ingredient });
  } catch (err) {
    console.error("UPDATE ingredient error", err);
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

// =========================
// DELETE INGREDIENT
// =========================
router.delete("/:id/ingredients/:ingredientId", async (req, res) => {
  try {
    const { id, ingredientId } = req.params;
    const tenantId = String(req.headers["x-tenant-id"] || "IMP001");

    const deleted = await deleteRecipeIngredient(ingredientId);

    if (!deleted) {
      return res.status(404).json({ ok: false, error: "Ingredient not found" });
    }

    // ✅ VALIDAZIONE
  
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE ingredient error", err);
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
    console.error("GET recipe error", err);
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

// =========================
// CREATE
// =========================
router.post("/", async (req, res) => {
  try {
    const tenantId = String(req.headers["x-tenant-id"] || "IMP001");

    const recipe = await createRecipe({
      tenant_id: tenantId,
      ...req.body,
    });

    // ✅ VALIDAZIONE

      recipeId: recipe.id,
      tenantId,
    });

    res.json({ ok: true, data: recipe });
  } catch (err: any) {
    console.error("POST recipe error", err);

    if (err.code === "23505") {
      return res.status(400).json({
        ok: false,
        error: "Recipe already exists",
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
    const tenantId = String(req.headers["x-tenant-id"] || "IMP001");

    const recipe = await updateRecipe(id, req.body);

    if (!recipe) {
      return res.status(404).json({ ok: false, error: "Not found" });
    }

    // ✅ VALIDAZIONE
   

    res.json({ ok: true, data: recipe });
  } catch (err) {
    console.error("PUT recipe error", err);
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

    if (!["ACTIVE", "INACTIVE"].includes(status)) {
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
    console.error("PATCH status error", err);
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

export default router;
