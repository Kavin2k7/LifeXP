import { useEffect, useRef, useState } from 'react'
import { Check, RotateCcw, Sparkles } from 'lucide-react'

const shuffle = (values) => [...values].sort(() => Math.random() - 0.5)

export function MemoryGame({ onFinish }) {
  const [cards, setCards] = useState(() => shuffle(['✦', '◆', '●', '▲', '✦', '◆', '●', '▲']).map((value, id) => ({ id, value, flipped: false, matched: false })))
  const [moves, setMoves] = useState(0)
  const [locked, setLocked] = useState(false)
  const started = useRef(Date.now())
  const completed = useRef(false)
  function flip(id) {
    if (locked || cards[id].flipped || cards[id].matched || completed.current) return
    const visible = cards.map((card) => card.id === id ? { ...card, flipped: true } : card)
    const open = visible.filter((card) => card.flipped && !card.matched)
    setCards(visible)
    if (open.length === 2) {
      setMoves((value) => value + 1)
      if (open[0].value === open[1].value) setCards((items) => items.map((card) => open.some((item) => item.id === card.id) ? { ...card, matched: true } : card))
      else {
        setLocked(true)
        window.setTimeout(() => { setCards((items) => items.map((card) => open.some((item) => item.id === card.id) ? { ...card, flipped: false } : card)); setLocked(false) }, 700)
      }
    }
  }
  useEffect(() => {
    if (!completed.current && cards.every((card) => card.matched)) {
      completed.current = true
      const elapsedSeconds = Math.max(1, Math.round((Date.now() - started.current) / 1000))
      onFinish({ moves, elapsedSeconds })
    }
  }, [cards, moves, onFinish])
  function restart() { completed.current = false; setMoves(0); setLocked(false); started.current = Date.now(); setCards(shuffle(['✦', '◆', '●', '▲', '✦', '◆', '●', '▲']).map((value, id) => ({ id, value, flipped: false, matched: false }))) }
  return <div className="mini-game"><div className="game-score-line"><span>Moves <b>{moves}</b></span>{completed.current && <span className="game-won"><Check size={16} /> All pairs matched!</span>}<button className="btn btn-quiet btn-sm" onClick={restart}><RotateCcw size={15} /> Restart</button></div><div className="memory-grid">{cards.map((card) => <button key={card.id} className={`memory-card ${card.flipped || card.matched ? 'revealed' : ''} ${card.matched ? 'matched' : ''}`} onClick={() => flip(card.id)} aria-label={card.flipped || card.matched ? card.value : 'Flip card'}>{card.flipped || card.matched ? card.value : <Sparkles size={20} />}</button>)}</div><p className="game-instructions">Flip two cards at a time to find all four matching pairs.</p></div>
}

export function ReactionGame({ onFinish }) {
  const [state, setState] = useState('idle')
  const [result, setResult] = useState(null)
  const timeout = useRef(null)
  const startTime = useRef(0)
  useEffect(() => () => window.clearTimeout(timeout.current), [])
  function start() {
    setResult(null); setState('waiting')
    timeout.current = window.setTimeout(() => { startTime.current = performance.now(); setState('ready') }, 1800 + Math.random() * 2600)
  }
  function click() {
    if (state === 'waiting') { window.clearTimeout(timeout.current); setState('early'); return }
    if (state === 'ready') {
      const milliseconds = Math.round(performance.now() - startTime.current)
      setResult(milliseconds); setState('done'); onFinish({ milliseconds })
    }
  }
  return <div className="mini-game"><button className={`reaction-zone ${state}`} onClick={state === 'idle' || state === 'early' || state === 'done' ? start : click} aria-label={state === 'ready' ? 'Click now' : 'Start reaction test'}><strong>{state === 'idle' ? 'Tap to start' : state === 'waiting' ? 'Wait for green…' : state === 'ready' ? 'CLICK!' : state === 'early' ? 'Too soon!' : `${result} ms`}</strong><span>{state === 'ready' ? 'Tap now' : state === 'waiting' ? 'Stay ready' : state === 'early' ? 'Tap to try again' : state === 'done' ? 'Tap for another round' : 'A signal will appear after a short delay'}</span></button>{state === 'early' && <p className="game-instructions">You clicked before the signal. Take a breath and try again.</p>}{state === 'done' && <p className="game-instructions">Your reaction time: <b>{result} ms</b>. A typical visual reaction is around 200–300 ms.</p>}</div>
}

export function GuessGame({ onFinish }) {
  const [target, setTarget] = useState(() => Math.floor(Math.random() * 100) + 1)
  const [guess, setGuess] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [hint, setHint] = useState('Pick a number from 1 to 100.')
  const [won, setWon] = useState(false)
  function submit(e) {
    e.preventDefault()
    const number = Number(guess)
    if (!Number.isInteger(number) || number < 1 || number > 100 || won) return
    const count = attempts + 1; setAttempts(count); setGuess('')
    if (number === target) { setWon(true); setHint(`You got it in ${count} ${count === 1 ? 'guess' : 'guesses'}!`); onFinish({ attempts: count }) }
    else setHint(number < target ? 'Higher! Try a bigger number.' : 'Lower! Try a smaller number.')
  }
  function restart() { setTarget(Math.floor(Math.random() * 100) + 1); setGuess(''); setAttempts(0); setHint('Pick a number from 1 to 100.'); setWon(false) }
  return <div className="mini-game guess-game"><span className="guess-range">THE SECRET NUMBER IS BETWEEN <b>1 — 100</b></span><div className={`guess-hint ${won ? 'won' : ''}`}>{hint}</div><form className="guess-form" onSubmit={submit}><input type="number" min="1" max="100" required disabled={won} value={guess} onChange={(e) => setGuess(e.target.value)} placeholder="Your guess" aria-label="Your number guess" /><button className="btn btn-primary" disabled={won}>Guess</button></form><div className="game-score-line"><span>Guesses <b>{attempts}</b></span>{won && <button className="btn btn-quiet btn-sm" onClick={restart}><RotateCcw size={15} /> Play again</button>}</div></div>
}
