import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/authStore";

export default function LoginPage() {
  const { login, isAuthenticated, loading } = useAuth();

  const [email, setEmail] = useState("admin@gestionale.local");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!loading && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const result = await login(email.trim(), password);

    if (!result.ok) {
      setError(result.error);
    }

    setSubmitting(false);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#0f172a",
        padding: 24,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#111827",
          color: "white",
    borderRadius: 16,
          padding: 24,
          boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 28 }}>Login Core</h1>
        <p style={{ opacity: 0.75, marginTop: 8 }}>
          Accedi al gestionale con email e password
        </p>

        <div style={{ marginTop: 20 }}>
          <label style={{ display: "block", marginBottom: 8 }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            style={inputStyle}
            placeholder="admin@gestionale.local"
          />
        </div>

        <div style={{ marginTop: 16 }}>
          <label style={{ display: "block", marginBottom: 8 }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            style={inputStyle}
            placeholder="••••••••"
          />
        </div>

        {error ? (
          <div
            style={{
              marginTop: 16,
              background: "rgba(220,38,38,0.18)",
              color: "#fecaca",
              border: "1px solid rgba(239,68,68,0.35)",
              padding: 12,
              borderRadius: 10,
            }}
          >
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={submitting || loading}
          style={{
            marginTop: 20,
            width: "100%",
            border: 0,
            borderRadius: 12,
            padding: "12px 16px",
            fontSize: 16,
            fontWeight: 600,
            cursor: "pointer",
            background: "#22c55e",
            color: "#06240f",
            opacity: submitting || loading ? 0.7 : 1,
          }}
        >
          {submitting ? "Accesso..." : "Accedi"}
        </button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "#0b1220",
  color: "white",
  outline: "none",
  fontSize: 15,
  boxSizing: "border-box",
};