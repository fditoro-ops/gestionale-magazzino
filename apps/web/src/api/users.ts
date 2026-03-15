import { authFetch } from "./authFetch";

export type UserRow = {
  id: string;
  email: string;
  first_name: string;
  last_name?: string | null;
  role: "ADMIN" | "MAGAZZINO" | "OPERATORE" | "CONTABILITA";
  is_active: boolean;
  created_at: string;
};

export async function loadUsersRequest(): Promise<UserRow[]> {
  const res = await authFetch("/users");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function createUserRequest(payload: {
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
  role: "ADMIN" | "MAGAZZINO" | "OPERATORE" | "CONTABILITA";
}) {
  const res = await authFetch("/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error || "Errore creazione utente");
  }

  return data;
}

export async function toggleUserActiveRequest(id: string) {
  const res = await authFetch(`/users/${id}/toggle-active`, {
    method: "PATCH",
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error || "Errore aggiornamento utente");
  }

  return data;
}
