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

import { getItemBySku } from "../data/items.store.js";

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
    console.error("GET /recipes/:id/ingredients error", err);
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

// =========================
// ADD INGREDIENT
// =========================
router.post("/:id/ingredients", async (req, res) => {
  try {
    const { id } = req.params;

    const recipe = await getRecipeById(id);
    if (!recipe) {
      return res.status(404).json({ ok: false, error: "Recipe not found" });
    }

    const {
      ingredient_sku,
      ingredient_name_snapshot,
      quantity,
      um,
      sort_order,
      is_optional,
      waste_pct,
      notes,
    } = req.body;

    const qty = Number(quantity);

    if (!ingredient_sku || !um || !Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({
        ok: false,
        error: "ingredient_sku, quantity > 0 and um are required",
      });
    }

    const item = await getItemBySku(String(ingredient_sku));
    if (!item) {
      return res.status(400).json({
        ok: false,
        error: "Ingredient SKU not found in Items",
      });
    }

    if (item.active === false) {
      return res.status(400).json({
        ok: false,
        error: "Ingredient SKU is inactive",
      });
    }

    const ingredient = await addRecipeIngredient({
      recipe_id: id,
      ingredient_sku: String(ingredient_sku),
      ingredient_name_snapshot,
      quantity: qty,
      um,
      sort_order: sort_order != null ? Number(sort_order) : 0,
      is_optional: is_optional != null ? Boolean(is_optional) : false,
      waste_pct: waste_pct != null ? Number(waste_pct) : null,
      notes,
    });

    res.json({ ok: true, data: ingredient });
  } catch (err) {
    console.error("POST /recipes/:id/ingredients error", err);
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

// =========================
// UPDATE INGREDIENT
// =========================
router.put("/:id/ingredients/:ingredientId", async (req, res) => {
  try {
    const { id, ingredientId } = req.params;

    const recipe = await getRecipeById(id);
    if (!recipe) {
      return res.status(404).json({ ok: false, error: "Recipe not found" });
    }

    const {
      ingredient_sku,
      ingredient_name_snapshot,
      quantity,
      um,
      sort_order,
      is_optional,
      waste_pct,
      notes,
    } = req.body;

    if (ingredient_sku != null) {
      const item = await getItemBySku(String(ingredient_sku));
      if (!item) {
        return res.status(400).json({
          ok: false,
          error: "Ingredient SKU not found in Items",
        });
      }

      if (item.active === false) {
        return res.status(400).json({
          ok: false,
          error: "Ingredient SKU is inactive",
        });
      }
    }

    const ingredient = await updateRecipeIngredient(ingredientId, {
      ingredient_sku: ingredient_sku != null ? String(ingredient_sku) : undefined,
      ingredient_name_snapshot,
      quantity: quantity != null ? Number(quantity) : undefined,
      um,
      sort_order: sort_order != null ? Number(sort_order) : undefined,
      is_optional: is_optional != null ? Boolean(is_optional) : undefined,
      waste_pct: waste_pct != null ? Number(waste_pct) : undefined,
      notes,
    });

    if (!ingredient) {
      return res.status(404).json({ ok: false, error: "Ingredient not found" });
    }

    res.json({ ok: true, data: ingredient });
  } catch (err) {
    console.error("PUT /recipes/:id/ingredients/:ingredientId error", err);
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

// =========================
// DELETE INGREDIENT
// =========================
router.delete("/:id/ingredients/:ingredientId", async (req, res) => {
  try {
    const { id, ingredientId } = req.params;

    const recipe = await getRecipeById(id);
    if (!recipe) {
      return res.status(404).json({ ok: false, error: "Recipe not found" });
    }

    const deleted = await deleteRecipeIngredient(ingredientId);

    if (!deleted) {
      return res.status(404).json({ ok: false, error: "Ingredient not found" });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /recipes/:id/ingredients/:ingredientId error", err);
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

    const {
      product_sku,
      name,
      selling_price,
      cic_product_id,
      cic_variant_id,
      cic_mode,
    } = req.body;

    if (!product_sku || !name) {
      return res.status(400).json({
        ok: false,
        error: "product_sku and name are required",
      });
    }

    const recipe = await createRecipe({
      tenant_id: tenantId,
      product_sku: String(product_sku),
      name: String(name),
      selling_price:
        selling_price != null && selling_price !== ""
          ? Number(selling_price)
          : null,

      // temporaneamente commentati
      // cic_product_id: cic_product_id || null,
      // cic_variant_id: cic_variant_id || null,
      // cic_mode: cic_mode || null,
    });

    res.json({ ok: true, data: recipe });

  } catch (err: any) {
    console.error("🔥 POST /recipes error FULL:", err);
    console.error("🔥 BODY:", req.body);

    if (err instanceof Error) {
      console.error("🔥 MESSAGE:", err.message);
      console.error("🔥 STACK:", err.stack);
    }

    if (err.code === "23505") {
      return res.status(400).json({
        ok: false,
        error: "Recipe already exists for this product_sku",
      });
    }

    res.status(500).json({
      ok: false,
      error: err.message || "Internal error",
    });
  }
});
// =========================
// UPDATE
// =========================
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      product_sku,
      selling_price,
      cic_product_id,
      cic_variant_id,
      cic_mode,
    } = req.body;

const recipe = await updateRecipe(id, {
  name,
  product_sku,
  selling_price:
    selling_price != null && selling_price !== ""
      ? Number(selling_price)
      : selling_price === null
      ? null
      : undefined,
});

    if (!recipe) {
      return res.status(404).json({ ok: false, error: "Not found" });
    }

    res.json({ ok: true, data: recipe });
  } catch (err: any) {
    console.error("PUT /recipes/:id error", err);

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
    console.error("PATCH /recipes/:id/status error", err);
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

export default router;
