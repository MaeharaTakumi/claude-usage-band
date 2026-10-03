import type { Register } from 'claude-code'

import type { Limit } from '../types'

const limits = { plugin: 'usage-band', key: 'limits' } as const

const PHASES = ['○', '◔', '◑', '◕', '●']
const BLUE = '#3b82f6'
const GREY = '#8a8a8a'

const NAMES = {
  en: { five_hour: '5h', seven_day: '7d', spend_limit: 'spend' } as Record<string, string>,
  ja: { five_hour: '現在のセッション', seven_day: '今週', spend_limit: '利用上限' } as Record<string, string>,
}

const remaining = (resetsAt: string | undefined, t: number, ja: boolean) => {
  if (!resetsAt) return '?'
  const mins = Math.max(0, Math.round((Date.parse(resetsAt) - t) / 60000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (ja) return d > 0 ? `${d}日${h}時間` : h > 0 ? `${h}時間${m}分` : `${m}分`
  return d > 0 ? `${d}d${h}h` : h > 0 ? `${h}h${m}m` : `${m}m`
}

const DIVIDER =
  '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="28" viewBox="0 0 8 28">' +
  '<rect x="3" y="0" width="2" height="28" fill="' + GREY + '"/></svg>'

// A ring gauge: grey track plus a blue arc starting at 12 o'clock.
const ring = (percent: number) => {
  const p = Math.min(100, Math.max(0, percent))
  const r = 14
  const c = 2 * Math.PI * r
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">` +
    `<circle cx="18" cy="18" r="${r}" fill="none" stroke="#888" stroke-opacity="0.3" stroke-width="5"/>` +
    `<circle cx="18" cy="18" r="${r}" fill="none" stroke="${BLUE}" stroke-width="5" stroke-linecap="round" ` +
    `stroke-dasharray="${((c * p) / 100).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 18 18)"/>` +
    `</svg>`
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const usage = await $.session.usage()
    await $.state.set(limits, usage.rateLimits as Limit[])
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await $.state.set(limits, e.rateLimits as Limit[])
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { value = [] } = await $.state.get(limits)
    if (value.length === 0) return next(e)
    const t = await $.clock.now()
    const ja = true
    const names = ja ? NAMES.ja : NAMES.en
    const label = (l: Limit) => names[l.kind] ?? l.kind
    const reset = (l: Limit) =>
      ja ? `リセットまで ${remaining(l.resetsAt, t, true)}` : `reset in ${remaining(l.resetsAt, t, false)}`
    const ui = $.ui.resolve(e)
    const { Box, Text } = ui

    if ('Svg' in ui) {
      const { Svg } = ui
      return (
        <Box flexDirection="row" gap={2} alignItems="center">
          {value.flatMap((l, i) => [
            ...(i > 0 ? [<Svg key={`sep-${l.kind}`} source={DIVIDER} alt="区切り" width={8} height={28} />] : []),
            <Box key={l.kind} flexDirection="row" gap={1} alignItems="center">
              <Text color={GREY}>{label(l)}</Text>
              <Svg
                source={ring(l.percentUsed)}
                alt={ja ? `${label(l)} ${l.percentUsed}% 使用` : `${label(l)} ${l.percentUsed}% used`}
                width={28}
                height={28}
              />
              <Text color={GREY}>{l.percentUsed}%</Text>
              <Text dimColor>{reset(l)}</Text>
            </Box>,
          ])}
        </Box>
      )
    }

    // Terminal: no vector element, so a quarter-step circle glyph stands in for the ring.
    const text = value
      .map(l => {
        const glyph = PHASES[Math.min(4, Math.round(l.percentUsed / 25))]
        return `${label(l)} ${glyph} ${l.percentUsed}% ${reset(l)}`
      })
      .join('  |  ')
    return (
      <Box>
        <Text dimColor>{text}</Text>
      </Box>
    )
  })
}
