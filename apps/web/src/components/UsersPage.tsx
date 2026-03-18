import React, { useEffect, useState } from "react";
import {
  createUserRequest,
  loadUsersRequest,
  toggleUserActiveRequest,
  type UserRow,
} from "../api/users";
import CicAdminTools from "./CicAdminTools";


const ROLES = ["ADMIN", "MAGAZZINO", "OPERATORE", "CONTABILITA"] as const;

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] =
    useState<"ADMIN" | "MAGAZZINO" | "OPERATORE" | "CONTABILITA">("OPERATORE");

  async function loadUsers() {
    try {
      setErr(null);
      const rows = await loadUsersRequest();
      setUsers(rows);
    } catch (e: any) {
      setErr(e?.message || "Errore caricamento utenti");
      setUsers([]);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleCreateUser() {
    try {
      setLoading(true);
      setErr(null);

      await createUserRequest({
        email,
        password,
        firstName,
        lastName,
        role,
      });

      setEmail("");
      setPassword("");
      setFirstName("");
      setLastName("");
      setRole("OPERATORE");

      await loadUsers();
    } catch (e: any) {
      setErr(e?.message || "Errore creazione utente");
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleUser(userId: string) {
    try {
      setLoading(true);
      setErr(null);

      await toggleUserActiveRequest(userId);
      await loadUsers();
    } catch (e: any) {
      setErr(e?.message || "Errore aggiornamento utente");
    } finally {
      setLoading(false);
    }
  }

return (
  <div style={{ display: "grid", gap: 16 }}>
    <div style={card}>
      <h2 style={{ marginTop: 0 }}>Utenti</h2>

      {err ? <div style={errorBox}>{err}</div> : null}

      <div style={grid2}>
        <input
          style={inp}
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          style={inp}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <input
          style={inp}
          placeholder="Nome"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />

        <input
          style={inp}
          placeholder="Cognome"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />

        <select
          style={inp}
          value={role}
          onChange={(e) =>
            setRole(
              e.target.value as
                | "ADMIN"
                | "MAGAZZINO"
                | "OPERATORE"
                | "CONTABILITA"
            )
          }
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={handleCreateUser}
        disabled={loading}
        style={btnPrimary}
      >
        Crea utente
      </button>
    </div>

    <CicAdminTools />

    <div style={card}>
      <h3 style={{ marginTop: 0 }}>Elenco utenti</h3>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>Nome</th>
            <th style={th}>Email</th>
            <th style={th}>Ruolo</th>
            <th style={th}>Stato</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const fullName = [u.first_name, u.last_name]
              .filter(Boolean)
              .join(" ");

            return (
              <tr key={u.id}>
                <td style={td}>{fullName || "-"}</td>
                <td style={td}>{u.email}</td>
                <td style={td}>{u.role}</td>
                <td style={td}>{u.is_active ? "Attivo" : "Disattivato"}</td>
                <td style={td}>
                  <button
                    onClick={() => handleToggleUser(u.id)}
                    disabled={loading}
                    style={btnGhost}
                  >
                    {u.is_active ? "Disattiva" : "Riattiva"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);
}

const card: React.CSSProperties = {
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 16,
};

const grid2: React.CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  marginBottom: 16,
};

const inp: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid #d6dbe6",
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #0B7285",
  background: "#0B7285",
  color: "white",
  cursor: "pointer",
  fontWeight: 900,
};

const btnGhost: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #d6dbe6",
  background: "white",
  cursor: "pointer",
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: 10,
  borderBottom: "1px solid #e5e7eb",
};

const td: React.CSSProperties = {
  padding: 10,
  borderBottom: "1px solid #f1f5f9",
};

const errorBox: React.CSSProperties = {
  marginBottom: 12,
  padding: 12,
  borderRadius: 10,
  background: "#fee2e2",
  color: "#991b1b",
  border: "1px solid #fecaca",
};
