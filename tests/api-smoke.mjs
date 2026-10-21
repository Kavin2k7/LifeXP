import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const base = (process.env.LIFEXP_API_URL || 'http://localhost:8000/api').replace(/\/$/, '')

class ApiClient {
  cookie = ''
  csrfToken = ''

  async request(path, { method = 'GET', body, expected = 200 } = {}) {
    const headers = { Accept: 'application/json' }
    if (this.cookie) headers.Cookie = this.cookie
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      headers['X-CSRF-Token'] = this.csrfToken
    }
    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const cookies = response.headers.getSetCookie?.() || [response.headers.get('set-cookie')].filter(Boolean)
    if (cookies.length) this.cookie = cookies.map((value) => value.split(';', 1)[0]).join('; ')
    const payload = await response.json().catch(() => ({}))
    if (payload.csrfToken) this.csrfToken = payload.csrfToken
    assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(payload)}`)
    return payload.data
  }

  csrf() { return this.request('/auth/csrf') }
}

const first = new ApiClient()
const anonymous = new ApiClient()
const second = new ApiClient()
const email = `lifexp-test-${randomUUID()}@example.test`
const secondEmail = `lifexp-test-${randomUUID()}@example.test`
const password = `Test-${randomUUID()}-Password`

await first.csrf()
await anonymous.request('/tasks', { expected: 401 })
const account = await first.request('/auth/register', {
  method: 'POST', expected: 201, body: { name: 'Smoke Test', email, password },
})
assert.equal(account.email, email)
await first.request('/auth/register', {
  method: 'POST', expected: 409, body: { name: 'Duplicate', email, password },
})
await first.request('/auth/logout', { method: 'POST' })
await first.csrf()
await first.request('/auth/login', { method: 'POST', body: { email, password } })

const invalidLogin = new ApiClient()
await invalidLogin.csrf()
await invalidLogin.request('/auth/login', {
  method: 'POST', expected: 401, body: { email, password: 'definitely-wrong' },
})

const task = await first.request('/tasks', {
  method: 'POST', expected: 201,
  body: { title: 'Smoke test quest', category: 'Study', difficulty: 'Easy', dueDate: new Date().toISOString().slice(0, 10) },
})
assert.ok(task.id)
const invalidTask = await first.request('/tasks', {
  method: 'POST', expected: 422,
  body: { title: '', category: 'Study', difficulty: 'Easy' },
})
assert.match(invalidTask.error, /title/i)

await first.request(`/tasks/${task.id}`, {
  method: 'PUT',
  body: { title: 'Updated smoke test quest', category: 'Study', difficulty: 'Easy', dueDate: new Date().toISOString().slice(0, 10) },
})

await second.csrf()
await second.request('/auth/register', {
  method: 'POST', expected: 201, body: { name: 'Other User', email: secondEmail, password },
})
const otherTasks = await second.request('/tasks')
assert.equal(otherTasks.some((item) => item.id === task.id), false, 'A user must not see another account’s tasks')
await second.request(`/tasks/${task.id}`, {
  method: 'PUT', expected: 404,
  body: { title: 'Attempt to edit another user task', category: 'Study', difficulty: 'Easy', dueDate: new Date().toISOString().slice(0, 10) },
})
await second.request(`/tasks/${task.id}/complete`, { method: 'POST', expected: 404 })

const reward = await first.request(`/tasks/${task.id}/complete`, { method: 'POST' })
assert.deepEqual([reward.rewarded, reward.xpAwarded, reward.coinsAwarded], [true, 10, 1])
const duplicateReward = await first.request(`/tasks/${task.id}/complete`, { method: 'POST' })
assert.deepEqual([duplicateReward.rewarded, duplicateReward.xpAwarded, duplicateReward.coinsAwarded], [false, 0, 0])
await first.request(`/tasks/${task.id}/reopen`, { method: 'POST' })
const rewardAfterReopen = await first.request(`/tasks/${task.id}/complete`, { method: 'POST' })
assert.deepEqual([rewardAfterReopen.rewarded, rewardAfterReopen.xpAwarded, rewardAfterReopen.coinsAwarded], [false, 0, 0])
assert.equal((await first.request('/dashboard')).xp, 10)
for (let index = 0; index < 11; index++) {
  const extra = await first.request('/tasks', {
    method: 'POST', expected: 201,
    body: { title: `Level test ${index}`, category: 'Other', difficulty: 'Hard', dueDate: new Date().toISOString().slice(0, 10) },
  })
  const levelReward = await first.request(`/tasks/${extra.id}/complete`, { method: 'POST' })
  assert.equal(levelReward.rewarded, true)
}
const levelDashboard = await first.request('/dashboard')
assert.deepEqual([levelDashboard.xp, levelDashboard.level], [450, 5])

const imported = await first.request('/import', {
  method: 'POST', expected: 201,
  body: { tasks: [
    { title: 'Imported smoke quest', category: 'Fitness', difficulty: 'Medium' },
    { title: '', category: 'Study', difficulty: 'Easy' },
  ] },
})
assert.deepEqual([imported.imported, imported.rejected, imported.duplicates], [1, 1, 0])
const duplicateImport = await first.request('/import', {
  method: 'POST', expected: 201,
  body: { tasks: [{ title: 'Imported smoke quest', category: 'Fitness', difficulty: 'Medium' }] },
})
assert.equal(duplicateImport.duplicates, 1)
assert.ok((await first.request('/achievements')).some((item) => item.id === 'first-quest' && item.unlockedAt))
assert.ok((await first.request('/achievements')).some((item) => item.id === 'level-up' && item.unlockedAt))
assert.equal((await first.request('/analytics')).xpEarned, 450)

await first.request('/games/scores', {
  method: 'POST', expected: 201, body: { game: 'reaction', milliseconds: 240 },
})
await first.request('/games/scores', {
  method: 'POST', expected: 422, body: { game: 'reaction', milliseconds: -1 },
})
assert.equal((await first.request('/games/scores')).length, 1)
const purchase = await first.request('/rewards/purchase', { method: 'POST', body: { item: 'starlight' } })
assert.equal(purchase.coins, 20)
await first.request('/rewards/purchase', { method: 'POST', expected: 409, body: { item: 'starlight' } })
await first.request('/rewards/purchase', { method: 'POST', expected: 422, body: { item: 'trailblazer' } })
assert.equal((await first.request('/rewards')).items.find((item) => item.key === 'starlight').owned, true)
await first.request('/admin', { expected: 403 })

const disposable = await first.request('/tasks', {
  method: 'POST', expected: 201,
  body: { title: 'Delete me', category: 'Other', difficulty: 'Easy', dueDate: new Date().toISOString().slice(0, 10) },
})
await first.request(`/tasks/${disposable.id}`, { method: 'DELETE' })
assert.equal((await first.request('/tasks')).some((item) => item.id === disposable.id), false)
await first.request('/auth/logout', { method: 'POST' })
await first.request('/tasks', { expected: 401 })

console.log('LifeXP API smoke checks passed. Test accounts remain in the database; run against a disposable database.')
