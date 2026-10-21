import { useCallback, useEffect, useRef, useState } from 'react'
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google'
import './App.css'
import { unlockAudio, isMuted, setMuted, playAppear, playPossessed, playFree, playBell, playStays } from './sound.js'
import { drawShareCard } from './shareCard.js'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const CALENDAR_ID = import.meta.env.VITE_GHOSTED_CALENDAR_ID || 'primary'
const SCOPE = 'https://www.googleapis.com/auth/calendar.events'
const API = 'https://www.googleapis.com/calendar/v3'
const STORE = 'ghosted-day-v2'
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6) // 6 AM – 11 PM

const SAMPLE = [
  ['08:00', 'Go to the gym'],
  ['09:00', 'Study for exam'],
  ['11:00', 'Apply for 3 jobs'],
  ['13:00', 'Call mom'],
  ['15:00', 'Work on side project'],
  ['18:00', 'Do the laundry'],
  ['21:00', 'Read 20 pages'],
]

/* ---------- helpers ---------- */
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
const pad = (n) => String(n).padStart(2, '0')
const todayKey = () => new Date().toLocaleDateString('en-CA')
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const fromMin = (m) => { const c = Math.max(0, Math.min(23 * 60 + 59, m)); return `${pad(Math.floor(c / 60))}:${pad(c % 60)}` }
const fmt = (t) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}` }
const fmtHour = (h) => `${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}`
const toDate = (t) => { const [h, m] = t.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d }
const hhmm = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const sameDay = (iso) => new Date(iso).toLocaleDateString('en-CA') === todayKey()

// Sample day is built around "now": one task just passed, the rest still ahead.
function sampleTimes() {
  const d = new Date()
  const base = Math.floor((d.getHours() * 60 + d.getMinutes()) / 60) * 60
  const offsets = [-60, 60, 120, 240, 360, 480, 540]
  const used = new Set()
  const out = []
  offsets.forEach((off, i) => {
    let m = Math.max(6 * 60, Math.min(base + off, 23 * 60))
    while (used.has(m)) m += 30
    if (m > 23 * 60 + 30) return
    used.add(m)
    out.push([fromMin(m), SAMPLE[i][1]])
  })
  return out
}

function freshDay() {
  return {
    date: todayKey(),
    tasks: sampleTimes().map(([time, title]) => ({ id: uid(), title, time, done: false, sample: true })),
    skip: 0,
    ghosts: [],
    freed: 0,
    everHaunted: false,
  }
}
function loadDay() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE))
    if (d && d.date === todayKey() && Array.isArray(d.tasks)) {
      const sampleTitles = new Set(SAMPLE.map(([, t]) => t))
      return {
        ...d,
        tasks: d.tasks.map((t) => (!t.fromCal && sampleTitles.has(t.title) ? { ...t, sample: true } : t)),
        ghosts: (d.ghosts || []).filter((g) => !g.leaving),
      }
    }
  } catch { /* storage unavailable */ }
  return freshDay()
}
function eventBody(summary, time, extra = {}) {
  const start = toDate(time)
  return {
    summary,
    start: { dateTime: start.toISOString() },
    end: { dateTime: new Date(start.getTime() + 60 * 60000).toISOString() },
    ...extra,
  }
}

function GhostIcon({ size = 40, angry = false }) {
  const eye = angry ? 2.2 : 4
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 40 46" aria-hidden="true" className="ghost-svg">
      <path d="M20 2C9.5 2 3 9.8 3 20V44L8.5 39.5L14 44L20 39.5L26 44L31.5 39.5L37 44V20C37 9.8 30.5 2 20 2Z" fill="currentColor" />
      <ellipse cx="14" cy="19" rx="3" ry={eye} fill={angry ? '#ff4d6d' : '#1a1024'} />
      <ellipse cx="26" cy="19" rx="3" ry={eye} fill={angry ? '#ff4d6d' : '#1a1024'} />
      <ellipse cx="20" cy="29.5" rx="3.5" ry={angry ? 1.6 : 4.5} fill="#1a1024" />
    </svg>
  )
}

/* ---------- app ---------- */
function Ghosted() {
  const [day, setDay] = useState(loadDay)
  const dayRef = useRef(day)
  const commit = useCallback((next) => { dayRef.current = next; setDay(next) }, [])
  const update = useCallback((fn) => commit(fn(dayRef.current)), [commit])
  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(day)) } catch { /* ignore */ } }, [day])

  const [apparition, setApparition] = useState(null)
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)
  const [dragId, setDragId] = useState(null)
  const [overHour, setOverHour] = useState(null)
  const [newTitle, setNewTitle] = useState('')
  const [newTime, setNewTime] = useState(() => `${pad(Math.max(6, Math.min(new Date().getHours() + 1, 23)))}:00`)
  const [token, setToken] = useState('')
  const tokenRef = useRef('')
  const pending = useRef(new Set())
  const [gStatus, setGStatus] = useState('')

  /* ---------- sound ---------- */
  const [muted, setMutedState] = useState(isMuted)
  useEffect(() => {
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock) }
  }, [])
  function toggleMute() { const v = !muted; setMuted(v); setMutedState(v); if (!v) { unlockAudio(); setTimeout(playAppear, 50) } }

  /* ---------- the ghost clock ---------- */
  const [, setTick] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => {
      if (dayRef.current.date !== todayKey()) {
        commit(freshDay())
        flash('Midnight. Every ghost has vanished. A new day begins.')
      }
      setTick((t) => t + 1)
    }, 15000)
    return () => clearInterval(iv)
  }, [commit])
  function clockMin() {
    const d = new Date()
    return Math.min(d.getHours() * 60 + d.getMinutes() + (dayRef.current.skip || 0), 23 * 60 + 59)
  }
  function skipAhead() {
    const before = clockMin()
    if (before >= 23 * 60) { flash('It is almost midnight. Count your ghosts.'); return }
    update((d) => ({ ...d, skip: (d.skip || 0) + 60, everHaunted: true }))
    flash(`⏩ The ghost clock jumps to ${fmt(fromMin(Math.min(before + 60, 23 * 60 + 59)))}.`)
  }
  const [ready, setReady] = useState(false)
  useEffect(() => { const t = setTimeout(() => setReady(true), 1200); return () => clearTimeout(t) }, [])

  function flash(text) {
    setToast(text)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 3200)
  }

  useEffect(() => {
    if (!apparition) return
    const t = setTimeout(() => setApparition(null), 2800)
    return () => clearTimeout(t)
  }, [apparition])

  /* ---------- Google Calendar (optional) ---------- */
  async function g(path, opts = {}) {
    const t = tokenRef.current
    if (!t) return null
    const res = await fetch(`${API}/calendars/${encodeURIComponent(CALENDAR_ID)}${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${t}`, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    })
    if (res.status === 401) {
      tokenRef.current = ''
      setToken('')
      throw new Error('Google session expired. Connect again.')
    }
    if (!res.ok) {
      let msg = ''
      try { msg = (await res.json()).error?.message } catch { /* ignore */ }
      throw new Error(msg || `Google Calendar error ${res.status}`)
    }
    return res.status === 204 ? null : res.json()
  }

  async function remoteDelete(eventId) {
    if (!eventId || !tokenRef.current) return
    try { await g(`/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' }) } catch (e) {
      if (!/deleted|410|404/i.test(e.message)) setGStatus(e.message)
    }
  }

  async function remoteCreateGhost(ghost) {
    if (!tokenRef.current) return
    try {
      const ev = await g('/events', {
        method: 'POST',
        body: JSON.stringify(eventBody(`👻 "${ghost.title}" was supposed to be here`, ghost.time, {
          description: 'Left behind by Ghosted. Finish the task, or move it back to this time, to set this ghost free.',
          transparency: 'transparent',
          colorId: '8',
          extendedProperties: { private: { ghosted: 'true', taskId: ghost.taskId } },
        })),
      })
      const still = dayRef.current.ghosts.find((x) => x.id === ghost.id)
      if (!still || still.leaving) { await remoteDelete(ev.id); return }
      update((d) => ({ ...d, ghosts: d.ghosts.map((x) => (x.id === ghost.id ? { ...x, gcalId: ev.id } : x)) }))
    } catch (e) { setGStatus(e.message) }
  }

  async function remoteCreateTask(task) {
    if (!tokenRef.current || task.gcalId) return
    try {
      const ev = await g('/events', {
        method: 'POST',
        body: JSON.stringify(eventBody(task.done ? `✓ ${task.title}` : task.title, task.time, {
          description: 'Added by Ghosted. Move me and I will leave a ghost behind.',
          extendedProperties: { private: { ghostedTask: task.id } },
        })),
      })
      const still = dayRef.current.tasks.find((x) => x.id === task.id)
      if (!still) { await remoteDelete(ev.id); return }
      update((d) => ({ ...d, tasks: d.tasks.map((x) => (x.id === task.id ? { ...x, gcalId: ev.id } : x)) }))
    } catch (e) { setGStatus(e.message) }
  }

  async function remotePatchTask(task, fields) {
    if (!task.gcalId || !tokenRef.current) return
    pending.current.add(task.id)
    try {
      await g(`/events/${encodeURIComponent(task.gcalId)}`, { method: 'PATCH', body: JSON.stringify(fields) })
    } catch (e) { setGStatus(e.message) } finally { pending.current.delete(task.id) }
  }

  // Pull today's real calendar events into the day. They become haunt-able.
  function importEvents(items) {
    const d = dayRef.current
    const linked = new Set(d.tasks.map((t) => t.gcalId).filter(Boolean))
    const fresh = items.filter((ev) =>
      ev.status !== 'cancelled' && ev.start?.dateTime && sameDay(ev.start.dateTime) &&
      !linked.has(ev.id) &&
      !ev.extendedProperties?.private?.ghosted &&
      !ev.extendedProperties?.private?.ghostedTask)
    if (!fresh.length) return 0
    const added = fresh.map((ev) => {
      const title = (ev.summary || '(untitled)').replace(/^✓\s*/, '')
      return { id: uid(), title, time: hhmm(ev.start.dateTime), done: /^✓/.test(ev.summary || ''), gcalId: ev.id, fromCal: true }
    })
    // Your real day replaces the sample day (and the sample events are removed from your calendar).
    const samples = d.tasks.filter((t) => t.sample)
    const sampleIds = new Set(samples.map((t) => t.id))
    samples.forEach((t) => remoteDelete(t.gcalId))
    d.ghosts.filter((gh) => sampleIds.has(gh.taskId)).forEach((gh) => remoteDelete(gh.gcalId))
    commit({
      ...d,
      tasks: [...d.tasks.filter((t) => !t.sample), ...added],
      ghosts: d.ghosts.filter((gh) => !sampleIds.has(gh.taskId)),
    })
    return added.length
  }

  async function listToday() {
    const s = new Date(); s.setHours(0, 0, 0, 0)
    const e = new Date(); e.setHours(23, 59, 59, 999)
    const q = new URLSearchParams({ timeMin: s.toISOString(), timeMax: e.toISOString(), singleEvents: 'true', maxResults: '250' })
    const data = await g(`/events?${q}`)
    return data?.items || []
  }

  async function pushAll() {
    for (const t of dayRef.current.tasks) if (!t.sample) await remoteCreateTask(t)
    for (const gh of dayRef.current.ghosts) if (!gh.gcalId && !gh.leaving) await remoteCreateGhost(gh)
  }

  const login = useGoogleLogin({
    scope: SCOPE,
    onSuccess: async (r) => {
      tokenRef.current = r.access_token
      setToken(r.access_token)
      setGStatus('Letting the ghosts into your calendar…')
      try {
        const n = importEvents(await listToday())
        await pushAll()
        setGStatus(n
          ? `Pulled ${n} event${n > 1 ? 's' : ''} from today's calendar. Move one in Google Calendar and watch.`
          : 'No timed events today in this calendar. Add one in Google Calendar, then move it.')
      } catch (err) { setGStatus(err.message) }
    },
    onError: () => setGStatus('Google sign-in failed. Try again.'),
  })

  // Watch Google Calendar: a task moved there leaves a ghost here and there.
  useEffect(() => {
    if (!token) return
    let stop = false
    const tick = async () => {
      const startedAt = Date.now()
      try {
        const items = await listToday()
        if (stop) return
        const byId = new Map(items.map((ev) => [ev.id, ev]))
        for (const t of dayRef.current.tasks) {
          if (!t.gcalId || t.done || pending.current.has(t.id) || (t.movedAt || 0) > startedAt) continue
          const ev = byId.get(t.gcalId)
          if (!ev || ev.status === 'cancelled' || !ev.start?.dateTime || !sameDay(ev.start.dateTime)) continue
          const remote = hhmm(ev.start.dateTime)
          if (remote !== t.time) moveTask(t.id, remote, 'google')
        }
        importEvents(items)
        setGStatus(`Watching your Google Calendar · last check ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`)
      } catch (err) { if (!stop) setGStatus(err.message) }
    }
    tick()
    const iv = setInterval(tick, 6000)
    return () => { stop = true; clearInterval(iv) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  /* ---------- core haunting ---------- */
  function moveTask(id, time, source = 'app') {
    const d = dayRef.current
    const task = d.tasks.find((t) => t.id === id)
    if (!task || task.done || task.time === time) return
    const returning = d.ghosts.find((gh) => gh.taskId === id && gh.time === time && !gh.leaving)
    let ghosts = d.ghosts
    let created = null
    if (returning) {
      ghosts = ghosts.map((gh) => (gh.id === returning.id ? { ...gh, leaving: true } : gh))
      setTimeout(() => update((x) => ({ ...x, ghosts: x.ghosts.filter((gh) => gh.id !== returning.id) })), 1000)
      remoteDelete(returning.gcalId)
      playFree()
      flash(`You came back to ${fmt(time)}. That ghost can finally rest.`)
    } else {
      const n = d.ghosts.filter((gh) => gh.taskId === id && !gh.leaving).length + 1
      created = { id: uid(), taskId: id, title: task.title, time: task.time, n }
      ghosts = [...ghosts, created]
      setApparition({ key: created.id, n, title: task.title, time: task.time, source })
      if (n >= 3) playPossessed(); else playAppear()
    }
    commit({
      ...d,
      everHaunted: true,
      ghosts,
      tasks: d.tasks.map((t) => (t.id === id ? { ...t, time, movedAt: Date.now(), asked: false, missed: false } : t)),
    })
    if (source === 'app') {
      const start = toDate(time)
      remotePatchTask(task, {
        start: { dateTime: start.toISOString() },
        end: { dateTime: new Date(start.getTime() + 60 * 60000).toISOString() },
      })
    }
    if (created) remoteCreateGhost(created)
  }

  function snooze(task) {
    const nextHour = Math.ceil((clockMin() + 1) / 60) * 60
    const next = Math.min(Math.max(toMin(task.time) + 60, nextHour), 23 * 60)
    if (next === toMin(task.time)) { flash('It is too late to postpone this any further.'); return }
    moveTask(task.id, fromMin(next))
  }

  function completeTask(id) {
    const d = dayRef.current
    const task = d.tasks.find((t) => t.id === id)
    if (!task) return
    if (task.done) {
      commit({ ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, done: false } : t)) })
      remotePatchTask(task, { summary: task.title })
      return
    }
    const mine = d.ghosts.filter((gh) => gh.taskId === id && !gh.leaving)
    const freedNow = mine.length + 1
    commit({
      ...d,
      everHaunted: true,
      freed: d.freed + freedNow,
      tasks: d.tasks.map((t) => (t.id === id ? { ...t, done: true, asked: true, missed: false } : t)),
      ghosts: d.ghosts.map((gh) => (gh.taskId === id ? { ...gh, leaving: true } : gh)),
    })
    setTimeout(() => update((x) => ({ ...x, ghosts: x.ghosts.filter((gh) => !(gh.taskId === id && gh.leaving)) })), 1000)
    mine.forEach((gh) => remoteDelete(gh.gcalId))
    remotePatchTask(task, { summary: `✓ ${task.title}` })
    playFree()
    flash(`${freedNow} ghost${freedNow > 1 ? 's' : ''} set free. "${task.title}" is done.`)
  }

  function answer(task, choice) {
    if (choice === 'yes') { completeTask(task.id); return }
    if (choice === 'later') { snooze(task); return }
    update((d) => ({ ...d, everHaunted: true, tasks: d.tasks.map((t) => (t.id === task.id ? { ...t, asked: true, missed: true } : t)) }))
    remotePatchTask(task, { summary: `👻 Not done: ${task.title}` })
    setApparition({ key: uid(), n: 3, title: task.title, time: task.time, lines: ['It stays.', `"${task.title}" will haunt you until midnight.`] })
    playStays()
  }

  function deleteTask(id) {
    const d = dayRef.current
    const task = d.tasks.find((t) => t.id === id)
    const mine = d.ghosts.filter((gh) => gh.taskId === id)
    commit({ ...d, tasks: d.tasks.filter((t) => t.id !== id), ghosts: d.ghosts.filter((gh) => gh.taskId !== id) })
    mine.forEach((gh) => remoteDelete(gh.gcalId))
    if (task?.gcalId) remoteDelete(task.gcalId)
  }

  function addTask(e) {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title || !newTime) return
    const task = { id: uid(), title, time: newTime, done: false }
    update((d) => ({ ...d, tasks: [...d.tasks, task] }))
    setNewTitle('')
    remoteCreateTask(task)
  }

  function newDay() {
    const d = dayRef.current
    d.ghosts.forEach((gh) => remoteDelete(gh.gcalId))
    d.tasks.forEach((t) => remoteDelete(t.gcalId))
    commit(freshDay())
    flash('A fresh day. Nothing haunts you… yet.')
    if (tokenRef.current) setTimeout(async () => { try { importEvents(await listToday()) } catch { /* next check retries */ } }, 800)
  }

  function onDrop(e, hour) {
    e.preventDefault()
    setOverHour(null)
    const id = e.dataTransfer.getData('text/plain') || dragId
    const task = dayRef.current.tasks.find((t) => t.id === id)
    if (!task) return
    moveTask(id, `${pad(hour)}:${task.time.split(':')[1]}`)
  }

  /* ---------- derived ---------- */
  const active = day.ghosts.filter((gh) => !gh.leaving)
  const countFor = (taskId) => active.filter((gh) => gh.taskId === taskId).length
  const openTasks = day.tasks.filter((t) => !t.done)
  const possessed = openTasks.filter((t) => countFor(t.id) >= 3)
  const missed = openTasks.filter((t) => t.missed)
  const ghostsLeft = active.length + missed.length
  const nowMin = clockMin()
  const dueTask = openTasks
    .filter((t) => !t.asked && toMin(t.time) <= nowMin)
    .sort((a, b) => toMin(a.time) - toMin(b.time))[0]
  const level = ghostsLeft === 0 ? 0 : possessed.length > 0 || ghostsLeft >= 6 ? 3 : ghostsLeft >= 3 ? 2 : 1
  const levelName = ['Peaceful', 'Something is here', 'Haunted', 'Possessed'][level]
  const meter = Math.min(100, ghostsLeft * 14 + possessed.length * 12)
  const worst = openTasks.map((t) => [t, countFor(t.id)]).sort((a, b) => b[1] - a[1])[0]

  // The haunting creeps into your browser tab.
  const ghostKey = active.map((gh) => gh.id).concat(missed.map((t) => t.id)).join()
  useEffect(() => {
    const base = ghostsLeft ? `👻 (${ghostsLeft}) ghosted` : 'ghosted'
    let iv
    const lines = active.map((gh) => `👻 "${gh.title}" still waits at ${fmt(gh.time)}…`)
      .concat(missed.map((t) => `👻 You never did "${t.title}"…`))
    const onVis = () => {
      clearInterval(iv)
      document.title = base
      if (document.hidden && lines.length) {
        let i = 0
        iv = setInterval(() => { i += 1; document.title = i % 2 ? lines[Math.floor(i / 2) % lines.length] : base }, 1400)
      }
    }
    onVis()
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghostKey])

  // Opt-in: ghosts follow you out of the tab as real system notifications.
  const [notify, setNotify] = useState(() => typeof Notification !== 'undefined' && Notification.permission === 'granted')
  async function enableNotify() {
    if (typeof Notification === 'undefined') { flash('This browser cannot show notifications.'); return }
    const p = await Notification.requestPermission()
    setNotify(p === 'granted')
    flash(p === 'granted' ? 'Now leave this tab. They will find you.' : 'Notifications blocked. The ghosts stay in the tab.')
  }
  useEffect(() => {
    if (!notify) return
    let timer
    const haunt = (delay) => {
      timer = setTimeout(() => {
        const live = dayRef.current.ghosts.filter((gh) => !gh.leaving)
          .concat(dayRef.current.tasks.filter((t) => t.missed && !t.done).map((t) => ({ title: t.title, time: t.time })))
        if (document.hidden && live.length) {
          const gh = live[Math.floor(Math.random() * live.length)]
          try {
            const n = new Notification(`👻 "${gh.title}" is still waiting`, { body: `You left it at ${fmt(gh.time)}. It hasn't moved on.`, tag: 'ghosted', renotify: true })
            n.onclick = () => { window.focus(); n.close() }
          } catch { /* ignore */ }
        }
        haunt(60000)
      }, delay)
    }
    const onVis = () => { clearTimeout(timer); if (document.hidden) haunt(12000) }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onVis) }
  }, [notify])

  const dueKey = ready && dueTask && !apparition ? dueTask.id + dueTask.time : ''
  useEffect(() => { if (dueKey) playBell() }, [dueKey])

  // When a task's hour comes, ask on the desktop too.
  const notified = useRef(new Set())
  useEffect(() => {
    if (!dueTask || !notify || notified.current.has(dueTask.id + dueTask.time)) return
    notified.current.add(dueTask.id + dueTask.time)
    try {
      const n = new Notification(`⏰ ${fmt(dueTask.time)}: did you "${dueTask.title}"?`, { body: 'Answer in Ghosted. Ignore it and it will haunt you.', tag: `due-${dueTask.id}` })
      n.onclick = () => { window.focus(); n.close() }
    } catch { /* ignore */ }
  }, [dueTask, notify])

  const [card, setCard] = useState(null)
  async function openCard() {
    const rows = [
      ...missed.map((t) => ({ text: `Never did "${t.title}"`, angry: true })),
      ...openTasks.filter((t) => countFor(t.id) > 0)
        .map((t) => ({ text: `Postponed "${t.title}" ${countFor(t.id)}×`, angry: countFor(t.id) >= 3, n: countFor(t.id) }))
        .sort((a, b) => b.n - a.n),
    ]
    const canvas = await drawShareCard({
      ghostsLeft, freed: day.freed, possessed: possessed.length, rows,
      dateLabel: new Date().toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }),
      url: window.location.host,
    })
    canvas.toBlob((blob) => { if (blob) setCard({ blob, src: URL.createObjectURL(blob) }) }, 'image/png')
  }
  function closeCard() { if (card) URL.revokeObjectURL(card.src); setCard(null) }
  function downloadCard() {
    const a = document.createElement('a')
    a.href = card.src; a.download = `my-haunted-day-${day.date}.png`
    document.body.appendChild(a); a.click(); a.remove()
  }
  async function shareCardFile() {
    const file = new File([card.blob], `my-haunted-day-${day.date}.png`, { type: 'image/png' })
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text: 'Is your to-do list haunted? 👻' }) } catch { /* cancelled */ }
    } else { downloadCard(); flash('Image saved. Post it anywhere.') }
  }

  async function share() {
    const url = window.location.origin
    const text = ghostsLeft
      ? `My to-do list is haunted 👻 ${ghostsLeft} ghost${ghostsLeft > 1 ? 's are' : ' is'} still following me today${worst && worst[1] ? `. "${worst[0].title}" has run from me ${worst[1]} time${worst[1] > 1 ? 's' : ''}` : ''}. Is yours? ${url}`
      : `My to-do list is ghost-free today 😇 I set ${day.freed} ghost${day.freed === 1 ? '' : 's'} free. Is yours haunted? ${url}`
    if (navigator.share) {
      try { await navigator.share({ text }); return } catch { return }
    }
    try { await navigator.clipboard.writeText(text); flash('Copied. Paste it anywhere.') } catch { flash(text) }
  }

  const apparitionLines = apparition && (apparition.lines || (
    apparition.n >= 3
      ? ['POSSESSED.', `"${apparition.title}" has run from you ${apparition.n} times.`]
      : apparition.n === 2
        ? ['It’s following you…', `A second ghost of "${apparition.title}" now haunts ${fmt(apparition.time)}.`]
        : ['It remembers.', `"${apparition.title}" was supposed to happen at ${fmt(apparition.time)}.`]
  ))

  return (
    <div className={`app lvl-${level}`}>
      <div className="fog" aria-hidden="true"><span /><span /><span /></div>

      <header className="top">
        <div className="logo"><GhostIcon size={26} /> ghosted
          <button type="button" className="mute" onClick={toggleMute} aria-label={muted ? 'Turn sound on' : 'Turn sound off'} title={muted ? 'Sound off' : 'Sound on'}>{muted ? '🔇' : '🔊'}</button>
        </div>
        <div className="meter" title="How haunted your day is">
          <div className="meter-label"><span>{levelName}</span><b>{ghostsLeft} 👻 left today</b></div>
          <div className="meter-bar"><i style={{ width: `${meter}%` }} /></div>
        </div>
      </header>

      <section className="hero">
        <h1>Your to-do list<br />is <span className="creep">haunted.</span></h1>
        <p>Every task is a ghost waiting for its hour. When the hour comes, you'll be asked: <i>did you do it?</i> Do it and the ghost is set free. Skip it or postpone it and it <b>haunts you until midnight.</b></p>
      </section>

      {!day.everHaunted && (
        <div className="hint">👉 Every task below is a ghost. Press <b>⏩ Skip ahead 1 hour</b> to make time pass, and answer when it asks.</div>
      )}

      <main className="layout">
        <section className="day">
          <form className="add" onSubmit={addTask}>
            <select className="time-pick" value={newTime} onChange={(e) => setNewTime(e.target.value)} aria-label="Time">
              {HOURS.flatMap((h) => [`${pad(h)}:00`, `${pad(h)}:30`]).map((t) => <option key={t} value={t}>{fmt(t)}</option>)}
            </select>
            <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Add something you plan to do today…" maxLength={60} />
            <button type="submit">Add</button>
          </form>

          <div className="timeline">
            {HOURS.map((h) => {
              const items = [
                ...active.concat(day.ghosts.filter((gh) => gh.leaving))
                  .filter((gh) => Math.floor(toMin(gh.time) / 60) === h)
                  .map((gh) => ({ kind: 'ghost', at: toMin(gh.time), item: gh })),
                ...day.tasks.filter((t) => Math.floor(toMin(t.time) / 60) === h)
                  .map((t) => ({ kind: 'task', at: toMin(t.time) + 0.5, item: t })),
              ].sort((a, b) => a.at - b.at)
              return (
                <div
                  key={h}
                  className={`hour ${items.length ? '' : 'empty'} ${overHour === h ? 'over' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setOverHour(h) }}
                  onDragLeave={() => setOverHour((o) => (o === h ? null : o))}
                  onDrop={(e) => onDrop(e, h)}
                >
                  <div className="hour-label">{fmtHour(h)}</div>
                  <div className="slot">
                    {items.map(({ kind, item }) => kind === 'ghost' ? (
                      <div key={item.id} className={`ghost n${Math.min(item.n, 3)} ${item.leaving ? 'leaving' : ''}`}>
                        <div className="ghost-body"><GhostIcon size={38} angry={item.n >= 3} /></div>
                        <div className="ghost-text">
                          <small>{fmt(item.time)} · ghost #{item.n}{item.gcalId ? ' · also in Google Calendar' : ''}</small>
                          <strong>“{item.title}” was supposed to be here.</strong>
                          {!item.leaving && (
                            <button type="button" onClick={() => moveTask(item.taskId, item.time)}>↩ Go back to {fmt(item.time)}</button>
                          )}
                        </div>
                      </div>
                    ) : (() => {
                      const c = item.done ? 0 : countFor(item.id)
                      const diff = toMin(item.time) - nowMin
                      const due = !item.done && !item.missed && diff <= 0
                      const sz = item.missed ? 46 : diff <= 60 ? 44 : diff <= 120 ? 36 : diff <= 240 ? 29 : diff <= 480 ? 23 : 18
                      const when = diff < 60 ? `in ${diff} min` : `in ${Math.floor(diff / 60)}h${diff % 60 ? ` ${diff % 60}m` : ''}`
                      return (
                        <div
                          key={item.id}
                          className={`task h${Math.min(c, 3)} ${item.done ? 'done' : ''} ${item.missed ? 'missed' : ''} ${due ? 'due' : ''} ${dragId === item.id ? 'dragging' : ''}`}
                          draggable={!item.done}
                          onDragStart={(e) => { setDragId(item.id); e.dataTransfer.setData('text/plain', item.id); e.dataTransfer.effectAllowed = 'move' }}
                          onDragEnd={() => { setDragId(null); setOverHour(null) }}
                        >
                          <button type="button" className="check" onClick={() => completeTask(item.id)} aria-label={item.done ? 'Mark not done' : 'Mark done'}>{item.done ? '✓' : ''}</button>
                          {!item.done && (
                            <div className={`spirit ${item.missed ? 'angry' : ''}`} style={{ width: 46 }} title={item.missed ? 'Haunting you until midnight' : 'Waiting for its hour'}>
                              <GhostIcon size={sz} angry={item.missed} />
                            </div>
                          )}
                          <div className="task-main">
                            <small>
                              {fmt(item.time)}
                              {!item.done && !item.missed && !due && <em className="when"> · {when}</em>}
                              {due && <em className="now"> · ⏰ its hour has come</em>}
                              {item.missed && <em className="pos"> · NOT DONE · HAUNTING YOU</em>}
                              {item.fromCal && <em> · 📅 from your calendar</em>}
                              {c === 1 && <em> · 👻 haunted</em>}
                              {c === 2 && <em> · 👻👻 followed</em>}
                              {c >= 3 && <em className="pos"> · POSSESSED</em>}
                            </small>
                            <strong>{item.title}</strong>
                          </div>
                          {!item.done && <button type="button" className="later" onClick={() => snooze(item)}>Later +1h</button>}
                          <button type="button" className="x" onClick={() => deleteTask(item.id)} aria-label="Delete task">×</button>
                        </div>
                      )
                    })())}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <aside className="side">
          <div className="stats">
            <div><b>{ghostsLeft}</b><small>ghosts left</small></div>
            <div><b>{possessed.length}</b><small>possessed</small></div>
            <div><b>{day.freed}</b><small>set free</small></div>
          </div>

          <div className="card clock">
            <small>Ghost clock</small>
            <b>{fmt(fromMin(nowMin))}</b>
            <button type="button" className="primary" onClick={skipAhead}>⏩ Skip ahead 1 hour</button>
            {(day.skip || 0) > 0 && (
              <button type="button" className="ghost-btn" onClick={() => update((d) => ({ ...d, skip: 0 }))}>Back to real time</button>
            )}
          </div>

          <div className="card rules">
            <h3>How the haunting works</h3>
            <ol>
              <li>Every task is a <b>ghost</b>. It grows as its hour gets closer.</li>
              <li>When the hour comes, Ghosted asks: <b>did you do it?</b></li>
              <li><b>Yes</b> sets it free. <b>No</b> and it haunts you until midnight.</li>
              <li><b>Postpone</b> and a ghost stays at the time you abandoned. Three times and it's <span className="pos">possessed</span>.</li>
              <li>At <b>midnight</b>, count your ghosts. Then they all vanish.</li>
            </ol>
          </div>

          <div className="card">
            <h3>Let them follow you out of this tab</h3>
            <p>Leave Ghosted open and switch tabs. Your browser tab starts whispering, and with notifications on, your ghosts appear on your desktop too.</p>
            {notify
              ? <p className="live"><span className="dot" /> Ghosts can follow you. Switch tabs to see.</p>
              : <button type="button" className="primary" onClick={enableNotify}>🔔 Let the ghosts follow me</button>}
          </div>

          <button type="button" className="share" onClick={openCard}>🖼️ My haunted day (share image)</button>
          <button type="button" className="reset" onClick={share}>or copy as text</button>

          <div className="card gcal">
            <h3>Let it creep into your real calendar</h3>
            <p>Connect Google Calendar and your day moves in. Every ghost becomes a real event at the time you abandoned. Move a task <i>inside Google Calendar</i> and its ghost appears here and there within seconds.</p>
            {!CLIENT_ID ? (
              <p className="muted">Google connection is not configured on this deployment.</p>
            ) : token ? (
              <>
                <p className="live"><span className="dot" /> {gStatus || 'Connected.'}</p>
                <button type="button" className="ghost-btn" onClick={() => { tokenRef.current = ''; setToken(''); setGStatus('Disconnected.') }}>Disconnect</button>
              </>
            ) : (
              <>
                <button type="button" className="primary" onClick={() => login()}>Connect Google Calendar</button>
                {gStatus && <p className="muted">{gStatus}</p>}
              </>
            )}
            <p className="fine">{CALENDAR_ID === 'primary' ? 'Uses your main calendar.' : 'Uses your Ghosted test calendar.'} Ghost events are see-through and never block your time.</p>
          </div>

          <button type="button" className="reset" onClick={newDay}>Start a fresh day</button>
        </aside>
      </main>

      {apparition && (
        <div className="apparition" key={apparition.key} aria-live="polite">
          <div className="app-ghost"><GhostIcon size={170} angry={apparition.n >= 3} /></div>
          {apparition.source === 'google' && <p className="app-src">Moved in Google Calendar…</p>}
          <h2 className={apparition.n >= 3 ? 'pos' : ''}>{apparitionLines[0]}</h2>
          <p>{apparitionLines[1]}</p>
        </div>
      )}
      {ready && dueTask && !apparition && (
        <div className="checkin" role="dialog" aria-modal="true" aria-label="Did you do it?">
          <div className="checkin-card" key={dueTask.id + dueTask.time}>
            <div className="checkin-ghost"><GhostIcon size={84} /></div>
            <small>{fmt(dueTask.time)} · its hour has come</small>
            <h2>Did you “{dueTask.title}”?</h2>
            <p>This ghost has been waiting for you. Tell it the truth.</p>
            <div className="checkin-btns">
              <button type="button" className="yes" onClick={() => answer(dueTask, 'yes')}>✓ Yes, done</button>
              <button type="button" className="later-btn" onClick={() => answer(dueTask, 'later')}>⏭ Postpone</button>
              <button type="button" className="no" onClick={() => answer(dueTask, 'no')}>✗ No</button>
            </div>
          </div>
        </div>
      )}
      {card && (
        <div className="checkin" role="dialog" aria-modal="true" aria-label="My haunted day" onClick={closeCard}>
          <div className="card-modal" onClick={(e) => e.stopPropagation()}>
            <img src={card.src} alt="My haunted day" />
            <div className="checkin-btns two">
              <button type="button" className="yes" onClick={shareCardFile}>📣 Share</button>
              <button type="button" className="later-btn" onClick={downloadCard}>⬇ Download</button>
            </div>
            <button type="button" className="reset" onClick={closeCard}>Close</button>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}

      <footer className="foot">ghosted · the time you abandoned remembers you</footer>
    </div>
  )
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={CLIENT_ID || 'not-configured'}>
      <Ghosted />
    </GoogleOAuthProvider>
  )
}
