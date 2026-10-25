import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { BrandMark } from '../components/BrandMark.jsx'
import { ReportFragment, VoiceFragment, TrendFragment, KpiFragment } from '../components/landing/UIFragments.jsx'

// Marketing landing for Interview Ledger.
// Direction: "Type and nothing else" (dealt sheet, seed 71117485) with the
// product's own palette and Geist type kept. The page's pictures are real
// interface fragments of the app (data-ui), built from live-run data — the
// skill's imagery rule for software. No invented customers, quotes or stats:
// the proof section states real capabilities instead.

// ---- Motion: entrance on scroll (transform/opacity only, reduced-motion safe) ----
function useReveal() {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('is-revealed')
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed')
            observer.unobserve(entry.target)
          }
        }
      },
      { threshold: 0.18 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return ref
}

function Reveal({ as: Tag = 'div', className = '', delay = 0, children }) {
  const ref = useReveal()
  return (
    <Tag ref={ref} className={`reveal ${className}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </Tag>
  )
}

// Masked headline: each authored line rises from behind its own baseline.
function MaskedLines({ lines }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.querySelectorAll('.mask-line > span').forEach((s) => (s.style.transform = 'none'))
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          el.classList.add('mask-run')
          observer.disconnect()
        }
      },
      { threshold: 0.3 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return (
    <h1
      ref={ref}
      className="mask-headline text-[clamp(36px,10vw,96px)] font-medium leading-[0.95] tracking-[-0.04em] md:text-[clamp(56px,6.6vw,96px)]"
      aria-label={lines.join(' ')}
    >
      {lines.map((line, i) => (
        <span key={i} className="mask-line" aria-hidden="true">
          <span style={{ transitionDelay: `${i * 110}ms` }}>{line}</span>
        </span>
      ))}
    </h1>
  )
}

// Proof sentence: real capabilities, one phrase lit at a time.
const PROOF_PARTS = [
  'Ten technical topics,',
  'three AI engines: questions, voice and scoring,',
  'text and voice interviews,',
  'scored reports with model answers,',
  'free while in development.',
]

function ProofSentence() {
  const [lit, setLit] = useState(0)
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return
    const id = setInterval(() => setLit((n) => (n + 1) % PROOF_PARTS.length), 2200)
    return () => clearInterval(id)
  }, [])
  return (
    <p className="max-w-[1100px] text-[clamp(24px,3vw,36px)] leading-[1.12] tracking-[-0.02em]">
      {PROOF_PARTS.map((part, i) => (
        <span
          key={i}
          className={`transition-colors duration-[400ms] ${i === lit ? 'text-ink' : 'text-muted'}`}
        >
          {part}{' '}
        </span>
      ))}
    </p>
  )
}

const FAQ_ITEMS = [
  ['Is it really free?', 'Yes while in development. There is no card, no trial timer and no paywall on any feature described here.'],
  ['What topics are covered?', 'JavaScript, React, Node.js, TypeScript, data structures and algorithms, DBMS, system design, operating systems, networks and OOP — the core of technical placement drives.'],
  ['Who grades the answers?', 'An AI evaluator scores each answer out of 100 against a rubric for your experience level, and writes the feedback, strengths, improvements and a model answer. Every report labels it as AI feedback, not a hiring verdict.'],
  ['What happens to my voice?', 'Recordings are transcribed and discarded. Audio is never stored, and nothing is sent anywhere except the transcription service.'],
  ['Is the voice I hear a real person?', 'No. Questions are read by an AI voice, and the app says so wherever it plays. A plain browser voice is offered as a labelled fallback.'],
  ['Text or voice — which should I use?', 'Both run the same engine and produce the same report. Voice practises speaking under pressure; text is faster for drilling topics.'],
  ['Can it replace a real interview?', 'It is practice, not a hiring decision. The scores are a training signal — the report says exactly that, every time.'],
  ['Who built this?', 'Interview Ledger is built and maintained by Vinay Khatana as an open-source project.'],
]

export default function Landing() {
  const { user } = useAuth()

  return (
    <div id="top" className="bg-ground text-ink">
      <main>
      {/* Top row: wordmark, links on the axis, action at the right margin */}
      <header className="flex items-center justify-between px-6 py-6 md:px-12">
        <Link to="/" className="inline-flex items-center gap-2 font-medium">
          <BrandMark />
          Interview Ledger
        </Link>
        <nav aria-label="Landing" className="hidden items-center gap-7 text-base text-muted md:flex">
          <a href="#how" className="hover:text-ink">How it works</a>
          <a href="#features" className="hover:text-ink">Features</a>
          <a href="#faq" className="hover:text-ink">FAQ</a>
        </nav>
        <div className="flex items-center gap-5">
          {user ? (
            <Link
              to="/dashboard"
              className="inline-flex h-11 items-center rounded-[6px] bg-primary px-5 text-base font-medium text-white hover:opacity-90"
            >
              Open dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className="text-base text-ink underline-offset-4 hover:underline">
                Sign in
              </Link>
              <Link
                to="/register"
                className="inline-flex h-11 items-center rounded-[6px] bg-primary px-5 text-base font-medium text-white hover:opacity-90"
              >
                Start free
              </Link>
            </>
          )}
        </div>
      </header>

      {/* Hero: short void, then the statement on the axis */}
      <section className="relative flex min-h-[68svh] flex-col justify-end px-6 pb-14 md:px-12">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-0">
          <div className="flex items-end lg:col-span-4">
            <Reveal delay={500}>
              <p className="max-w-[32ch] text-lg leading-relaxed text-ink">
                AI mock interviews that grade every answer, in text or voice, with a full report each time. Free while in development.
              </p>
            </Reveal>
          </div>
          <div className="lg:col-span-8">
            <MaskedLines lines={['Walk in', 'already practised']} />
            <Reveal delay={700}>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <Link
                  to={user ? '/dashboard' : '/register'}
                  className="inline-flex h-12 items-center rounded-[6px] bg-primary px-6 text-base font-medium text-white hover:opacity-90"
                >
                  {user ? 'Open your dashboard' : 'Start practising free'}
                </Link>
                <a href="#how" className="text-base text-ink underline-offset-4 hover:underline">
                  See how it works
                </a>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Proof: real capabilities as one sentence, one phrase lit at a time */}
      <section className="bg-surface px-6 py-28 md:px-12">
        <Reveal>
          <ProofSentence />
        </Reveal>
      </section>

      {/* The product's own output, as the page's first picture */}
      <section className="px-6 pb-28 md:px-12">
        <Reveal>
          <ReportFragment />
        </Reveal>
        <Reveal>
          <p className="mt-4 max-w-[52ch] text-base text-muted">
            A real report from the app: per-question scores, the feedback text the evaluator wrote,
            and the topics it flagged for practice. Nothing here is staged.
          </p>
        </Reveal>
      </section>

      {/* How it works: the product's progress bar, enlarged */}
      <section id="how" className="scroll-mt-16 px-6 pb-28 md:px-12">
        <Reveal>
          <h2 className="max-w-[900px] text-[clamp(40px,6.4vw,96px)] font-medium leading-[0.98] tracking-[-0.03em]">
            From setup to score
          </h2>
        </Reveal>
        <Reveal delay={150}>
          <div
            data-ui
            className="mt-14 flex min-h-[22vh] flex-col gap-1.5 md:flex-row"
          >
            <div className="flex flex-col justify-start rounded-[8px] bg-raised p-5 md:w-[14%]">
              <p className="text-xl font-medium tnum">2 minutes</p>
              <p className="mt-auto pt-8 text-base text-muted">First, set the role, topics and difficulty.</p>
            </div>
            <div className="flex flex-col justify-start rounded-[8px] bg-ink p-5 text-white md:w-[56%]">
              <p className="text-xl font-medium tnum">About 20 minutes</p>
              <p className="mt-auto pt-8 text-base text-white/70">Then answer each question by text or voice, against the clock.</p>
            </div>
            <div className="flex flex-col justify-start rounded-[8px] bg-[#1d5fbf] p-5 text-white md:w-[30%]">
              <p className="text-xl font-medium tnum">Instantly</p>
              <p className="mt-auto pt-8 text-base text-white/80">Read the scored report and what to practise next.</p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Voice fragment as relief between type sections */}
      <section className="px-6 pb-28 md:px-12">
        <Reveal>
          <VoiceFragment />
        </Reveal>
        <Reveal>
          <p className="mt-4 max-w-[52ch] text-base text-muted">
            The voice workspace: the question plays in an AI voice, you answer out loud, and the
            recording is transcribed for review before anything is saved.
          </p>
        </Reveal>
      </section>

      {/* Features: light statement cell, dark rows */}
      <section id="features" className="scroll-mt-16">
        <div className="grid lg:grid-cols-2">
          <div className="flex flex-col justify-between bg-surface px-6 py-16 md:px-12 lg:min-h-[90svh]">
            <h2 className="text-[clamp(30px,4.2vw,56px)] font-medium leading-[1.02] tracking-[-0.03em]">
              <span className="block">Everything a candidate needs</span>
            </h2>
            <div className="mt-16 flex flex-wrap items-end justify-between gap-6 lg:mt-auto">
              <p className="max-w-[34ch] text-lg text-muted">
                One ledger for the whole placement season: practise, read the verdict, fix the weak topic, repeat.
              </p>
              <Link
                to="/register"
                className="inline-flex h-11 items-center rounded-[6px] bg-primary px-5 text-base font-medium text-white hover:opacity-90"
              >
                Create account
              </Link>
            </div>
          </div>
          <div className="bg-[#141414] text-white lg:min-h-[90svh]">
            {[
              ['AI question sets', 'Fresh, role-matched technical questions at your difficulty. No fixed question banks to memorise.', '10 topics · 3 difficulties · 3–10 questions'],
              ['Voice interviews', 'The question is read aloud, you answer out loud, and the recording is transcribed for review.', 'Speech to text · AI playback · Nothing stored'],
              ['Scored reports', 'Every answer graded 0–100 with correctness, feedback, strengths, improvements and a model answer.', 'Per-question · Overall mean · Labelled AI'],
              ['Practice suggestions', 'Weak topics are derived from your own scores, weakest first — not from a generic syllabus.', 'Topic averages · Weakest first · From real data'],
              ['Progress ledger', 'Completed interviews, best and average scores, and a trend of your last runs on one dashboard.', 'History · Trends · Report links'],
            ].map(([title, body, terms], i) => (
              <div key={title} className={`px-6 py-7 md:px-10 ${i % 2 === 0 ? 'bg-[#141414]' : 'bg-[#0f0f0f]'}`}>
                <h3 className="text-[22px] font-medium">{title}</h3>
                <p className="mt-2 max-w-[52ch] text-base leading-relaxed text-white/70">{body}</p>
                <p className="mt-3 text-base text-white/50">{terms}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trend fragment pair as the last picture */}
      <section className="px-6 py-28 md:px-12">
        <Reveal>
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <TrendFragment />
            <KpiFragment />
          </div>
        </Reveal>
        <Reveal>
          <p className="mt-4 max-w-[52ch] text-base text-muted">
            The dashboard ledger: best and average scores, every answered question counted once,
            and the trend of your last scored runs.
          </p>
        </Reveal>
      </section>

      {/* Roadmap: a short heading plus an honest statement */}
      <section className="px-6 pb-28 md:px-12">
        <Reveal>
          <h2 className="text-[28px] font-medium tracking-[-0.02em]">Next on the ledger</h2>
          <p className="mt-5 max-w-[900px] text-[clamp(20px,2.2vw,28px)] leading-[1.4] tracking-[-0.01em] text-ink">
            Saved voice answers with their own reports, interviewer-side analytics, learning
            material from topic providers, and a broader career platform beyond interviews.
          </p>
          <p className="mt-6 text-base text-muted">Planned, not promised. The open-source repo shows what ships and when.</p>
        </Reveal>
      </section>

      {/* FAQ: run-in reading text */}
      <section id="faq" className="scroll-mt-16 bg-surface px-6 py-24 md:px-12">
        <div className="grid gap-10 lg:grid-cols-12">
          <h2 className="text-[28px] font-medium lg:col-span-3">Questions</h2>
          <div className="columns-1 gap-14 text-base leading-[1.55] lg:col-span-9 lg:columns-2">
            {FAQ_ITEMS.map(([q, a]) => (
              <p key={q} className="mb-5 break-inside-avoid">
                <span className="font-medium text-ink">{q}</span>{' '}
                <span className="text-ink">{a}</span>
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* CTA: a sentence with a blank; the blank goes to the real sign-up */}
      <CtaWithBlank />

      </main>

      {/* Footer: name first, places under it */}
      <footer className="bg-[#141414] text-white">
        <div className="overflow-hidden px-6 pt-14 md:px-12">
          <p className="whitespace-nowrap text-[clamp(48px,9vw,150px)] font-medium leading-none tracking-[-0.04em] text-white/95">
            Interview Ledger
          </p>
        </div>
        <div className="grid gap-12 px-6 pb-16 pt-20 md:px-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <ul className="space-y-3 text-[clamp(22px,2.4vw,32px)] font-medium">
              <li>
                <a href="https://github.com/VinayKhatana12/Ai-Interview-Platform" target="_blank" rel="noreferrer" className="text-white underline-offset-4 hover:underline">
                  GitHub repository
                </a>
              </li>
              <li>
                <Link to={user ? '/dashboard' : '/register'} className="text-white underline-offset-4 hover:underline">
                  {user ? 'Open dashboard' : 'Start free'}
                </Link>
              </li>
              {!user && (
                <li>
                  <Link to="/login" className="text-white underline-offset-4 hover:underline">
                    Sign in
                  </Link>
                </li>
              )}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-10 text-base lg:col-span-7 lg:grid-cols-3">
            <div>
              <p className="text-white/50">Product</p>
              <ul className="mt-4 space-y-2.5">
                <li><a href="#how" className="text-white/80 hover:text-white">How it works</a></li>
                <li><a href="#features" className="text-white/80 hover:text-white">Features</a></li>
                <li><a href="#faq" className="text-white/80 hover:text-white">FAQ</a></li>
              </ul>
            </div>
            <div>
              <p className="text-white/50">The app</p>
              <ul className="mt-4 space-y-2.5">
                {user && <li><Link to="/dashboard" className="text-white/80 hover:text-white">Dashboard</Link></li>}
                <li><Link to="/register" className="text-white/80 hover:text-white">Create account</Link></li>
                <li><Link to="/login" className="text-white/80 hover:text-white">Sign in</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-white/50">Open source</p>
              <ul className="mt-4 space-y-2.5">
                <li>
                  <a href="https://github.com/VinayKhatana12/Ai-Interview-Platform" target="_blank" rel="noreferrer" className="text-white/80 hover:text-white">
                    Source code
                  </a>
                </li>
                <li>
                  <a href="https://github.com/VinayKhatana12/Ai-Interview-Platform/issues" target="_blank" rel="noreferrer" className="text-white/80 hover:text-white">
                    Issues and ideas
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-6 text-sm text-white/50 md:px-12">
          <p>© {new Date().getFullYear()} Vinay Khatana — built in the open.</p>
          <a href="#top" className="text-white/70 hover:text-white">
            Back to top
          </a>
        </div>
      </footer>
    </div>
  )
}

// CTA with the inline email blank; the submit hands off to the real register
// route with the email prefilled.
function CtaWithBlank() {
  const { user } = useAuth()
  const [email, setEmail] = useState('')
  function handleSubmit(e) {
    e.preventDefault()
    const target = email.trim() ? `/register?email=${encodeURIComponent(email.trim())}` : '/register'
    window.location.assign(target)
  }
  return (
    <section className="px-6 py-32 md:px-12">
      {user ? (
        <div>
          <p className="max-w-[1100px] text-[clamp(30px,4.6vw,56px)] font-medium leading-[1.08] tracking-[-0.03em]">
            Your ledger is open. Next entry is yours.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              to="/dashboard"
              className="inline-flex h-12 items-center rounded-[6px] bg-primary px-6 text-base font-medium text-white hover:opacity-90"
            >
              Open dashboard
            </Link>
            <p className="text-base text-muted">Every finished interview lands in your history and analytics.</p>
          </div>
        </div>
      ) : (
      <form onSubmit={handleSubmit}>
        <label htmlFor="cta-email" className="sr-only">
          Your email
        </label>
        <p className="max-w-[1100px] text-[clamp(24px,4.6vw,56px)] font-medium leading-[1.08] tracking-[-0.03em]">
          Start your ledger before{' '}
          <input
            id="cta-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email"
            className="mx-1 inline-block h-[1.15em] w-[7em] rounded-[6px] bg-raised px-3 align-baseline font-normal text-ink placeholder:text-muted/70 focus:outline-2 focus:outline-ink"
          />{' '}
          season starts.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <button
            type="submit"
            className="inline-flex h-12 items-center rounded-[6px] bg-primary px-6 text-base font-medium text-white hover:opacity-90"
          >
            Create free account
          </button>
          <p className="text-base text-muted">Free while in development. No card, no spam. The email just pre-fills your sign-up.</p>
        </div>
      </form>
      )}
    </section>
  )
}
