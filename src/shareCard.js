// Draws a 1080x1350 "My haunted day" image (Instagram portrait size).
const GHOST = new Path2D('M20 2C9.5 2 3 9.8 3 20V44L8.5 39.5L14 44L20 39.5L26 44L31.5 39.5L37 44V20C37 9.8 30.5 2 20 2Z')

function drawGhost(ctx, x, y, size, { color = '#f4f0ff', angry = false, glow = '#c6a4ff' } = {}) {
  const s = size / 40
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.shadowColor = glow
  ctx.shadowBlur = 30 / s
  ctx.fillStyle = color
  ctx.fill(GHOST)
  ctx.shadowBlur = 0
  ctx.fillStyle = angry ? '#ff4d6d' : '#1a1024'
  const ey = angry ? 2.2 : 4
  ctx.beginPath(); ctx.ellipse(14, 19, 3, ey, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(26, 19, 3, ey, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#1a1024'
  ctx.beginPath(); ctx.ellipse(20, 29.5, 3.5, angry ? 1.6 : 4.5, 0, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1)
  return `${t}…`
}

export async function drawShareCard({ ghostsLeft, freed, possessed, rows, dateLabel, url }) {
  try { await Promise.all([document.fonts.load('120px Creepster'), document.fonts.load('700 40px Inter')]) } catch { /* fallback fonts */ }
  const W = 1080, H = 1350
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')
  const haunted = ghostsLeft > 0
  const accent = possessed > 0 ? '#ff4d6d' : '#c6a4ff'

  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#140d22'); bg.addColorStop(1, possessed > 0 ? '#2a0b18' : '#0b0812')
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
  const fog = ctx.createRadialGradient(W / 2, 330, 40, W / 2, 330, 620)
  fog.addColorStop(0, possessed > 0 ? 'rgba(255,77,109,.28)' : 'rgba(198,164,255,.28)'); fog.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = fog; ctx.fillRect(0, 0, W, H)

  // Scattered small ghosts in the background
  const spots = [[90, 120, 46], [930, 160, 58], [110, 1110, 40], [980, 1120, 50], [70, 560, 34], [990, 600, 38]]
  ctx.globalAlpha = 0.18
  spots.forEach(([x, y, s]) => drawGhost(ctx, x, y, s, { glow: 'transparent' }))
  ctx.globalAlpha = 1

  ctx.textAlign = 'center'
  ctx.fillStyle = '#a69cb7'
  ctx.font = '600 30px Inter, sans-serif'
  ctx.fillText(`MY HAUNTED DAY · ${dateLabel.toUpperCase()}`, W / 2, 96)

  drawGhost(ctx, W / 2 - 95, 140, 190, { angry: possessed > 0, glow: accent })

  ctx.font = '230px Creepster, Impact, sans-serif'
  ctx.fillStyle = haunted ? accent : '#7fe3b4'
  ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 40
  ctx.fillText(String(ghostsLeft), W / 2, 590)
  ctx.shadowBlur = 0
  ctx.font = '700 46px Inter, sans-serif'
  ctx.fillStyle = '#f2edf9'
  ctx.fillText(haunted ? `ghost${ghostsLeft === 1 ? '' : 's'} still haunting me` : 'ghosts left. My day is clear.', W / 2, 660)

  ctx.font = '500 32px Inter, sans-serif'
  ctx.fillStyle = '#a69cb7'
  ctx.fillText(`${freed} set free · ${possessed} possessed`, W / 2, 716)

  // Rows: what is still haunting
  const listTop = 790
  ctx.textAlign = 'left'
  const shown = rows.slice(0, 5)
  shown.forEach((r, i) => {
    const y = listTop + i * 86
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.beginPath(); ctx.roundRect(110, y - 50, W - 220, 72, 20); ctx.fill()
    drawGhost(ctx, 132, y - 44, 44, { angry: r.angry, glow: r.angry ? '#ff4d6d' : '#c6a4ff', color: r.angry ? '#ffe3e8' : '#f4f0ff' })
    ctx.font = '600 32px Inter, sans-serif'
    ctx.fillStyle = r.angry ? '#ff8da1' : '#f2edf9'
    ctx.fillText(fit(ctx, r.text, W - 360), 200, y)
  })
  if (!shown.length) {
    ctx.textAlign = 'center'
    ctx.font = 'italic 500 34px Inter, sans-serif'
    ctx.fillStyle = '#7fe3b4'
    ctx.fillText('Every task done. Nothing follows me tonight.', W / 2, listTop + 20)
  }
  if (rows.length > 5) {
    ctx.textAlign = 'center'
    ctx.font = '500 28px Inter, sans-serif'
    ctx.fillStyle = '#a69cb7'
    ctx.fillText(`+ ${rows.length - 5} more`, W / 2, listTop + 5 * 86 - 20)
  }

  ctx.textAlign = 'center'
  ctx.font = '64px Creepster, Impact, sans-serif'
  ctx.fillStyle = '#f4f0ff'
  ctx.fillText('ghosted', W / 2, H - 92)
  ctx.font = '500 28px Inter, sans-serif'
  ctx.fillStyle = '#a69cb7'
  ctx.fillText(`Is your to-do list haunted? ${url}`, W / 2, H - 46)

  return canvas
}
