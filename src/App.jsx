import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import {
  Activity, Award, BarChart3, Check, ChevronRight, CircleHelp, Coins, Gamepad2,
  Home, ListTodo, LogOut, Menu, Plus, Shield, Sparkles, Upload, UserRound, X,
} from 'lucide-react'
import { api } from './api.js'
import { MemoryGame, ReactionGame, GuessGame } from './games.jsx'

const AuthContext = createContext(null)
const ToastContext = createContext(() => {})
const xpFor = (difficulty) => ({ Easy: 10, Medium: 20, Hard: 40 }[difficulty] || 10)
const coinFor = (difficulty) => ({ Easy: 1, Medium: 2, Hard: 4 }[difficulty] || 1)

function Toasts({ items, dismiss }) {
  return <div className="toast-stack" aria-live="polite">{items.map((toast) =>
    <div className={`toast-message ${toast.type}`} key={toast.id}>
      <span>{toast.text}</span><button aria-label="Dismiss notification" onClick={() => dismiss(toast.id)}><X size={16} /></button>
    </div>)}</div>
}

function App() {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(true)
  const [startupError, setStartupError] = useState('')
  const [toasts, setToasts] = useState([])
  const notify = useCallback((text, type = 'success') => {
    const id = crypto.randomUUID()
    setToasts((current) => [...current, { id, text, type }])
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 4000)
  }, [])

  const checkSession = useCallback(() => {
    setChecking(true)
    setStartupError('')
    api.csrf().then(() => api.me()).then(setUser).catch((error) => {
      setUser(null)
      setStartupError(error.message)
    }).finally(() => setChecking(false))
  }, [])
  useEffect(() => { checkSession() }, [checkSession])

  if (checking) return <div className="screen-center"><span className="spinner-border text-purple" role="status" /><span>Loading your adventure…</span></div>
  return <AuthContext.Provider value={{ user, setUser }}>
    <ToastContext.Provider value={notify}>
      <Routes>
        <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <Landing />} />
        <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <AuthPage mode="login" />} />
        <Route path="/register" element={user ? <Navigate to="/dashboard" replace /> : <AuthPage mode="register" />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/achievements" element={<Achievements />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/arcade" element={<Arcade />} />
          <Route path="/games/:game" element={<GamePage />} />
          <Route path="/history" element={<GameHistory />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/admin" element={<Admin />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      {startupError && <div className="api-banner" role="alert"><span>LifeXP API unavailable: {startupError}</span><button className="btn btn-quiet btn-sm" onClick={checkSession}>Retry</button></div>}
      <Toasts items={toasts} dismiss={(id) => setToasts((items) => items.filter((item) => item.id !== id))} />
    </ToastContext.Provider>
  </AuthContext.Provider>
}

function useAuth() { return useContext(AuthContext) }
function useToast() { return useContext(ToastContext) }

function Landing() {
  return <main className="landing">
    <nav className="landing-nav"><Link className="brand" to="/"><span className="brand-mark"><Sparkles size={20} /></span>LifeXP</Link><div><Link className="btn btn-quiet" to="/login">Log in</Link><Link className="btn btn-primary" to="/register">Start your quest <ChevronRight size={17} /></Link></div></nav>
    <section className="hero"><div className="hero-copy"><span className="eyebrow"><span className="live-dot" /> YOUR LIFE, LEVELLED UP</span><h1>Make progress<br />feel <span>like play.</span></h1><p>Turn the things you need to do into quests worth completing. Build momentum, earn XP, and celebrate the little wins.</p><div className="hero-actions"><Link to="/register" className="btn btn-primary btn-lg">Begin your journey <ChevronRight size={18} /></Link><Link to="/login" className="btn btn-quiet btn-lg">I have an account</Link></div><div className="hero-proof"><span className="brand-mark"><Check size={15} /></span><span>A little progress, every day.</span></div></div>
      <div className="hero-panel"><div className="panel-top"><span>YOUR ADVENTURE</span><span className="level-pill">AT YOUR PACE</span></div><div className="character-emblem"><div><Sparkles size={34} /></div></div><h3>Your next step is enough.</h3><p>Choose a quest. Build a habit. Celebrate each win.</p><div className="demo-progress"><div><span>YOUR JOURNEY</span><b>One quest at a time</b></div><div className="journey-line"><span /><span /><span /></div></div><div className="hero-stats"><div><span>MAKE A PLAN</span><b>Pick a quest</b></div><div><span>KEEP MOVING</span><b>Earn progress</b></div><div><span>CELEBRATE</span><b>Small wins</b></div></div><div className="floating-note"><span><Check size={15} /></span> Your first step is waiting.</div></div>
    </section>
    <section className="landing-features"><span className="eyebrow">SMALL WINS ADD UP</span><h2>A better way to get things done.</h2><div className="feature-grid"><Feature icon={<ListTodo />} title="Your quests, your way" text="Make a plan that fits your day. Add tasks or import your checklist in seconds." /><Feature icon={<Activity />} title="See your momentum" text="Earn XP, keep your streak alive, and watch your habits turn into progress." /><Feature icon={<Gamepad2 />} title="Play your break" text="Step away with quick games that make a well-earned break more fun." /></div></section>
    <footer className="landing-footer">LifeXP <span>Progress, one quest at a time.</span></footer>
  </main>
}

function Feature({ icon, title, text }) { return <article className="feature-card"><span>{icon}</span><h3>{title}</h3><p>{text}</p></article> }

function AuthPage({ mode }) {
  const register = mode === 'register'
  const { setUser } = useAuth()
  const notify = useToast()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  async function submit(event) {
    event.preventDefault(); setLoading(true)
    try {
      await api.csrf()
      const account = register ? await api.register(form) : await api.login({ email: form.email, password: form.password })
      setUser(account); notify(register ? 'Your adventure starts now!' : 'Welcome back!'); navigate('/dashboard')
    } catch (error) { notify(error.message, 'error') } finally { setLoading(false) }
  }
  return <main className="auth-layout"><Link to="/" className="brand auth-brand"><span className="brand-mark"><Sparkles size={20} /></span>LifeXP</Link><section className="auth-card"><div className="auth-icon"><Sparkles size={22} /></div><span className="eyebrow">{register ? 'YOUR NEXT CHAPTER' : 'GOOD TO SEE YOU'}</span><h1>{register ? 'Create your account' : 'Welcome back'}</h1><p>{register ? 'Set up your adventurer profile to get started.' : 'Log in to pick up where you left off.'}</p><form onSubmit={submit}>
    {register && <label>Display name<input className="form-control" autoComplete="name" required minLength={2} maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>}
    <label>Email address<input className="form-control" type="email" autoComplete="email" required maxLength={254} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
    <label>Password<input className="form-control" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
    {register && <small className="muted">Use at least 8 characters.</small>}
    <button className="btn btn-primary w-100 auth-submit" disabled={loading}>{loading ? 'Please wait…' : register ? 'Create account' : 'Log in'} <ChevronRight size={17} /></button>
    </form><div className="auth-switch">{register ? 'Already have an account?' : 'New to LifeXP?'} <Link to={register ? '/login' : '/register'}>{register ? 'Log in' : 'Create an account'}</Link></div></section><span className="auth-footnote">Your progress belongs to you.</span></main>
}

const navItems = [
  { to: '/dashboard', label: 'Overview', icon: Home },
  { to: '/tasks', label: 'My quests', icon: ListTodo },
  { to: '/import', label: 'Import list', icon: Upload },
  { to: '/achievements', label: 'Achievements', icon: Award },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/arcade', label: 'Arcade', icon: Gamepad2 },
]

function ProtectedLayout() {
  const { user, setUser } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const notify = useToast()
  const navigate = useNavigate()
  if (!user) return <Navigate to="/login" replace />
  async function logout() {
    try { await api.logout() } catch (error) { notify(error.message, 'error'); return }
    setUser(null); navigate('/'); notify('You have been logged out.')
  }
  return <div className="app-shell"><aside className={`sidebar ${menuOpen ? 'open' : ''}`}><Link className="brand sidebar-brand" to="/dashboard"><span className="brand-mark"><Sparkles size={19} /></span>LifeXP</Link><div className="player-mini"><span className="player-avatar">{user.name.slice(0, 1).toUpperCase()}</span><span><b>{user.name}</b><small>Level {user.level} adventurer</small></span><span className="player-level">{user.level}</span></div><span className="nav-label">YOUR SPACE</span><nav className="side-nav">{navItems.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} onClick={() => setMenuOpen(false)} className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}><Icon size={18} />{label}</NavLink>)}</nav>  {user.role === 'admin' && <><span className="nav-label">MANAGEMENT</span><NavLink className="side-link" to="/admin"><Shield size={18} />Admin</NavLink></>}<div className="sidebar-bottom"><NavLink className="side-link" to="/history"><CircleHelp size={18} />Game history</NavLink><NavLink className="side-link" to="/profile"><UserRound size={18} />My profile</NavLink><button className="side-link logout-link" onClick={logout}><LogOut size={18} />Log out</button><div className="sidebar-caption">Make today count.</div></div></aside>{menuOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <main className="main-area"><header className="topbar"><button className="mobile-menu" aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Menu size={21} /></button><div className="breadcrumb-title">LifeXP <span>/</span> <b>{navItems.find((i) => i.to === window.location.pathname)?.label || (window.location.pathname.startsWith('/games') ? 'Arcade' : 'Your space')}</b></div><div className="topbar-right"><span className="coin-chip"><Coins size={16} />{user.coins}</span><Link className="top-avatar" to="/profile" aria-label="Profile">{user.name.slice(0, 1).toUpperCase()}</Link></div></header><div className="page-content"><Outlet /></div><footer className="app-footer">LifeXP <span>Progress, one quest at a time.</span></footer></main></div>
}

function PageHeading({ eyebrow, title, text, action }) { return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{text && <p>{text}</p>}</div>{action}</div> }
function StatCard({ icon: Icon, label, value, detail, tone = '' }) { return <article className="stat-card"><span className={`stat-icon ${tone}`}><Icon size={19} /></span><div><small>{label}</small><strong>{value}</strong>{detail && <span className="stat-detail">{detail}</span>}</div></article> }
function Loading() { return <div className="loading-row"><span className="spinner-border spinner-border-sm text-purple" /> Loading your data…</div> }
function EmptyState({ title, text, action }) { return <div className="empty-state"><span className="empty-icon"><Sparkles size={22} /></span><h3>{title}</h3><p>{text}</p>{action}</div> }

function Dashboard() {
  const { user, setUser } = useAuth()
  const notify = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [newTask, setNewTask] = useState(false)
  const refresh = useCallback(() => api.dashboard().then(setData).catch((e) => notify(e.message, 'error')).finally(() => setLoading(false)), [notify])
  useEffect(() => { refresh() }, [refresh])
  async function complete(id) {
    try {
      const result = await api.completeTask(id)
      setUser((current) => ({ ...current, xp: result.xp, coins: result.coins, level: result.level }))
      notify(result.rewarded ? `Quest complete! +${result.xpAwarded} XP · +${result.coinsAwarded} coins` : 'Quest completed. Reward already claimed.')
      await refresh()
    } catch (error) { notify(error.message, 'error') }
  }
  if (loading) return <Loading />
  if (!data) return <EmptyState title="Your dashboard couldn't load" text="Check your connection and try again." action={<button className="btn btn-outline-light" onClick={() => { setLoading(true); refresh() }}>Try again</button>} />
  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  const progress = data.xp % 100
  return <><PageHeading eyebrow={date.toUpperCase()} title={`Welcome back, ${user.name.split(' ')[0]}.`} text="A little progress today goes a long way." action={<div className="dashboard-actions"><Link className="btn btn-quiet" to="/import"><Upload size={16} /> Import</Link><Link className="btn btn-quiet" to="/arcade"><Gamepad2 size={16} /> Arcade</Link><button className="btn btn-primary" onClick={() => setNewTask(true)}><Plus size={17} /> Add a quest</button></div>} />
    <section className="level-banner"><div className="level-emblem"><Sparkles size={24} /></div><div className="level-info"><div><span className="eyebrow">LEVEL {data.level} · {data.title}</span><strong>{data.xp} <small>total XP</small></strong></div><div className="level-progress"><div className="progress"><div className="progress-bar" style={{ width: `${progress}%` }} /></div><small>{progress} / 100 XP to level {data.level + 1}</small></div></div><span className="level-big">LVL <b>{data.level}</b></span></section>
    <div className="stats-grid"><StatCard icon={Check} label="Completed today" value={data.completedToday} detail={`${data.remainingToday} quests left`} tone="green" /><StatCard icon={Coins} label="Coin balance" value={data.coins} detail="Spend them in the arcade" tone="gold" /><StatCard icon={Activity} label="Current streak" value={`${data.currentStreak} days`} detail={`Best: ${data.bestStreak} days`} tone="pink" /><StatCard icon={Award} label="Lifetime XP" value={data.xp} detail={`Level ${data.level} adventurer`} tone="blue" /></div>
    <div className="dashboard-grid"><section className="panel quest-panel"><div className="section-heading"><div><span className="eyebrow">TODAY'S ADVENTURE</span><h2>Daily quests</h2></div><Link to="/tasks">All quests <ChevronRight size={15} /></Link></div><div className="daily-progress"><div><span>Daily progress</span><b>{data.completionPercent}%</b></div><div className="progress"><div className="progress-bar" style={{ width: `${data.completionPercent}%` }} /></div></div>
    {data.tasks.length ? <div className="quest-list">{data.tasks.slice(0, 6).map((task) => <TaskRow key={task.id} task={task} complete={complete} reopen={async (id) => { try { await api.reopenTask(id); notify('Quest reopened. Rewards are one-time per quest.'); await refresh() } catch (e) { notify(e.message, 'error') } }} />)}</div> : <EmptyState title="Nothing on today's list" text="Add a quest or import a checklist to get moving." action={<button className="btn btn-primary btn-sm" onClick={() => setNewTask(true)}><Plus size={15} /> Add your first quest</button>} />}
    </section><div className="dashboard-side"><section className="panel week-panel"><div className="section-heading"><div><span className="eyebrow">KEEP IT GOING</span><h2>This week</h2></div><BarChart3 size={18} className="muted-icon" /></div><div className="week-bars">{data.week.map((day) => <div className="week-day" key={day.date}><div className="week-bar-wrap"><div className="week-bar" style={{ height: `${Math.max(6, Math.min(100, day.count * 18))}%` }} title={`${day.count} completed`} /></div><span>{day.label}</span></div>)}</div><Link to="/analytics" className="subtle-link">View your analytics <ChevronRight size={14} /></Link></section><section className="panel achievements-peek"><div className="section-heading"><div><span className="eyebrow">NICE WORK</span><h2>Achievements</h2></div><Link to="/achievements">View all <ChevronRight size={14} /></Link></div>{data.recentAchievements.length ? data.recentAchievements.map((item) => <div className="mini-achievement" key={item.id}><span><Award size={17} /></span><div><b>{item.name}</b><small>{item.unlockedAt}</small></div></div>) : <p className="muted small-copy">Your first badge is just around the corner.</p>}</section></div></div>
    {newTask && <TaskModal close={() => setNewTask(false)} saved={() => { setNewTask(false); refresh(); notify('Quest added to your list.') }} />}
  </>
}

function TaskRow({ task, complete, edit, remove, reopen }) {
  const dueDate = new Date(`${task.dueDate}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const completedAt = task.completedAt ? new Date(task.completedAt.replace(' ', 'T')).toLocaleString() : ''
  return <div className={`task-row ${task.completed ? 'is-complete' : ''}`}><button className={`task-check ${task.completed ? 'checked' : ''}`} onClick={() => !task.completed && complete(task.id)} disabled={task.completed} aria-label={task.completed ? 'Completed' : `Complete ${task.title}`}>{task.completed && <Check size={15} />}</button><div className="task-main"><b>{task.title}</b><div className="task-meta"><span>{task.category}</span><i />{task.difficulty}<i /><span className="xp-tag">+{xpFor(task.difficulty)} XP</span><i /><span>Due {dueDate}</span></div>{completedAt && <small className="task-completed-date">Completed {completedAt}</small>}</div>{task.completed ? <div className="task-actions"><span className="complete-label">Done</span>{reopen && <button title="Reopen quest" onClick={() => reopen(task.id)}><span className="visually-hidden">Reopen</span>↶</button>}</div> : <div className="task-actions">{edit && <button title="Edit quest" onClick={() => edit(task)}><span className="visually-hidden">Edit</span>✎</button>}{remove && <button title="Delete quest" onClick={() => remove(task)}><span className="visually-hidden">Delete</span>×</button>}</div>}</div>
}

function TaskModal({ close, saved, task }) {
  const [form, setForm] = useState(task || { title: '', description: '', category: 'Personal', difficulty: 'Easy', dueDate: new Date().toISOString().slice(0, 10) })
  const [busy, setBusy] = useState(false)
  const notify = useToast()
  async function submit(e) {
    e.preventDefault(); setBusy(true)
    try { task ? await api.updateTask(task.id, form) : await api.createTask(form); saved() }
    catch (error) { notify(error.message, 'error') } finally { setBusy(false) }
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && close()}><section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="task-dialog-title"><div className="dialog-head"><h2 id="task-dialog-title">{task ? 'Edit quest' : 'Add a quest'}</h2><button className="icon-button" onClick={close} aria-label="Close"><X size={18} /></button></div><form onSubmit={submit}><label>Quest title<input className="form-control" required maxLength={160} autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="What do you want to get done?" /></label><label>Description <span className="muted">(optional)</span><textarea className="form-control" rows="3" maxLength={1000} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label><div className="form-row"><label>Category<select className="form-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{['Study', 'Health', 'Fitness', 'Personal', 'Work', 'Other'].map((c) => <option key={c}>{c}</option>)}</select></label><label>Difficulty<select className="form-select" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>{['Easy', 'Medium', 'Hard'].map((d) => <option key={d}>{d}</option>)}</select><small className="muted">Reward: {xpFor(form.difficulty)} XP · {coinFor(form.difficulty)} coins</small></label></div><label>Due date<input className="form-control" type="date" value={form.dueDate || ''} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></label><div className="dialog-actions"><button type="button" className="btn btn-quiet" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : task ? 'Save changes' : 'Add quest'}</button></div></form></section></div>
}

function Tasks() {
  const { setUser } = useAuth()
  const [tasks, setTasks] = useState([])
  const [filters, setFilters] = useState({ search: '', category: '', difficulty: '', status: 'all', date: '' })
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const notify = useToast()
  const load = useCallback(() => api.tasks(Object.fromEntries(Object.entries(filters).filter(([, value]) => value))).then(setTasks).catch((e) => notify(e.message, 'error')).finally(() => setLoading(false)), [filters, notify])
  useEffect(() => { setLoading(true); const timeout = window.setTimeout(load, filters.search ? 250 : 0); return () => window.clearTimeout(timeout) }, [load, filters.search])
  async function complete(id) { try { const reward = await api.completeTask(id); setUser((current) => ({ ...current, xp: reward.xp, coins: reward.coins, level: reward.level })); notify(reward.rewarded ? `+${reward.xpAwarded} XP · +${reward.coinsAwarded} coins earned!` : 'Reward already collected for this quest.'); load() } catch (e) { notify(e.message, 'error') } }
  async function remove() { try { await api.deleteTask(deleting.id); setDeleting(null); notify('Quest removed.'); load() } catch (e) { notify(e.message, 'error') } }
  return <><PageHeading eyebrow="YOUR CHECKLIST" title="My quests" text="Make a plan, then take it one quest at a time." action={<button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={17} /> Add a quest</button>} />
    <section className="panel filters-panel"><div className="filter-search"><input aria-label="Search quests" className="form-control" placeholder="Search your quests…" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /></div><select className="form-select" aria-label="Filter by status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="all">All quests</option><option value="pending">To do</option><option value="completed">Completed</option></select><select className="form-select" aria-label="Filter by category" value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}><option value="">All categories</option>{['Study', 'Health', 'Fitness', 'Personal', 'Work', 'Other'].map((c) => <option key={c}>{c}</option>)}</select><select className="form-select" aria-label="Filter by difficulty" value={filters.difficulty} onChange={(e) => setFilters({ ...filters, difficulty: e.target.value })}><option value="">All difficulties</option>{['Easy', 'Medium', 'Hard'].map((d) => <option key={d}>{d}</option>)}</select><input type="date" className="form-control filter-date" aria-label="Filter by due date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} /></section>
    <section className="panel task-board"><div className="section-heading"><div><span className="eyebrow">{tasks.length} QUEST{tasks.length === 1 ? '' : 'S'}</span><h2>Your checklist</h2></div><Link to="/import" className="btn btn-quiet btn-sm"><Upload size={15} /> Import list</Link></div>{loading ? <Loading /> : tasks.length ? tasks.map((task) => <TaskRow key={task.id} task={task} complete={complete} reopen={async (id) => { try { await api.reopenTask(id); notify('Quest reopened. Rewards are one-time per quest.'); load() } catch (e) { notify(e.message, 'error') } }} edit={setEditing} remove={setDeleting} />) : <EmptyState title="No quests found" text={filters.search || filters.category || filters.difficulty || filters.date ? 'Try adjusting your filters.' : 'Add a quest or import a checklist to get started.'} action={!filters.search && !filters.category && !filters.difficulty && !filters.date && <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}><Plus size={15} /> Add a quest</button>} />}</section>
    {(creating || editing) && <TaskModal task={editing} close={() => { setCreating(false); setEditing(null) }} saved={() => { setCreating(false); setEditing(null); load(); notify(editing ? 'Quest updated.' : 'Quest added.') }} />}
    {deleting && <div className="modal-backdrop"><section className="dialog-card confirm-card" role="alertdialog" aria-modal="true"><h2>Delete this quest?</h2><p>“{deleting.title}” will be removed from your list. Rewards already earned will stay in your history.</p><div className="dialog-actions"><button className="btn btn-quiet" onClick={() => setDeleting(null)}>Keep quest</button><button className="btn btn-danger" onClick={remove}>Delete quest</button></div></section></div>}
  </>
}

function ImportPage() {
  const [rows, setRows] = useState([])
  const [errors, setErrors] = useState([])
  const [rejectedRows, setRejectedRows] = useState(0)
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState(null)
  const [dragging, setDragging] = useState(false)
  const notify = useToast()
  function parseText(text, filename = '') {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim())
    const isCsv = filename.toLowerCase().endsWith('.csv')
    let parsed = []
    if (isCsv) {
      const splitCsv = (line) => {
        const fields = []; let field = ''; let quoted = false
        for (let i = 0; i < line.length; i++) {
          const char = line[i]
          if (char === '"' && quoted && line[i + 1] === '"') { field += '"'; i++ }
          else if (char === '"') quoted = !quoted
          else if (char === ',' && !quoted) { fields.push(field.trim()); field = '' }
          else field += char
        }
        fields.push(field.trim()); return fields
      }
      const header = splitCsv(lines[0]).map((v) => v.toLowerCase())
      const hasHeader = header.includes('title')
      const columns = hasHeader ? header : ['title', 'category', 'difficulty']
      parsed = lines.slice(hasHeader ? 1 : 0).map((line) => {
        const fields = splitCsv(line)
        return { title: fields[columns.indexOf('title')] || '', category: fields[columns.indexOf('category')] || 'Personal', difficulty: fields[columns.indexOf('difficulty')] || 'Easy' }
      })
    } else parsed = lines.map((line) => ({ title: line.trim(), category: 'Personal', difficulty: 'Easy' }))
    const invalid = parsed.map((row, i) => ({ row, index: i + 1 })).filter(({ row }) => !row.title || row.title.length > 160 || !['Study', 'Health', 'Fitness', 'Personal', 'Work', 'Other'].includes(row.category) || !['Easy', 'Medium', 'Hard'].includes(row.difficulty))
    setErrors(invalid.map(({ row, index }) => `Row ${index}: ${!row.title ? 'title is required' : row.title.length > 160 ? 'title exceeds 160 characters' : 'invalid category or difficulty'}`))
    setRejectedRows(invalid.length + Math.max(0, parsed.length - 100))
    setRows(parsed.filter((row) => row.title && row.title.length <= 160 && ['Study', 'Health', 'Fitness', 'Personal', 'Work', 'Other'].includes(row.category) && ['Easy', 'Medium', 'Hard'].includes(row.difficulty)).slice(0, 100))
    setSummary(null)
    if (parsed.length > 100) setErrors((existing) => [...existing, 'Only the first 100 rows can be imported.'])
  }
  async function readFile(file) {
    if (!file) return
    if (!/\.(txt|csv)$/i.test(file.name)) { setErrors(['Choose a .txt or .csv file.']); return }
    if (file.size > 1024 * 1024) { setErrors(['Files must be 1 MB or smaller.']); return }
    parseText(await file.text(), file.name)
  }
  function paste(value) { parseText(value) }
  function changeRow(index, key, value) { setRows((current) => current.map((row, i) => i === index ? { ...row, [key]: value } : row)) }
  async function save() {
    if (!rows.length) return
    setBusy(true)
    try { const result = await api.importTasks(rows); setSummary({ ...result, rejected: result.rejected + rejectedRows }); notify(`${result.imported} quests imported.`); setRows([]) }
    catch (e) { notify(e.message, 'error') } finally { setBusy(false) }
  }
  return <><PageHeading eyebrow="BRING YOUR LIST" title="Import a checklist" text="Turn a plain text or CSV checklist into quests. Nothing is saved until you confirm." />
    <section className="panel import-panel"><div className={`dropzone ${dragging ? 'dragging' : ''}`} onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); readFile(e.dataTransfer.files[0]) }}><span className="import-icon"><Upload size={22} /></span><h2>Drop your file here</h2><p>TXT or CSV · up to 1 MB · 100 rows maximum</p><label className="btn btn-quiet file-picker">Choose file<input type="file" accept=".txt,.csv,text/plain,text/csv" onChange={(e) => readFile(e.target.files[0])} /></label></div>
    <div className="import-or"><span>OR PASTE YOUR LIST</span></div><label className="paste-label">Checklist text<textarea className="form-control" rows="5" placeholder={'Study DBMS\nExercise for 20 minutes\nRead 10 pages'} onChange={(e) => paste(e.target.value)} /></label><p className="muted import-tip">For CSV, use column headers <code>title,category,difficulty</code>. Plain-text lines become easy personal quests.</p></section>
    {errors.length > 0 && <div className="import-errors" role="alert">{errors.map((error) => <p key={error}>{error}</p>)}</div>}
    {summary && <div className="import-summary"><Check size={18} /> Imported {summary.imported}; rejected {summary.rejected}; duplicates skipped {summary.duplicates}.</div>}
    {rows.length > 0 && <section className="panel import-preview"><div className="section-heading"><div><span className="eyebrow">REVIEW BEFORE SAVING</span><h2>{rows.length} quests detected</h2></div><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Importing…' : `Import ${rows.length} quests`}</button></div>{rows.map((row, i) => <div className="preview-row" key={i}><input className="form-control" aria-label={`Quest title ${i + 1}`} maxLength={160} value={row.title} onChange={(e) => changeRow(i, 'title', e.target.value)} /><select className="form-select" aria-label={`Category ${i + 1}`} value={row.category} onChange={(e) => changeRow(i, 'category', e.target.value)}>{['Study', 'Health', 'Fitness', 'Personal', 'Work', 'Other'].map((c) => <option key={c}>{c}</option>)}</select><select className="form-select" aria-label={`Difficulty ${i + 1}`} value={row.difficulty} onChange={(e) => changeRow(i, 'difficulty', e.target.value)}>{['Easy', 'Medium', 'Hard'].map((d) => <option key={d}>{d}</option>)}</select><button className="remove-row" aria-label={`Remove row ${i + 1}`} onClick={() => setRows((current) => current.filter((_, index) => index !== i))}><X size={16} /></button></div>)}</section>}
  </>
}

function Achievements() {
  const [items, setItems] = useState(null)
  const notify = useToast()
  useEffect(() => { api.achievements().then(setItems).catch((e) => notify(e.message, 'error')) }, [notify])
  return <><PageHeading eyebrow="YOUR MILESTONES" title="Achievements" text="Every badge is a reminder of how far you’ve come." />{!items ? <Loading /> : <><div className="achievement-summary"><span><Award size={21} /></span><b>{items.filter((a) => a.unlockedAt).length} <small>/ {items.length} unlocked</small></b><div className="progress"><div className="progress-bar" style={{ width: `${items.length ? items.filter((a) => a.unlockedAt).length / items.length * 100 : 0}%` }} /></div></div><div className="achievement-grid">{items.map((a) => <article key={a.id} className={`achievement-card ${a.unlockedAt ? 'unlocked' : ''}`}><span className="achievement-badge"><Award size={23} /></span><div><span className="eyebrow">{a.unlockedAt ? 'UNLOCKED' : 'IN PROGRESS'}</span><h2>{a.name}</h2><p>{a.description}</p>{!a.unlockedAt && <div className="achievement-progress"><div className="progress"><div className="progress-bar" style={{ width: `${a.target ? Math.min(100, a.progress / a.target * 100) : 0}%` }} /></div><small>{a.progress} / {a.target}</small></div>}{a.unlockedAt && <small className="muted">Unlocked {a.unlockedAt}</small>}</div></article>)}</div></>}</>
}

function Analytics() {
  const [data, setData] = useState(null)
  const notify = useToast()
  useEffect(() => { api.analytics().then(setData).catch((e) => notify(e.message, 'error')) }, [notify])
  return <><PageHeading eyebrow="YOUR PROGRESS" title="Analytics" text="Real progress, measured over time." />{!data ? <Loading /> : <><div className="stats-grid analytics-stats"><StatCard icon={Check} label="Today" value={data.today} detail={`${data.todayPercent}% daily completion`} tone="green" /><StatCard icon={Activity} label="This week" value={data.week} detail="quests completed" tone="blue" /><StatCard icon={Award} label="This month" value={data.month} detail="quests completed" tone="pink" /><StatCard icon={Coins} label="Current streak" value={`${data.currentStreak} days`} detail={`Best: ${data.bestStreak} days`} tone="gold" /></div><div className="analytics-grid"><section className="panel chart-panel"><div className="section-heading"><div><span className="eyebrow">LAST 30 DAYS</span><h2>Quest activity</h2></div></div>{data.daily.length ? <div className="chart-scroll"><div className="chart-bars">{data.daily.map((day) => <div className="chart-day" key={day.date}><div className="chart-bar-wrap"><span className="chart-bar" style={{ height: `${Math.max(4, day.count / Math.max(1, ...data.daily.map((d) => d.count)) * 100)}%` }} title={`${day.count} quests`} /></div><small>{day.label}</small></div>)}</div></div> : <p className="muted">Complete a quest to see your activity here.</p>}</section><section className="panel category-panel"><div className="section-heading"><div><span className="eyebrow">ALL TIME</span><h2>By category</h2></div></div>{data.categories.length ? data.categories.map((c) => <div className="category-stat" key={c.category}><div><span>{c.category}</span><b>{c.count}</b></div><div className="progress"><div className="progress-bar" style={{ width: `${c.percentage}%` }} /></div></div>) : <p className="muted">Complete quests to build your category stats.</p>}<div className="difficulty-summary"><span className="eyebrow">COMPLETED BY DIFFICULTY</span>{data.difficulties.length ? data.difficulties.map((item) => <div className="difficulty-row" key={item.difficulty}><span>{item.difficulty}</span><b>{item.count}</b></div>) : <p className="muted">No completed quests yet.</p>}</div></section></div><section className="panel chart-panel xp-chart-panel"><div className="section-heading"><div><span className="eyebrow">LAST 30 DAYS</span><h2>XP earned</h2></div><span className="xp-tag">{data.xpEarned} total XP</span></div>{data.dailyXp.length ? <div className="chart-scroll"><div className="chart-bars">{data.dailyXp.map((day) => <div className="chart-day" key={day.date}><div className="chart-bar-wrap"><span className="chart-bar xp-chart-bar" style={{ height: `${Math.max(4, day.xp / Math.max(1, ...data.dailyXp.map((d) => d.xp)) * 100)}%` }} title={`${day.xp} XP`} /></div><small>{day.label}</small></div>)}</div></div> : <p className="muted">Earn XP from quests to see your progress over time.</p>}</section><p className="analytics-footnote">Charts reflect completed quests saved to your account. Most productive day: <b>{data.mostProductiveDay || 'Not enough data yet'}</b></p></>}</>
}

function Arcade() {
  const games = [
    { key: 'memory', name: 'Memory match', icon: Sparkles, description: 'Find every pair. How few moves can you make?', tag: 'FOCUS' },
    { key: 'reaction', name: 'Reaction time', icon: Activity, description: 'Wait for the signal, then tap as fast as you can.', tag: 'SPEED' },
    { key: 'guess', name: 'Number guess', icon: CircleHelp, description: 'Find the secret number with higher-or-lower hints.', tag: 'LOGIC' },
  ]
  return <><PageHeading eyebrow="TAKE A BREATHER" title="The arcade" text="A few quick games. Just for fun—no quests required." action={<Link to="/history" className="btn btn-quiet"><Activity size={16} /> Game history</Link>} /><div className="game-grid">{games.map(({ key, name, icon: Icon, description, tag }) => <article key={key} className="game-card"><div className={`game-cover ${key}`}><span><Icon size={30} /></span><small>{tag}</small></div><div className="game-card-copy"><h2>{name}</h2><p>{description}</p><Link to={`/games/${key}`} className="btn btn-primary w-100">Play now <ChevronRight size={16} /></Link></div></article>)}</div></>
}

function GamePage() {
  const navigate = useNavigate()
  const notify = useToast()
  const [saved, setSaved] = useState(false)
  const { game } = useParams()
  const config = {
    memory: { title: 'Memory match', Component: MemoryGame },
    reaction: { title: 'Reaction time', Component: ReactionGame },
    guess: { title: 'Number guess', Component: GuessGame },
  }[game]
  if (!config) return <Navigate to="/arcade" replace />
  const Game = config.Component
  async function save(result) {
    try { await api.saveScore({ game, ...result }); setSaved(true); notify('Your result was added to game history.') }
    catch (e) { notify(e.message, 'error') }
  }
  return <><PageHeading eyebrow="ARCADE" title={config.title} text="Play a round, enjoy the break, and keep your streak going." action={<button className="btn btn-quiet" onClick={() => navigate('/arcade')}>← Back to arcade</button>} /><section className="panel game-play-panel"><Game onFinish={save} /><p className="muted game-result-note">{saved ? 'Result saved to your game history.' : 'Results are saved to your history. Games do not award XP or coins.'}</p></section></>
}

function GameHistory() {
  const [history, setHistory] = useState(null)
  const notify = useToast()
  useEffect(() => { api.gameHistory().then(setHistory).catch((e) => notify(e.message, 'error')) }, [notify])
  return <><PageHeading eyebrow="YOUR ARCADE" title="Game history" text="Your recent practice rounds, all in one place." action={<Link to="/arcade" className="btn btn-primary"><Gamepad2 size={16} /> Play a game</Link>} /><section className="panel task-board">{history === null ? <Loading /> : history.length ? history.map((item) => <div className="history-row" key={item.id}><span className="history-icon"><Gamepad2 size={17} /></span><div><b>{item.label}</b><small>{new Date(item.createdAt).toLocaleString()}</small></div>{item.best && <span className="best-score">BEST</span>}<strong>{item.result}</strong></div>) : <EmptyState title="No games played yet" text="Your scores will show up here after your first game." action={<Link to="/arcade" className="btn btn-primary btn-sm">Visit the arcade</Link>} />}</section></>
}

function Profile() {
  const { user, setUser } = useAuth()
  const [details, setDetails] = useState(null)
  const [shop, setShop] = useState(null)
  const [buying, setBuying] = useState('')
  const notify = useToast()
  useEffect(() => {
    api.profile().then(setDetails).catch((e) => notify(e.message, 'error'))
    api.rewards().then(setShop).catch((e) => notify(e.message, 'error'))
  }, [notify])
  async function logout() { try { await api.logout(); setUser(null) } catch (e) { notify(e.message, 'error') } }
  async function buy(item) {
    setBuying(item.key)
    try {
      const result = await api.buyReward(item.key)
      setUser((current) => ({ ...current, coins: result.coins }))
      setShop(await api.rewards())
      notify(`${item.name} added to your collection.`)
    } catch (e) { notify(e.message, 'error') } finally { setBuying('') }
  }
  return <><PageHeading eyebrow="YOUR ADVENTURER" title="My profile" text="Your account and everything you’ve earned." /><section className="panel profile-panel"><div className="profile-avatar">{user.name.slice(0, 1).toUpperCase()}</div><div className="profile-main"><span className="eyebrow">LEVEL {user.level} ADVENTURER</span><h2>{user.name}</h2><p>{user.email}</p>{shop?.items.some((item) => item.owned) && <div className="profile-titles">{shop.items.filter((item) => item.owned).map((item) => <span key={item.key}>{item.name}</span>)}</div>}</div><div className="profile-stats"><div><small>TOTAL XP</small><b>{user.xp}</b></div><div><small>COINS</small><b>{user.coins}</b></div><div><small>LEVEL</small><b>{user.level}</b></div></div><div className="profile-detail"><span>Member since</span><b>{details ? details.createdAt : 'Loading…'}</b></div><div className="profile-detail"><span>Current streak</span><b>{details ? `${details.currentStreak} days` : 'Loading…'}</b></div><button className="btn btn-quiet profile-logout" onClick={logout}><LogOut size={16} /> Log out</button></section><section className="panel shop-panel"><div className="section-heading"><div><span className="eyebrow">COIN SHOP</span><h2>Cosmetic titles</h2></div><span className="coin-chip"><Coins size={15} /> {user.coins}</span></div><p className="shop-intro">Spend coins you earned from quests on profile titles. Purchases are one-time and do not affect XP or levels.</p>{!shop ? <Loading /> : <div className="shop-grid">{shop.items.map((item) => <article className="shop-item" key={item.key}><span className="shop-sparkle"><Sparkles size={18} /></span><h3>{item.name}</h3><p>{item.description}</p><button className={`btn ${item.owned ? 'btn-quiet' : 'btn-primary'} w-100`} disabled={item.owned || buying === item.key || user.coins < item.cost} onClick={() => buy(item)}>{item.owned ? <><Check size={15} /> Owned</> : <><Coins size={15} /> {buying === item.key ? 'Purchasing…' : `Buy · ${item.cost}`}</>}</button></article>)}</div>}</section></>
}

function Admin() {
  const [data, setData] = useState(null)
  const notify = useToast()
  const load = useCallback(() => api.admin().then(setData).catch((e) => notify(e.message, 'error')), [notify])
  useEffect(() => { load() }, [load])
  async function toggle(user) {
    try { await api.setUserStatus(user.id, !user.active); notify(`Account ${user.active ? 'disabled' : 'reactivated'}.`); load() }
    catch (e) { notify(e.message, 'error') }
  }
  return <><PageHeading eyebrow="SYSTEM OVERVIEW" title="Admin dashboard" text="High-level activity and account management." />{!data ? <Loading /> : <><div className="stats-grid"><StatCard icon={UserRound} label="Registered users" value={data.stats.users} detail="accounts" tone="blue" /><StatCard icon={Check} label="Completed quests" value={data.stats.completed} detail="all time" tone="green" /><StatCard icon={Activity} label="Active today" value={data.stats.activeToday} detail="users" tone="pink" /><StatCard icon={Activity} label="Active this week" value={data.stats.activeThisWeek} detail="users" tone="pink" /><StatCard icon={Award} label="Badges unlocked" value={data.stats.achievements} detail="all accounts" tone="gold" /><StatCard icon={Gamepad2} label="Game rounds" value={data.stats.games} detail="all time" tone="blue" /></div><section className="panel admin-users"><div className="section-heading"><div><span className="eyebrow">ACCOUNT MANAGEMENT</span><h2>Users</h2></div></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Account</th><th>Joined</th><th>Level</th><th>Status</th><th /></tr></thead><tbody>{data.users.map((u) => <tr key={u.id}><td><b>{u.name}</b><small>{u.email}</small></td><td>{u.createdAt}</td><td>{u.level}</td><td><span className={`status-pill ${u.active ? 'active' : 'disabled'}`}>{u.active ? 'Active' : 'Disabled'}</span></td><td><button className="btn btn-quiet btn-sm" disabled={u.role === 'admin'} onClick={() => toggle(u)}>{u.active ? 'Disable' : 'Reactivate'}</button></td></tr>)}</tbody></table></div></section></>}</>
}

function NotFound() { return <main className="screen-center not-found"><span className="brand-mark"><Sparkles size={20} /></span><h1>Page not found</h1><p>This quest seems to have wandered off.</p><Link to="/dashboard" className="btn btn-primary">Back to your dashboard</Link></main> }

export default App
