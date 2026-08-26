const BASE = '';

export async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  // Use adminToken for admin endpoints, userToken for user endpoints
  const token = path.startsWith('/api/admin')
    ? localStorage.getItem('adminToken')
    : localStorage.getItem('userToken');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  return res.json();
}

export function fmt(n) {
  if (n == null) return '-';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
