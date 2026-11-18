/**
 * Sounds made in the page — no audio file.
 * Keyring visits stay silent. Germ pops are direct taps only.
 * The toothbrush shine plays once when that brush is tapped.
 * A quiet loop plays during a direct-page round and stops when the round ends.
 * Phones and computers hear the same direct-page sounds. Keyring visits stay silent.
 */
let ctx: AudioContext | null = null

function isFromKeyring(): boolean {
  return new URLSearchParams(window.location.search).get('from') === 'keyring'
}

function audioContext(): AudioContext | null {
  if (isFromKeyring()) return null
  const AudioCtx = window.AudioContext
  if (!AudioCtx) return null
  if (!ctx || ctx.state === 'closed') ctx = new AudioCtx()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function playGermPop(): void {
  const audio = audioContext()
  if (!audio) return

  const now = audio.currentTime
  const pop = 1180 + Math.random() * 280

  const body = audio.createOscillator()
  const bodyTone = audio.createGain()
  body.type = 'sine'
  body.frequency.setValueAtTime(pop, now)
  body.frequency.exponentialRampToValueAtTime(680, now + 0.11)
  bodyTone.gain.setValueAtTime(0.0001, now)
  bodyTone.gain.exponentialRampToValueAtTime(0.18, now + 0.006)
  bodyTone.gain.exponentialRampToValueAtTime(0.0001, now + 0.13)
  body.connect(bodyTone)
  bodyTone.connect(audio.destination)
  body.start(now)
  body.stop(now + 0.14)
  body.onended = () => {
    body.disconnect()
    bodyTone.disconnect()
  }

  const skin = audio.createOscillator()
  const skinTone = audio.createGain()
  skin.type = 'sine'
  skin.frequency.setValueAtTime(pop * 2, now)
  skin.frequency.exponentialRampToValueAtTime(pop * 1.35, now + 0.04)
  skinTone.gain.setValueAtTime(0.0001, now)
  skinTone.gain.exponentialRampToValueAtTime(0.045, now + 0.003)
  skinTone.gain.exponentialRampToValueAtTime(0.0001, now + 0.045)
  skin.connect(skinTone)
  skinTone.connect(audio.destination)
  skin.start(now)
  skin.stop(now + 0.05)
  skin.onended = () => {
    skin.disconnect()
    skinTone.disconnect()
  }
}

/** Music-box twinkle while the toothbrush sweeps. Sweep clears stay silent. */
export function playToothbrushShine(): void {
  const ctx = audioContext()
  if (!ctx) return

  const now = ctx.currentTime
  const length = 2.6

  const master = ctx.createGain()
  master.gain.setValueAtTime(0.0001, now)
  master.gain.exponentialRampToValueAtTime(0.9, now + 0.08)
  master.gain.setValueAtTime(0.9, now + length)
  master.gain.exponentialRampToValueAtTime(0.0001, now + length + 0.7)
  master.connect(ctx.destination)

  const bed = ctx.createGain()
  bed.gain.value = 0.035
  bed.connect(master)
  const tremolo = ctx.createGain()
  tremolo.gain.value = 0.65
  tremolo.connect(bed)
  const lfo = ctx.createOscillator()
  const lfoDepth = ctx.createGain()
  lfo.frequency.value = 5.5
  lfoDepth.gain.value = 0.35
  lfo.connect(lfoDepth)
  lfoDepth.connect(tremolo.gain)
  for (const freq of [1175, 1181, 1568, 1576]) {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq
    osc.connect(tremolo)
    osc.start(now)
    osc.stop(now + length + 0.75)
    osc.onended = () => osc.disconnect()
  }
  lfo.start(now)
  lfo.stop(now + length + 1.05)
  lfo.onended = () => {
    lfo.disconnect()
    lfoDepth.disconnect()
    tremolo.disconnect()
    bed.disconnect()
    master.disconnect()
  }

  const bells = [1047, 1175, 1319, 1568, 1760, 2093, 2349]
  for (let i = 0; i < 16; i++) {
    const start = now + (i / 16) * length + Math.random() * 0.08
    const freq = bells[Math.floor(Math.random() * bells.length)]
    const osc = ctx.createOscillator()
    const twin = ctx.createOscillator()
    const tone = ctx.createGain()
    osc.type = 'sine'
    twin.type = 'sine'
    osc.frequency.setValueAtTime(freq, start)
    twin.frequency.setValueAtTime(freq * 1.006, start)
    tone.gain.setValueAtTime(0.0001, start)
    tone.gain.exponentialRampToValueAtTime(0.04, start + 0.012)
    tone.gain.exponentialRampToValueAtTime(0.0001, start + 0.85)
    osc.connect(tone)
    twin.connect(tone)
    tone.connect(master)
    osc.start(start)
    twin.start(start)
    osc.stop(start + 0.88)
    twin.stop(start + 0.88)
    osc.onended = () => {
      osc.disconnect()
      twin.disconnect()
      tone.disconnect()
    }
  }
}

const BED_LEVEL = 0.08
const BED_BEAT = 0.47

let musicOn = false
let musicTimer: number | null = null
let musicGain: GainNode | null = null
let musicOrigin = 0
let musicBeat = 0

function playBedNote(
  audio: AudioContext,
  when: number,
  freq: number,
  dur: number,
  peak: number,
  type: OscillatorType,
): void {
  if (!musicGain) return
  const osc = audio.createOscillator()
  const tone = audio.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, when)
  tone.gain.setValueAtTime(0.0001, when)
  tone.gain.exponentialRampToValueAtTime(peak, when + 0.02)
  tone.gain.exponentialRampToValueAtTime(0.0001, when + dur)
  osc.connect(tone)
  tone.connect(musicGain)
  osc.start(when)
  osc.stop(when + dur + 0.02)
  osc.onended = () => {
    osc.disconnect()
    tone.disconnect()
  }
}

function scheduleBed(audio: AudioContext): void {
  if (!musicOn) return
  const melody = [523, 659, 784, 0, 1047, 880, 784, 659]
  const bass = [262, 0, 196, 0, 220, 0, 196, 0]
  const horizon = audio.currentTime + 0.35
  while (musicOrigin + musicBeat * BED_BEAT < horizon) {
    const step = musicBeat % melody.length
    const when = musicOrigin + musicBeat * BED_BEAT
    const note = melody[step]
    const root = bass[step]
    if (note) playBedNote(audio, when, note, 0.2, 0.42, 'triangle')
    if (root) playBedNote(audio, when, root, 0.32, 0.22, 'sine')
    musicBeat += 1
  }
}

export function startBedMusic(): void {
  const audio = audioContext()
  if (!audio || musicOn) return
  musicOn = true
  musicBeat = 0
  musicOrigin = audio.currentTime + 0.06
  const master = audio.createGain()
  master.gain.setValueAtTime(0.0001, audio.currentTime)
  master.gain.exponentialRampToValueAtTime(BED_LEVEL, audio.currentTime + 0.25)
  master.connect(audio.destination)
  musicGain = master
  scheduleBed(audio)
  musicTimer = window.setInterval(() => {
    if (ctx) scheduleBed(ctx)
  }, 120)
}

export function stopBedMusic(): void {
  musicOn = false
  if (musicTimer !== null) {
    window.clearInterval(musicTimer)
    musicTimer = null
  }
  const gain = musicGain
  musicGain = null
  if (!ctx || !gain) return
  const now = ctx.currentTime
  gain.gain.cancelScheduledValues(now)
  gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2)
  window.setTimeout(() => gain.disconnect(), 260)
}

export function setBedMusicPaused(paused: boolean): void {
  if (!musicOn || !musicGain || !ctx) return
  const now = ctx.currentTime
  musicGain.gain.cancelScheduledValues(now)
  musicGain.gain.setValueAtTime(Math.max(0.0001, musicGain.gain.value), now)
  musicGain.gain.exponentialRampToValueAtTime(paused ? 0.0001 : BED_LEVEL, now + 0.08)
}
