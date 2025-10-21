export const API = import.meta.env.VITE_API || "http://localhost:3001";

// 🔐 Ortak kimlik doğrulama başlığı (token varsa ekler)
export function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// 🔧 Yardımcı fetch (otomatik token ekler, hata durumunda logout)
export async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}), ...authHeaders() };
  const res = await fetch(`${API}${path}`, { ...options, headers });

  // Token süresi dolmuşsa veya yanlışsa kullanıcıyı çıkışa yönlendir
  if (res.status === 401) {
    localStorage.removeItem("token");
    window.location.reload();
  }
  return res;
}