import { useEffect, useMemo, useState } from "react";
import { authFetch } from "../api/authFetch";

type RecipeStatus = "ACTIVE" | "INACTIVE";

type Recipe = {
  id: string;
  tenant_id: string;
  product_sku: string;
  name: string;
  status: RecipeStatus;
  selling_price: string | number | null;
  created_at: string;
  updated_at: string;
};

type RecipeIngredient = {
  id: string;
  recipe_id: string;
  ingredient_sku: string;
  ingredient_name_snapshot: string | null;
  quantity: string | number;
  um: string;
  sort_order: number;
  is_optional: boolean;
  waste_pct: string | number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type Item = {
  id?: string;
  sku: string;
  name: string;
  um?: string | null;
  baseQty?: number | string | null;
  packSize?: number | string | null;
  active?: boolean;
};

type ApiResponse<T> = {
  ok?: boolean;
  data?: T;
  error?: string;
};

const colors = {
  text: "#102A43",
  textSoft: "#486581",
  textMuted: "#7B8794",
  border: "#D9E2EC",
  borderStrong: "#BCCCDC",
  panel: "#FFFFFF",
  panelAlt: "#F8FBFC",
  selected: "#E6FFFB",
  selectedBorder: "#87EAF2",
  primary: "#0B7285",
  dangerText: "#B91C1C",
  dangerSoft: "#FEE2E2",
  successSoft: "#D1FAE5",
  successText: "#065F46",
  warningSoft: "#FEF3C7",
  warningText: "#92400E",
  inactiveSoft: "#E5E7EB",
  inactiveText: "#374151",
};

const panelStyle: React.CSSProperties = {
  background: colors.panel,
  border: `1px solid ${colors.border}`,
  borderRadius: 18,
  padding: 16,
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 12,
  border: `1px solid ${colors.border}`,
  background: "#FFFFFF",
  color: colors.text,
  padding: "10px 12px",
  outline: "none",
  boxSizing: "border-box",
};

const readonlyStyle: React.CSSProperties = {
  ...inputStyle,
  background: "#F8FAFC",
  color: colors.textSoft,
};

const buttonStyle: React.CSSProperties = {
  borderRadius: 12,
  border: `1px solid ${colors.primary}`,
  background: colors.primary,
  color: "white",
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 700,
};

const secondaryButtonStyle: React.CSSProperties = {
  borderRadius: 12,
  border: `1px solid ${colors.borderStrong}`,
  background: "#FFFFFF",
  color: colors.text,
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 700,
};

const dangerButtonStyle: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid #FCA5A5",
  background: "#FFFFFF",
  color: colors.dangerText,
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 700,
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("it-IT");
}

function normalizeNum(value: string | number | null | undefined) {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeMoney(value: string | number | null | undefined) {
  const n = normalizeNum(value);
  return n.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizeUm(value?: string | null) {
  const v = String(value || "").trim().toUpperCase();
  if (v === "PZ") return "PZ";
  if (v === "CL") return "CL";
  return v || "—";
}

function statusBadgeStyle(status: RecipeStatus): React.CSSProperties {
  if (status === "ACTIVE") {
    return {
      padding: "4px 10px",
      borderRadius: 999,
      background: colors.successSoft,
      color: colors.successText,
      fontSize: 12,
      fontWeight: 700,
      border: "1px solid rgba(16,185,129,0.22)",
      display: "inline-block",
    };
  }

  return {
    padding: "4px 10px",
    borderRadius: 999,
    background: colors.inactiveSoft,
    color: colors.inactiveText,
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid rgba(107,114,128,0.18)",
    display: "inline-block",
  };
}

function itemMatches(item: Item, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    String(item.name || "").toLowerCase().includes(q) ||
    String(item.sku || "").toLowerCase().includes(q)
  );
}

function SearchPicker({
  label,
  placeholder,
  query,
  onQueryChange,
  items,
  onPick,
}: {
  label: string;
  placeholder: string;
  query: string;
  onQueryChange: (v: string) => void;
  items: Item[];
  onPick: (item: Item) => void;
}) {
  const filtered = useMemo(
    () => items.filter((it) => itemMatches(it, query)).slice(0, 8),
    [items, query]
  );

  return (
    <div style={{ position: "relative" }}>
      <div style={labelStyle}>{label}</div>
      <input
        style={inputStyle}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={placeholder}
      />

      {query.trim() && filtered.length > 0 ? (
        <div
          style={{
            position: "absolute",
            zIndex: 30,
            left: 0,
            right: 0,
            top: "100%",
            marginTop: 6,
            background: "white",
            border: `1px solid ${colors.border}`,
            borderRadius: 12,
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.12)",
            overflow: "hidden",
          }}
        >
          {filtered.map((item) => (
            <button
              key={item.sku}
              type="button"
              onClick={() => onPick(item)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                border: "none",
                borderBottom: `1px solid ${colors.border}`,
                background: "white",
                color: colors.text,
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 700 }}>{item.name}</div>
              <div style={{ fontSize: 12, color: colors.textSoft }}>
                {item.sku} · UM {normalizeUm(item.um)}
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [recipesError, setRecipesError] = useState("");

  const [items, setItems] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const [selectedRecipeId, setSelectedRecipeId] = useState("");
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [loadingIngredients, setLoadingIngredients] = useState(false);
  const [ingredientsError, setIngredientsError] = useState("");

  const [productQuery, setProductQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Item | null>(null);
  const [manualProductSku, setManualProductSku] = useState("");
  const [newRecipeName, setNewRecipeName] = useState("");
  const [newRecipeSellingPrice, setNewRecipeSellingPrice] = useState("");
  const [creatingRecipe, setCreatingRecipe] = useState(false);

  const [editingRecipeName, setEditingRecipeName] = useState("");
  const [editingRecipeSellingPrice, setEditingRecipeSellingPrice] = useState("");
  const [savingRecipe, setSavingRecipe] = useState(false);

  const [ingredientQuery, setIngredientQuery] = useState("");
  const [selectedIngredientItem, setSelectedIngredientItem] = useState<Item | null>(null);
  const [newIngredientQty, setNewIngredientQty] = useState("");
  const [addingIngredient, setAddingIngredient] = useState(false);

  const [updatingStatus, setUpdatingStatus] = useState(false);

  const [ingredientDrafts, setIngredientDrafts] = useState<
    Record<string, { ingredient_name_snapshot: string; quantity: string }>
  >({});
  const [savingIngredientId, setSavingIngredientId] = useState("");
  const [deletingIngredientId, setDeletingIngredientId] = useState("");

  const activeItems = useMemo(
    () => items.filter((it) => it.active !== false),
    [items]
  );

  const selectedRecipe = useMemo(
    () => recipes.find((r) => r.id === selectedRecipeId) ?? null,
    [recipes, selectedRecipeId]
  );

  async function loadItems() {
    setLoadingItems(true);
    try {
      const res = await authFetch("/items");
      const json = await res.json();
      setItems(Array.isArray(json) ? json : []);
    } catch (err) {
      console.error("loadItems error", err);
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  }

  async function loadRecipes() {
    setLoadingRecipes(true);
    setRecipesError("");

    try {
      const res = await authFetch("/recipes");
      const json: ApiResponse<Recipe[]> = await res.json();

      if (!res.ok || json.ok === false) {
        throw new Error(json.error || "Errore caricamento ricette");
      }

      const rows = Array.isArray(json.data) ? json.data : [];
      setRecipes(rows);

      setSelectedRecipeId((prev) => {
        if (prev && rows.some((r) => r.id === prev)) return prev;
        return rows[0]?.id || "";
      });
    } catch (err: any) {
      setRecipesError(String(err?.message || err));
    } finally {
      setLoadingRecipes(false);
    }
  }

  async function loadIngredients(recipeId: string) {
    if (!recipeId) {
      setIngredients([]);
      return;
    }

    setLoadingIngredients(true);
    setIngredientsError("");

    try {
      const res = await authFetch(`/recipes/${recipeId}/ingredients`);
      const json: ApiResponse<RecipeIngredient[]> = await res.json();

      if (!res.ok || json.ok === false) {
        throw new Error(json.error || "Errore caricamento ingredienti");
      }

      const rows = Array.isArray(json.data) ? json.data : [];
      setIngredients(rows);

      const drafts: Record<
        string,
        { ingredient_name_snapshot: string; quantity: string }
      > = {};
      for (const ing of rows) {
        drafts[ing.id] = {
          ingredient_name_snapshot: ing.ingredient_name_snapshot || "",
          quantity: String(normalizeNum(ing.quantity)),
        };
      }
      setIngredientDrafts(drafts);
    } catch (err: any) {
      setIngredientsError(String(err?.message || err));
      setIngredients([]);
      setIngredientDrafts({});
    } finally {
      setLoadingIngredients(false);
    }
  }

  useEffect(() => {
    loadItems();
    loadRecipes();
  }, []);

  useEffect(() => {
    if (selectedRecipeId) loadIngredients(selectedRecipeId);
    else {
      setIngredients([]);
      setIngredientDrafts({});
    }
  }, [selectedRecipeId]);

  useEffect(() => {
    if (selectedRecipe) {
      setEditingRecipeName(selectedRecipe.name || "");
      setEditingRecipeSellingPrice(
        selectedRecipe.selling_price == null ? "" : String(selectedRecipe.selling_price)
      );
    } else {
      setEditingRecipeName("");
      setEditingRecipeSellingPrice("");
    }
  }, [selectedRecipe]);

function handlePickProduct(item: Item) {
  setSelectedProduct(item);
  setManualProductSku("");
  setProductQuery(`${item.name} · ${item.sku}`);
  setNewRecipeName(item.name || "");
}

  function handlePickIngredient(item: Item) {
    setSelectedIngredientItem(item);
    setIngredientQuery(`${item.name} · ${item.sku}`);
  }

async function handleCreateRecipe() {
  const finalSku = manualProductSku.trim() || selectedProduct?.sku || "";
  const finalName = newRecipeName.trim() || selectedProduct?.name || "";

  if (!finalSku) {
    alert("Inserisci uno SKU manuale oppure seleziona un prodotto.");
    return;
  }

  if (!finalName) {
    alert("Inserisci il nome ricetta.");
    return;
  }

  const price =
    newRecipeSellingPrice.trim() === ""
      ? null
      : Number(newRecipeSellingPrice.replace(",", "."));

  if (price != null && (!Number.isFinite(price) || price < 0)) {
    alert("Prezzo vendita non valido.");
    return;
  }

  setCreatingRecipe(true);

  try {
    const res = await authFetch("/recipes", {
      method: "POST",
      body: JSON.stringify({
        product_sku: finalSku,
        name: finalName,
        selling_price: price,
      }),
    });

    const json: ApiResponse<Recipe> = await res.json();

    if (!res.ok || json.ok === false || !json.data) {
      throw new Error(json.error || "Errore creazione ricetta");
    }

    setSelectedProduct(null);
    setProductQuery("");
    setManualProductSku("");
    setNewRecipeName("");
    setNewRecipeSellingPrice("");

    await loadRecipes();
    setSelectedRecipeId(json.data.id);
  } catch (err: any) {
    alert(String(err?.message || err));
  } finally {
    setCreatingRecipe(false);
  }
}

  async function handleSaveRecipe() {
    if (!selectedRecipe) return;

    const name = editingRecipeName.trim();
    const price =
      editingRecipeSellingPrice.trim() === ""
        ? null
        : Number(editingRecipeSellingPrice.replace(",", "."));

    if (!name) {
      alert("Il nome ricetta è obbligatorio.");
      return;
    }

    if (price != null && (!Number.isFinite(price) || price < 0)) {
      alert("Prezzo vendita non valido.");
      return;
    }

    setSavingRecipe(true);

    try {
      const res = await authFetch(`/recipes/${selectedRecipe.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name,
          selling_price: price,
        }),
      });

      const json: ApiResponse<Recipe> = await res.json();

      if (!res.ok || json.ok === false || !json.data) {
        throw new Error(json.error || "Errore salvataggio ricetta");
      }

      setRecipes((prev) =>
        prev.map((r) => (r.id === selectedRecipe.id ? json.data! : r))
      );
    } catch (err: any) {
      alert(String(err?.message || err));
    } finally {
      setSavingRecipe(false);
    }
  }

  async function handleChangeStatus(nextStatus: RecipeStatus) {
    if (!selectedRecipe) return;

    setUpdatingStatus(true);
    try {
      const res = await authFetch(`/recipes/${selectedRecipe.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });

      const json: ApiResponse<Recipe> = await res.json();

      if (!res.ok || json.ok === false || !json.data) {
        throw new Error(json.error || "Errore aggiornamento stato");
      }

      setRecipes((prev) =>
        prev.map((r) => (r.id === selectedRecipe.id ? json.data! : r))
      );
    } catch (err: any) {
      alert(String(err?.message || err));
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleAddIngredient() {
    if (!selectedRecipe) {
      alert("Seleziona una ricetta.");
      return;
    }

    if (!selectedIngredientItem) {
      alert("Seleziona un ingrediente dall'anagrafica.");
      return;
    }

    const qty = Number(newIngredientQty.replace(",", "."));
    if (!Number.isFinite(qty) || qty <= 0) {
      alert("Inserisci una quantità valida.");
      return;
    }

    const um = normalizeUm(selectedIngredientItem.um);
    if (um !== "PZ" && um !== "CL") {
      alert("Per ora il ricettario gestisce ingredienti in PZ o CL.");
      return;
    }

    setAddingIngredient(true);

    try {
      const res = await authFetch(`/recipes/${selectedRecipe.id}/ingredients`, {
        method: "POST",
        body: JSON.stringify({
          ingredient_sku: selectedIngredientItem.sku,
          ingredient_name_snapshot: selectedIngredientItem.name,
          quantity: qty,
          um,
        }),
      });

      const json: ApiResponse<RecipeIngredient> = await res.json();

      if (!res.ok || json.ok === false || !json.data) {
        throw new Error(json.error || "Errore inserimento ingrediente");
      }

      setSelectedIngredientItem(null);
      setIngredientQuery("");
      setNewIngredientQty("");

      await loadIngredients(selectedRecipe.id);
    } catch (err: any) {
      alert(String(err?.message || err));
    } finally {
      setAddingIngredient(false);
    }
  }

  function updateIngredientDraft(
    ingredientId: string,
    patch: Partial<{ ingredient_name_snapshot: string; quantity: string }>
  ) {
    setIngredientDrafts((prev) => ({
      ...prev,
      [ingredientId]: {
        ingredient_name_snapshot:
          patch.ingredient_name_snapshot ??
          prev[ingredientId]?.ingredient_name_snapshot ??
          "",
        quantity: patch.quantity ?? prev[ingredientId]?.quantity ?? "",
      },
    }));
  }

  async function handleSaveIngredient(ing: RecipeIngredient) {
    if (!selectedRecipe) return;

    const draft = ingredientDrafts[ing.id];
    const qty = Number(String(draft?.quantity || "").replace(",", "."));

    if (!Number.isFinite(qty) || qty <= 0) {
      alert("Quantità ingrediente non valida.");
      return;
    }

    setSavingIngredientId(ing.id);

    try {
      const res = await authFetch(
        `/recipes/${selectedRecipe.id}/ingredients/${ing.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            ingredient_name_snapshot:
              (draft?.ingredient_name_snapshot || "").trim() || null,
            quantity: qty,
          }),
        }
      );

      const json: ApiResponse<RecipeIngredient> = await res.json();

      if (!res.ok || json.ok === false || !json.data) {
        throw new Error(json.error || "Errore salvataggio ingrediente");
      }

      await loadIngredients(selectedRecipe.id);
    } catch (err: any) {
      alert(String(err?.message || err));
    } finally {
      setSavingIngredientId("");
    }
  }

  async function handleDeleteIngredient(ing: RecipeIngredient) {
    if (!selectedRecipe) return;

    const confirmed = window.confirm(
      `Eliminare l'ingrediente ${ing.ingredient_name_snapshot || ing.ingredient_sku}?`
    );
    if (!confirmed) return;

    setDeletingIngredientId(ing.id);

    try {
      const res = await authFetch(
        `/recipes/${selectedRecipe.id}/ingredients/${ing.id}`,
        {
          method: "DELETE",
        }
      );

      const json = await res.json();

      if (!res.ok || json.ok === false) {
        throw new Error(json.error || "Errore eliminazione ingrediente");
      }

      await loadIngredients(selectedRecipe.id);
    } catch (err: any) {
      alert(String(err?.message || err));
    } finally {
      setDeletingIngredientId("");
    }
  }

  return (
    <div style={{ padding: 20, color: colors.text }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 18,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>Ricettario</div>
          <div style={{ color: colors.textSoft, marginTop: 4 }}>
           Ricette di vendita con ingredienti collegati all'anagrafica articoli.
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "420px minmax(0, 1fr)",
          gap: 16,
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: 16 }}>
          <div style={panelStyle}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
              Nuova ricetta
            </div>

            <div style={{ display: "grid", gap: 10 }}>

              <SearchPicker
  label="Prodotto da anagrafica (opzionale)"
  placeholder={
    loadingItems
      ? "Caricamento articoli..."
      : "Cerca prodotto per nome o SKU"
  }
  query={productQuery}
  onQueryChange={setProductQuery}
  items={activeItems}
  onPick={handlePickProduct}
/>

<div>
  <div style={labelStyle}>SKU selezionato da anagrafica</div>
  <input
    style={readonlyStyle}
    value={selectedProduct?.sku || ""}
    readOnly
    placeholder="Seleziona un prodotto"
  />
</div>

<div>
  <div style={labelStyle}>Oppure SKU manuale</div>
<input
  style={inputStyle}
  value={manualProductSku}
  onChange={(e) => {
    const value = e.target.value.toUpperCase();
    setManualProductSku(value);

    if (value.trim()) {
      setSelectedProduct(null);
      setProductQuery("");
    }
  }}
  placeholder="Es. SPRITZ"
/>
</div>

              <div style={{ fontSize: 12, color: colors.textMuted, marginTop: -4 }}>
  Se compili lo SKU manuale, verrà usato quello al posto del prodotto selezionato.
</div>
              
<div>
  <div style={labelStyle}>Nome ricetta</div>
  <input
    style={inputStyle}
    value={newRecipeName}
    onChange={(e) => setNewRecipeName(e.target.value)}
    placeholder="Nome prodotto venduto"
  />
</div>

<div>
  <div style={labelStyle}>UM prodotto</div>
  <input
    style={readonlyStyle}
    value={selectedProduct ? normalizeUm(selectedProduct.um) : "—"}
    readOnly
  />
</div>

              <div>
                <div style={labelStyle}>Prezzo vendita base</div>
                <input
                  style={inputStyle}
                  value={newRecipeSellingPrice}
                  onChange={(e) => setNewRecipeSellingPrice(e.target.value)}
                  placeholder="Es. 10,00"
                  inputMode="decimal"
                />
              </div>

              <button
                style={buttonStyle}
                onClick={handleCreateRecipe}
                disabled={creatingRecipe}
              >
                {creatingRecipe ? "Creazione..." : "Crea ricetta"}
              </button>
            </div>
          </div>

          <div style={panelStyle}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700 }}>Ricette</div>
              <button
                style={secondaryButtonStyle}
                onClick={loadRecipes}
                disabled={loadingRecipes}
              >
                {loadingRecipes ? "Aggiorno..." : "Ricarica"}
              </button>
            </div>

            {recipesError ? (
              <div style={{ color: colors.dangerText }}>{recipesError}</div>
            ) : null}

            {!loadingRecipes && recipes.length === 0 ? (
              <div style={{ color: colors.textSoft }}>Nessuna ricetta presente.</div>
            ) : null}

            <div style={{ display: "grid", gap: 10 }}>
              {recipes.map((recipe) => {
                const selected = recipe.id === selectedRecipeId;

                return (
                  <button
                    key={recipe.id}
                    onClick={() => setSelectedRecipeId(recipe.id)}
                    style={{
                      textAlign: "left",
                      borderRadius: 14,
                      padding: 12,
                      cursor: "pointer",
                      color: colors.text,
                      border: selected
                        ? `1px solid ${colors.selectedBorder}`
                        : `1px solid ${colors.border}`,
                      background: selected ? colors.selected : colors.panelAlt,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        alignItems: "start",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700 }}>{recipe.name}</div>
                        <div style={{ fontSize: 12, color: colors.textSoft, marginTop: 4 }}>
                          {recipe.product_sku}
                        </div>
                        <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>
                          Prezzo base € {normalizeMoney(recipe.selling_price)}
                        </div>
                      </div>

                      <div style={statusBadgeStyle(recipe.status)}>{recipe.status}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <div style={panelStyle}>
            {!selectedRecipe ? (
              <div style={{ color: colors.textSoft }}>
                Seleziona una ricetta per vedere il dettaglio.
              </div>
            ) : (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                    alignItems: "start",
                    flexWrap: "wrap",
                    marginBottom: 14,
                  }}
                >
                  <div style={{ minWidth: 300, flex: 1 }}>
                    <div style={labelStyle}>SKU prodotto</div>
                    <input
                      style={readonlyStyle}
                      value={selectedRecipe.product_sku}
                      readOnly
                    />

                    <div style={{ height: 10 }} />

                    <div style={labelStyle}>Nome ricetta</div>
                    <input
                      style={inputStyle}
                      value={editingRecipeName}
                      onChange={(e) => setEditingRecipeName(e.target.value)}
                    />

                    <div style={{ height: 10 }} />

                    <div style={labelStyle}>Prezzo base</div>
                    <input
                      style={inputStyle}
                      value={editingRecipeSellingPrice}
                      onChange={(e) => setEditingRecipeSellingPrice(e.target.value)}
                      placeholder="Es. 10,00"
                      inputMode="decimal"
                    />

                    <div
                      style={{
                        color: colors.textMuted,
                        fontSize: 12,
                        marginTop: 10,
                      }}
                    >
                      Creata: {formatDate(selectedRecipe.created_at)} | Aggiornata:{" "}
                      {formatDate(selectedRecipe.updated_at)}
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <button
                        style={buttonStyle}
                        onClick={handleSaveRecipe}
                        disabled={savingRecipe}
                      >
                        {savingRecipe ? "Salvataggio..." : "Salva ricetta"}
                      </button>
                    </div>
                  </div>

<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
  <button
    style={secondaryButtonStyle}
    disabled={updatingStatus || selectedRecipe.status === "ACTIVE"}
    onClick={() => handleChangeStatus("ACTIVE")}
  >
    ACTIVE
  </button>
  <button
    style={secondaryButtonStyle}
    disabled={updatingStatus || selectedRecipe.status === "INACTIVE"}
    onClick={() => handleChangeStatus("INACTIVE")}
  >
    INACTIVE
  </button>
</div>
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={statusBadgeStyle(selectedRecipe.status)}>{selectedRecipe.status}</div>
                  <div style={{ color: colors.textSoft }}>
                    Ingredienti presenti: <strong>{ingredients.length}</strong>
                  </div>
                </div>
              </>
            )}
          </div>

          <div style={panelStyle}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
              Aggiungi ingrediente
            </div>

            {!selectedRecipe ? (
              <div style={{ color: colors.textSoft }}>
                Seleziona prima una ricetta dalla colonna sinistra.
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.3fr 140px 120px auto",
                  gap: 10,
                  alignItems: "end",
                }}
              >
                <SearchPicker
                  label="Ingrediente"
                  placeholder="Cerca ingrediente per nome o SKU"
                  query={ingredientQuery}
                  onQueryChange={setIngredientQuery}
                  items={activeItems}
                  onPick={handlePickIngredient}
                />

                <div>
                  <div style={labelStyle}>UM</div>
                  <input
                    style={readonlyStyle}
                    value={normalizeUm(selectedIngredientItem?.um)}
                    readOnly
                  />
                </div>

                <div>
                  <div style={labelStyle}>
                    Quantità ({normalizeUm(selectedIngredientItem?.um) === "PZ" ? "PZ" : "CL"})
                  </div>
                  <input
                    style={inputStyle}
                    value={newIngredientQty}
                    onChange={(e) => setNewIngredientQty(e.target.value)}
                    placeholder="Es. 3"
                    inputMode="decimal"
                  />
                </div>

                <button
                  style={buttonStyle}
                  onClick={handleAddIngredient}
                  disabled={addingIngredient}
                >
                  {addingIngredient ? "Salvo..." : "Aggiungi"}
                </button>
              </div>
            )}
          </div>

          <div style={panelStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700 }}>Ingredienti ricetta</div>

              {selectedRecipe ? (
                <button
                  style={secondaryButtonStyle}
                  onClick={() => loadIngredients(selectedRecipe.id)}
                  disabled={loadingIngredients}
                >
                  {loadingIngredients ? "Aggiorno..." : "Ricarica"}
                </button>
              ) : null}
            </div>

            {ingredientsError ? (
              <div style={{ color: colors.dangerText, marginBottom: 10 }}>
                {ingredientsError}
              </div>
            ) : null}

            {!selectedRecipe ? (
              <div style={{ color: colors.textSoft }}>
                Seleziona una ricetta per vedere gli ingredienti.
              </div>
            ) : loadingIngredients ? (
              <div style={{ color: colors.textSoft }}>Caricamento ingredienti...</div>
            ) : ingredients.length === 0 ? (
              <div style={{ color: colors.textSoft }}>Nessun ingrediente inserito.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    color: colors.text,
                  }}
                >
                  <thead>
                    <tr>
                      <th style={thStyle}>SKU</th>
                      <th style={thStyle}>Nome</th>
                      <th style={thStyleRight}>Q.tà</th>
                      <th style={thStyle}>UM</th>
                      <th style={thStyle}>Aggiornato</th>
                      <th style={thStyle}>Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ingredients.map((ing) => {
                      const draft = ingredientDrafts[ing.id] || {
                        ingredient_name_snapshot: ing.ingredient_name_snapshot || "",
                        quantity: String(normalizeNum(ing.quantity)),
                      };

                      return (
                        <tr key={ing.id}>
                          <td style={tdStyle}>{ing.ingredient_sku}</td>
                          <td style={tdStyle}>
                            <input
                              style={inputStyle}
                              value={draft.ingredient_name_snapshot}
                              onChange={(e) =>
                                updateIngredientDraft(ing.id, {
                                  ingredient_name_snapshot: e.target.value,
                                })
                              }
                            />
                          </td>
                          <td style={tdStyleRight}>
                            <input
                              style={{ ...inputStyle, textAlign: "right" }}
                              value={draft.quantity}
                              onChange={(e) =>
                                updateIngredientDraft(ing.id, {
                                  quantity: e.target.value,
                                })
                              }
                              inputMode="decimal"
                            />
                          </td>
                          <td style={tdStyle}>{ing.um}</td>
                          <td style={tdStyle}>{formatDate(ing.updated_at)}</td>
                          <td style={tdStyle}>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                style={secondaryButtonStyle}
                                onClick={() => handleSaveIngredient(ing)}
                                disabled={savingIngredientId === ing.id}
                              >
                                {savingIngredientId === ing.id ? "Salvo..." : "Salva"}
                              </button>
                              <button
                                style={dangerButtonStyle}
                                onClick={() => handleDeleteIngredient(ing)}
                                disabled={deletingIngredientId === ing.id}
                              >
                                {deletingIngredientId === ing.id ? "Elimino..." : "Elimina"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: colors.textSoft,
  marginBottom: 6,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  fontSize: 12,
  color: colors.textSoft,
  fontWeight: 700,
  padding: "10px 8px",
  borderBottom: `1px solid ${colors.border}`,
  whiteSpace: "nowrap",
};

const thStyleRight: React.CSSProperties = {
  ...thStyle,
  textAlign: "right",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 8px",
  borderBottom: `1px solid ${colors.border}`,
  fontSize: 14,
  color: colors.text,
  verticalAlign: "middle",
};

const tdStyleRight: React.CSSProperties = {
  ...tdStyle,
  textAlign: "right",
};
