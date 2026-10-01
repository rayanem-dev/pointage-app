const BASE = import.meta.env.VITE_API_URL || '/api';
let token = null;
try { token = localStorage.getItem('token'); } catch { /* stockage indisponible */ }

export const setToken = (t) => {
  token = t;
  try { t ? localStorage.setItem('token', t) : localStorage.removeItem('token'); } catch { /* ignore */ }
};
export const hasToken = () => !!token;

async function request(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  if (res.status === 401 && token) { setToken(null); window.location.assign('/login'); }
  return res;
}

export async function api(path, opts) {
  const res = await request(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

// Téléchargement d'un fichier protégé (export, document).
export async function download(path, fallbackName = 'fichier') {
  const res = await request(path);
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Erreur ${res.status}`); }
  const m = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') || '');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url; a.download = m ? decodeURIComponent(m[1]) : fallbackName; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v != null)).toString();
