const bpm = 128


//# Rhythms


const id = x => x


const double = (f = id) =>
  ([1, 1]).map(f)


const onbeat = (f = id) =>
  ([1, 0]).map(f)


const offbeat = (f = id) =>
  ([0, 1]).map(f)


const silent = (f = id) => 
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


const schedule = (osc, freq, when, length = 1) => {
  osc.frequency.setValueAtTime(freq, when)
  osc.frequency.setValueAtTime(freq, when + (length * 0.98))
  osc.frequency.linearRampToValueAtTime(0, when + (length * 0.98))
}


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


const play = (make, notes, loop = true) => {
	console.log('play')
	const osc = make()
	console.log('args',osc, notes, loop)
  const now = osc.context.currentTime
	const duration = 60/bpm

	notes.forEach(([freq, len], i, list) => 
    schedule(osc, freq, now + (duration * i), len))

	osc.start(0)
	osc.connect(osc.context.destination)
	osc.stop(now + (duration * notes.length))
	osc.onended = loop ? () => play(make, notes, loop) : _=> osc.dicsonnect(osc.context.destination)
}


export const metronome = () => {
	const ctx = new AudioContext()
	console.log(tenuto(onbeat((on) => on * 82)))
	play(_ => kick(ctx), tenuto(onbeat((on) => on * 82)), true)
  play(_ => hat(ctx), short(offbeat((on) => on * (82 * 128))), true)

	return function stop() {
		ctx.close()
	}
}


metronome()