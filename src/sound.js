// All sounds are synthesised in the browser with Web Audio. No files.
let ctx = null
let master = null
let muted = false
try { muted = localStorage.getItem('ghosted-muted') === '1' } catch { /* ignore */ }

function ac() {
  if (ctx) return ctx
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  ctx = new AC()
  master = ctx.createGain()
  master.gain.value = 0.55
  master.connect(ctx.destination)
  return ctx
}

// Browsers only allow audio after a click/tap, so unlock on the first one.
export function unlockAudio() {
  const c = ac()
  if (c && c.state === 'suspended') c.resume()
}
export function isMuted() { return muted }
export function setMuted(v) {
  muted = v
  try { localStorage.setItem('ghosted-muted', v ? '1' : '0') } catch { /* ignore */ }
}

function ready() {
  if (muted) return null
  const c = ac()
  if (!c || c.state !== 'running') return null
  return c
}

function env(g, t, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + a)
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d)
}

function noise(c, seconds) {
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buf
  return src
}

// A ghostly "ooooh": wavering sine that slides down, under a breath of wind.
export function playAppear() {
  const c = ready(); if (!c) return
  const t = c.currentTime
  const o = c.createOscillator(); const g = c.createGain()
  const lfo = c.createOscillator(); const lfoGain = c.createGain()
  o.type = 'sine'
  o.frequency.setValueAtTime(420, t)
  o.frequency.exponentialRampToValueAtTime(190, t + 1.6)
  lfo.frequency.value = 6; lfoGain.gain.value = 14
  lfo.connect(lfoGain); lfoGain.connect(o.frequency)
  env(g, t, 0.25, 0.32, 1.5)
  o.connect(g); g.connect(master)
  o.start(t); lfo.start(t); o.stop(t + 1.9); lfo.stop(t + 1.9)

  const n = noise(c, 1.6); const f = c.createBiquadFilter(); const ng = c.createGain()
  f.type = 'bandpass'; f.Q.value = 1.2
  f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2200, t + 0.7); f.frequency.exponentialRampToValueAtTime(300, t + 1.5)
  env(ng, t, 0.3, 0.22, 1.2)
  n.connect(f); f.connect(ng); ng.connect(master)
  n.start(t); n.stop(t + 1.6)
}

// Possessed: a low, throbbing drone with a dissonant edge.
export function playPossessed() {
  const c = ready(); if (!c) return
  const t = c.currentTime
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600
  const g = c.createGain(); env(g, t, 0.4, 0.45, 2.6)
  const trem = c.createOscillator(); const tg = c.createGain()
  trem.frequency.value = 7; tg.gain.value = 0.18
  trem.connect(tg); tg.connect(g.gain)
  ;[55, 58.3, 110].forEach((f) => {
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f
    o.connect(lp); o.start(t); o.stop(t + 3.1)
  })
  lp.connect(g); g.connect(master)
  trem.start(t); trem.stop(t + 3.1)
  playAppear()
}

// Set free: a soft rising chime.
export function playFree() {
  const c = ready(); if (!c) return
  const t = c.currentTime
  ;[659, 880, 1175, 1568].forEach((f, i) => {
    const o = c.createOscillator(); const g = c.createGain()
    o.type = 'sine'; o.frequency.value = f
    env(g, t + i * 0.09, 0.02, 0.18, 1.1)
    o.connect(g); g.connect(master)
    o.start(t + i * 0.09); o.stop(t + i * 0.09 + 1.3)
  })
}

// The hour has come: a distant bell.
export function playBell() {
  const c = ready(); if (!c) return
  const t = c.currentTime
  ;[[392, 0.22], [588, 0.1], [784, 0.06]].forEach(([f, v]) => {
    const o = c.createOscillator(); const g = c.createGain()
    o.type = 'sine'; o.frequency.value = f
    env(g, t, 0.01, v, 2.2)
    o.connect(g); g.connect(master)
    o.start(t); o.stop(t + 2.4)
  })
}

// "It stays": a heavy thud and a sour chord.
export function playStays() {
  const c = ready(); if (!c) return
  const t = c.currentTime
  const o = c.createOscillator(); const g = c.createGain()
  o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.5)
  env(g, t, 0.01, 0.6, 0.6)
  o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.7)
  ;[146.8, 155.6].forEach((f) => {
    const s = c.createOscillator(); const sg = c.createGain()
    s.type = 'triangle'; s.frequency.value = f
    env(sg, t + 0.1, 0.2, 0.14, 1.8)
    s.connect(sg); sg.connect(master); s.start(t + 0.1); s.stop(t + 2.2)
  })
}
