const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

const TOKEN_KEY = "core_auth_token";

export async function authFetch(
  path: string,
  options: RequestInit = {}
) {
  const token = localStorage.getItem(TOKEN_KEY);

  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = "/login";
    throw new Error("Sessione scaduta");
  }

  return response;
}
