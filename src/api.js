async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || `请求失败（${response.status}）`);
  }
  return payload;
}

export const api = {
  getServices: () => request('/api/services'),
  getMeta: () => request('/api/meta'),
  createService: (service) =>
    request('/api/services', { method: 'POST', body: JSON.stringify(service) }),
  updateService: (id, service) =>
    request(`/api/services/${id}`, { method: 'PUT', body: JSON.stringify(service) }),
  deleteService: (id) => request(`/api/services/${id}`, { method: 'DELETE' }),
  startService: (id) => request(`/api/services/${id}/start`, { method: 'POST' }),
  stopService: (id) => request(`/api/services/${id}/stop`, { method: 'POST' }),
  getLogs: (id) => request(`/api/services/${id}/logs`),
  discover: () => request('/api/discover', { method: 'POST', body: '{}' }),
  updateSettings: (settings) =>
    request('/api/settings', { method: 'PUT', body: JSON.stringify(settings) }),
};
