const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

const TOKEN_KEY = "core_auth_token";

export async function authFetch(
  path: string,
  options: RequestInit = {}
) {
  const token = localStorage.getItem(TOKEN_KEY);

  const headers = new Headers(options.headers || {});
  const isFormData = options.body instanceof FormData;

  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

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
export async function authDownload(path: string, filename?: string) {
  const token = localStorage.getItem(TOKEN_KEY);

  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers,
  });

  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = "/login";
    throw new Error("Sessione scaduta");
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Errore download file");
  }

  // 👇 qui succede la magia
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "export.csv";

  document.body.appendChild(a);
  a.click();
  a.remove();

  window.URL.revokeObjectURL(url);
}
  return response;
}
