const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'
let csrfToken = ''

async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const headers = { Accept: 'application/json', ...options.headers }
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json'
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) headers['X-CSRF-Token'] = csrfToken

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    method,
    headers,
    credentials: 'include',
  })
  let payload
  try {
    payload = await response.json()
  } catch {
    throw new Error('The server returned an invalid response.')
  }
  if (!response.ok) throw new Error(payload.error || payload.data?.error || `Request failed (${response.status})`)
  if (!payload || !Object.prototype.hasOwnProperty.call(payload, 'data')) {
    throw new Error('The server response is missing its data payload.')
  }
  if (payload.csrfToken) csrfToken = payload.csrfToken
  return payload.data
}

export const api = {
  request,
  csrf: () => request('/auth/csrf'),
  me: () => request('/auth/me'),
  register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  dashboard: () => request('/dashboard'),
  tasks: (filters = {}) => request(`/tasks?${new URLSearchParams(filters)}`),
  createTask: (task) => request('/tasks', { method: 'POST', body: JSON.stringify(task) }),
  updateTask: (id, task) => request(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(task) }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),
  completeTask: (id) => request(`/tasks/${id}/complete`, { method: 'POST' }),
  reopenTask: (id) => request(`/tasks/${id}/reopen`, { method: 'POST' }),
  importTasks: (tasks) => request('/import', { method: 'POST', body: JSON.stringify({ tasks }) }),
  achievements: () => request('/achievements'),
  analytics: () => request('/analytics'),
  profile: () => request('/profile'),
  rewards: () => request('/rewards'),
  buyReward: (item) => request('/rewards/purchase', { method: 'POST', body: JSON.stringify({ item }) }),
  saveScore: (score) => request('/games/scores', { method: 'POST', body: JSON.stringify(score) }),
  gameHistory: () => request('/games/scores'),
  admin: () => request('/admin'),
  setUserStatus: (id, active) => request(`/admin/users/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ active }),
  }),
}
