import { useEffect, useMemo, useState } from "react";
import { authFetch } from "../api/authFetch";

type RecipeStatus = "DRAFT" | "ACTIVE" | "INACTIVE";

type Recipe = {
  id: string;
  tenant_id: string;
  product_sku: string;
  name: string;
  status: RecipeStatus;
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

type ApiResponse<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

const panelStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 18,
  padding: 16,
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 12,
  border: "1px solid #D9E2EC",
  background: "white",
  color: "#102A43",
  padding: "10px 12px",
  outline: "none",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: "none",
};

const buttonStyle: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid #BCCCDC",
  background: "#0B7285",
  color: "white",
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 700,
};

const secondaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "white",
  color: "#243B53",
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

function statusBadgeStyle(status: RecipeStatus): React.CSSProperties {
  if (status === "ACTIVE") {
    return {
      padding: "4px 10px",
      borderRadius: 999,
      background: "rgba(52, 211, 153, 0.18)",
      color: "#a7f3d0",
      fontSize: 12,
      fontWeight: 700,
      border: "1px solid rgba(52,211,153,0.30)",
      display: "inline-block",
    };
  }

  if (status === "INACTIVE") {
    return {
      padding: "4px 10px",
      borderRadius: 999,
      background: "rgba(248, 113, 113, 0.16)",
      color: "#fecaca",
      fontSize: 12,
      fontWeight: 700,
      border: "1px solid rgba(248,113,113,0.28)",
      display: "inline-block",
    };
  }

  return {
    padding: "4px 10px",
    borderRadius: 999,
    background: "rgba(250, 204, 21, 0.14)",
    color: "#fde68a",
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid rgba(250,204,21,0.24)",
    display: "inline-block",
  };
}

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [recipesError, setRecipesError] = useState<string>("");

  const [selectedRecipeId, setSelectedRecipeId] = useState<string>("");

  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [loadingIngredients, setLoadingIngredients] = useState(false);
  const [ingredientsError, setIngredientsError] = useState<string>("");

  const [creatingRecipe, setCreatingRecipe] = useState(false);
  const [newRecipeSku, setNewRecipeSku] = useState("");
  const [newRecipeName, setNewRecipeName] = useState("");

  const [updatingStatus, setUpdatingStatus] = useState(false);

  const [addingIngredient, setAddingIngredient] = useState(false);
  const [newIngredientSku, setNewIngredientSku] = useState("");
  const [newIngredientName, setNewIngredientName] = useState("");
  const [newIngredientQty, setNewIngredientQty] = useState("");
  const [newIngredientUm, setNewIngredientUm] = useState("CL");

  const selectedRecipe = useMemo(
    () => recipes.find((r) => r.id === selectedRecipeId) ?? null,
    [recipes, selectedRecipeId]
  );

  async function loadRecipes() {
    setLoadingRecipes(true);
    setRecipesError("");

    try {
      const res = await authFetch("/recipes");
      const json: ApiResponse<Recipe[]> = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Errore caricamento ricette");
      }

      setRecipes(json.data || []);

      setSelectedRecipeId((prev) => {
        if (prev && (json.data || []).some((r) => r.id === prev)) return prev;
        return json.data?.[0]?.id || "";
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

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Errore caricamento ingredienti");
      }

      setIngredients(json.data || []);
    } catch (err: any) {
      setIngredientsError(String(err?.message || err));
      setIngredients([]);
    } finally {
      setLoadingIngredients(false);
    }
  }

  useEffect(() => {
    loadRecipes();
  }, []);

  useEffect(() => {
    if (selectedRecipeId) {
      loadIngredients(selectedRecipeId);
    } else {
      setIngredients([]);
    }
  }, [selectedRecipeId]);

  async function handleCreateRecipe() {
    const sku = newRecipeSku.trim().toUpperCase();
    const name = newRecipeName.trim();

    if (!sku || !name) {
      alert("Inserisci SKU prodotto e nome ricetta.");
      return;
    }

    setCreatingRecipe(true);

    try {
      const res = await authFetch("/recipes", {
        method: "POST",
        body: JSON.stringify({
          product_sku: sku,
          name,
        }),
      });

      const json: ApiResponse<Recipe> = await res.json();

      if (!res.ok || !json.ok || !json.data) {
        throw new Error(json.error || "Errore creazione ricetta");
      }

      setNewRecipeSku("");
      setNewRecipeName("");

      await loadRecipes();
      setSelectedRecipeId(json.data.id);
    } catch (err: any) {
      alert(String(err?.message || err));
    } finally {
      setCreatingRecipe(false);
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

      if (!res.ok || !json.ok || !json.data) {
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

    const ingredientSku = newIngredientSku.trim().toUpperCase();
    const ingredientName = newIngredientName.trim();
    const qty = Number(newIngredientQty);

    if (!ingredientSku) {
      alert("Inserisci lo SKU ingrediente.");
      return;
    }

    if (!Number.isFinite(qty) || qty <= 0) {
      alert("Inserisci una quantità valida maggiore di zero.");
      return;
    }

    if (!newIngredientUm.trim()) {
      alert("Inserisci l'unità di misura.");
      return;
    }

    setAddingIngredient(true);

    try {
      const res = await authFetch(`/recipes/${selectedRecipe.id}/ingredients`, {
        method: "POST",
        body: JSON.stringify({
          ingredient_sku: ingredientSku,
          ingredient_name_snapshot: ingredientName || null,
          quantity: qty,
          um: newIngredientUm.trim().toUpperCase(),
        }),
      });

      const json: ApiResponse<RecipeIngredient> = await res.json();

      if (!res.ok || !json.ok || !json.data) {
        throw new Error(json.error || "Errore inserimento ingrediente");
      }

      setNewIngredientSku("");
      setNewIngredientName("");
      setNewIngredientQty("");
      setNewIngredientUm("CL");

      await loadIngredients(selectedRecipe.id);
    } catch (err: any) {
      alert(String(err?.message || err));
    } finally {
      setAddingIngredient(false);
    }
  }

  const ingredientCount = ingredients.length;

  return (
    <div style={{ padding: 20, color: "#102A43" }}>
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
          <div style={{ opacity: 0.72, marginTop: 4 }}>
            Gestione ricette, ingredienti e stato operativo.
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "380px minmax(0, 1fr)",
          gap: 16,
          alignItems: "start",
        }}
      >
        {/* COLONNA SINISTRA */}
        <div style={{ display: "grid", gap: 16 }}>
          <div style={panelStyle}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
              Nuova ricetta
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                  SKU prodotto
                </div>
                <input
                  style={inputStyle}
                  value={newRecipeSku}
                  onChange={(e) => setNewRecipeSku(e.target.value)}
                  placeholder="Es. SKU_NEGRONI"
                />
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                  Nome ricetta
                </div>
                <input
                  style={inputStyle}
                  value={newRecipeName}
                  onChange={(e) => setNewRecipeName(e.target.value)}
                  placeholder="Es. Negroni"
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
              <div style={{ color: "#fecaca" }}>{recipesError}</div>
            ) : null}

            {!loadingRecipes && recipes.length === 0 ? (
              <div style={{ opacity: 0.7 }}>Nessuna ricetta presente.</div>
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
                     color: "#102A43",
                      border: selected
                        ? "1px solid rgba(255,255,255,0.22)"
                        : "1px solid rgba(255,255,255,0.08)",
                      background: selected
                        ? "rgba(255,255,255,0.12)"
                        : "rgba(255,255,255,0.04)",
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
                        <div style={{ fontSize: 12, opacity: 0.72, marginTop: 4 }}>
                          {recipe.product_sku}
                        </div>
                      </div>

                      <div style={statusBadgeStyle(recipe.status)}>
                        {recipe.status}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* COLONNA DESTRA */}
        <div style={{ display: "grid", gap: 16 }}>
          <div style={panelStyle}>
            {!selectedRecipe ? (
              <div style={{ opacity: 0.7 }}>
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
                  <div>
                    <div style={{ fontSize: 26, fontWeight: 800 }}>
                      {selectedRecipe.name}
                    </div>
                    <div style={{ opacity: 0.72, marginTop: 6 }}>
                      SKU prodotto: <strong>{selectedRecipe.product_sku}</strong>
                    </div>
                    <div style={{ opacity: 0.56, fontSize: 12, marginTop: 6 }}>
                      Creata: {formatDate(selectedRecipe.created_at)} | Aggiornata:{" "}
                      {formatDate(selectedRecipe.updated_at)}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      style={secondaryButtonStyle}
                      disabled={updatingStatus || selectedRecipe.status === "DRAFT"}
                      onClick={() => handleChangeStatus("DRAFT")}
                    >
                      DRAFT
                    </button>
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
                  <div style={statusBadgeStyle(selectedRecipe.status)}>
                    {selectedRecipe.status}
                  </div>
                  <div style={{ opacity: 0.72 }}>
                    Ingredienti presenti: <strong>{ingredientCount}</strong>
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
              <div style={{ opacity: 0.7 }}>
                Seleziona prima una ricetta dalla colonna sinistra.
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.2fr 1fr 120px 110px auto",
                  gap: 10,
                  alignItems: "end",
                }}
              >
                <div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                    SKU ingrediente
                  </div>
                  <input
                    style={inputStyle}
                    value={newIngredientSku}
                    onChange={(e) => setNewIngredientSku(e.target.value)}
                    placeholder="Es. SKU_GIN"
                  />
                </div>

                <div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                    Nome snapshot
                  </div>
                  <input
                    style={inputStyle}
                    value={newIngredientName}
                    onChange={(e) => setNewIngredientName(e.target.value)}
                    placeholder="Es. Gin"
                  />
                </div>

                <div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                    Quantità
                  </div>
                  <input
                    style={inputStyle}
                    value={newIngredientQty}
                    onChange={(e) => setNewIngredientQty(e.target.value)}
                    placeholder="3"
                    inputMode="decimal"
                  />
                </div>

                <div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                    UM
                  </div>
                  <select
                    style={selectStyle}
                    value={newIngredientUm}
                    onChange={(e) => setNewIngredientUm(e.target.value)}
                  >
                    <option value="CL">CL</option>
                    <option value="ML">ML</option>
                    <option value="L">L</option>
                    <option value="PZ">PZ</option>
                    <option value="GR">GR</option>
                    <option value="KG">KG</option>
                  </select>
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
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                Ingredienti ricetta
              </div>

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
              <div style={{ color: "#fecaca", marginBottom: 10 }}>
                {ingredientsError}
              </div>
            ) : null}

            {!selectedRecipe ? (
              <div style={{ opacity: 0.7 }}>
                Seleziona una ricetta per vedere gli ingredienti.
              </div>
            ) : loadingIngredients ? (
              <div style={{ opacity: 0.7 }}>Caricamento ingredienti...</div>
            ) : ingredients.length === 0 ? (
              <div style={{ opacity: 0.7 }}>Nessun ingrediente inserito.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    color: "#102A43",
                  }}
                >
                  <thead>
                    <tr>
                      <th style={thStyle}>SKU</th>
                      <th style={thStyle}>Nome</th>
                      <th style={thStyleRight}>Q.tà</th>
                      <th style={thStyle}>UM</th>
                      <th style={thStyle}>Opzionale</th>
                      <th style={thStyle}>Aggiornato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ingredients.map((ing) => (
                      <tr key={ing.id}>
                        <td style={tdStyle}>{ing.ingredient_sku}</td>
                        <td style={tdStyle}>
                          {ing.ingredient_name_snapshot || "—"}
                        </td>
                        <td style={tdStyleRight}>{normalizeNum(ing.quantity)}</td>
                        <td style={tdStyle}>{ing.um}</td>
                        <td style={tdStyle}>
                          {ing.is_optional ? "Sì" : "No"}
                        </td>
                        <td style={tdStyle}>{formatDate(ing.updated_at)}</td>
                      </tr>
                    ))}
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

const thStyle: React.CSSProperties = {
  textAlign: "left",
  fontSize: 12,
  opacity: 0.7,
  fontWeight: 700,
  padding: "10px 8px",
  borderBottom: "1px solid rgba(255,255,255,0.10)",
  whiteSpace: "nowrap",
};

const thStyleRight: React.CSSProperties = {
  ...thStyle,
  textAlign: "right",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 8px",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  fontSize: 14,
};

const tdStyleRight: React.CSSProperties = {
  ...tdStyle,
  textAlign: "right",
};
