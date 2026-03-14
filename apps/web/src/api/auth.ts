const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export type LoginResponse = {
  ok: boolean;
  token?: string;
  user?: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    role: "ADMIN" | "MAGAZZINO" | "OPERATORE" | "CONTABILITA";
  };
  error?: string;
};

export type MeResponse = {
  ok: boolean;
  user?: {
    id: string;
    email: string;
    role: "ADMIN" | "MAGAZZINO" | "OPERATORE" | "CONTABILITA";
    firstName?: string | null;
    lastName?: string | null;
  };
  error?: string;
};

export async function loginRequest(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const data = (await res.json()) as LoginResponse;
  return data;
}

export async function meRequest(token: string): Promise<MeResponse> {
  const res = await fetch(`${API_BASE}/auth/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = (await res.json()) as MeResponse;
  return data;
}