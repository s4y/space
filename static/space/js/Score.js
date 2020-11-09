const bpm = 128
export const qn = 30/bpm

//# Rhythms


const double = (f=x=>x) =>
  ([1, 1]).map(f)


const onbeat = (f=x=>x) =>
  ([1, 0]).map(f)


const offbeat = (f=x=>x) =>
  ([0, 1]).map(f)


const silent = (f=x=>x) => 
  ([0, 0]).map(f)


const basicBeat = () => {
	let ac = new AudioContext()
	let osc = new OscillatorNode(ac)
}


const decayControl = (length) => (freqs) =>
  freqs.reduce((notes, f) => [...notes, [f, length] ], [])


const short = decayControl(0.5)
const tenuto = decayControl(0.8)
const legato = decayControl(1)


const repeat = (list, times = 2) => 
  (times == 0)
    ? list
    : repeat([...list, ...list], times-1)


let randFrom = (arr = []) => {
  if (arr.length < 1) 
    return

  let index = Math.round(Math.random() * (arr.length - 1))
  return arr[index]  
}


const groove = (length = 16, pattern = []) => {
	if (pattern.length == length) 
		return pattern

	if (pattern.length > length) 
		return pattern.slice(0, length)

  return groove(length, [...pattern, ...(randFrom([double, onbeat, offbeat, silent])())])
}


//# Instruments 


let kick = (ctx, freq = () => 84, gen = onbeat) => {
  const osc = new OscillatorNode(ctx, 
    { type: 'square'
    , detune: 0
    })

  const filter = ctx.createBiquadFilter()
  const distortion = ctx.createWaveShaper()

  filter.type = 'lowpass'
  osc.connect(distortion)
  distortion.connect(filter)
  filter.connect(ctx.destination)
  osc.output = filter;
  return osc
}


const hat = (ctx) => {
  const osc = new OscillatorNode(ctx, 
    { type: 'triangle'
    , detune: 0
    })

  const filter = ctx.createBiquadFilter()
  const distortion = ctx.createWaveShaper()
  filter.type = 'highpass'
  osc.connect(distortion)
  distortion.connect(filter)
  filter.connect(ctx.destination)
  osc.output = filter;
  return osc;
}


export const play = (osc, notes, loop = true) => {
  const now = osc.context.currentTime
	notes.forEach(([freq, len], i) => 
  osc.frequency.setValueAtTime(freq, now + qn * i))

  if ( ! osc.started) {
    osc.start(0); 
    osc.started = true
  }
	osc.connect(osc.context.destination)
  loop && (setTimeout(() => play(osc, notes, loop), 1000 * qn * notes.length))
}


export const metronome = () => {
	const ctx = new AudioContext()

	play(kick(ctx), tenuto(onbeat((on) => on * 82)), true)
  play(hat(ctx), short(offbeat((on) => on * (82 * 128))), true)

	return function stop() {
		ctx.close()
	}
}