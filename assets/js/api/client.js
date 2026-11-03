const API_BASE = (window.APP_CONFIG?.apiBaseUrl || 'http://localhost:8080').replace(/\/$/, '');

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && options.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Accept', 'application/json, application/problem+json, */*');
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (error) {
    throw new Error(`Cannot reach the API at ${API_BASE}. Check that the Java service is running and CORS allows this UI origin.`);
  }
  const text = response.status === 204 ? '' : await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); }
    catch { body = text; }
  }
  if (!response.ok) {
    const message = body?.detail || body?.message || body?.title || (typeof body === 'string' ? body : 'Request failed');
    const error = new Error(message);
    error.status = response.status;
    error.problem = body;
    throw error;
  }
  return body;
}

async function download(path) {
  const response = await fetch(`${API_BASE}${path}`, { headers: { Accept: 'application/octet-stream, application/pdf, image/*' } });
  if (!response.ok) throw new Error(`Download failed (${response.status}).`);
  return { blob: await response.blob(), filename: response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/)?.[1] };
}

const json = (method, value) => ({ method, body: JSON.stringify(value) });
const query = values => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value !== '' && value != null && value !== 'all') params.set(key, value); });
  const result = params.toString();
  return result ? `?${result}` : '';
};
const enc = value => encodeURIComponent(value);

export const api = {
  bootstrap: () => request('/ui/bootstrap'),
  settings: () => request('/settings'),
  updateSettings: value => request('/settings', json('PUT', value)),
  rooms: {
    list: filters => request(`/rooms${query(filters || {})}`),
    get: id => request(`/rooms/${enc(id)}`),
    getByName: name => request(`/rooms/name/${enc(name)}`),
    create: value => request('/rooms', json('POST', value)),
    update: (id, value) => request(`/rooms/${enc(id)}`, json('PUT', value))
  },
  people: {
    list: filters => request(`/people${query(filters || {})}`),
    get: id => request(`/people/${enc(id)}`),
    findByName: name => request(`/people/name/${enc(name)}`),
    create: value => request('/people', json('POST', value)),
    update: (id, value) => request(`/people/${enc(id)}`, json('PUT', value)),
    moveIn: (id, value) => request(`/people/${enc(id)}/move-in`, json('POST', value)),
    shift: (id, value) => request(`/people/${enc(id)}/shift`, json('POST', value)),
    moveOut: (id, value) => request(`/people/${enc(id)}/move-out`, json('POST', value)),
    notice: (id, value) => request(`/people/${enc(id)}/notice`, json('POST', value)),
    pay: (id, value) => request(`/people/${enc(id)}/payments`, json('POST', value)),
    leaving: () => request('/people/leaving'),
    uploadIdentity: (id, file) => {
      const form = new FormData(); form.append('file', file);
      return request(`/people/${enc(id)}/identity`, { method: 'POST', body: form });
    },
    downloadIdentity: id => download(`/people/${enc(id)}/identity`),
    uploadPaymentScreenshot: (id, paymentId, file) => {
      const form = new FormData(); form.append('file', file);
      return request(`/people/${enc(id)}/payments/${enc(paymentId)}/screenshot`, { method: 'POST', body: form });
    },
    downloadPaymentScreenshot: (id, paymentId) => download(`/people/${enc(id)}/payments/${enc(paymentId)}/screenshot`)
  },
  rent: {
    list: filters => request(`/rent${query(filters || {})}`),
    revenue: month => request(`/revenue${query({ month })}`)
  }
};

export { API_BASE };
