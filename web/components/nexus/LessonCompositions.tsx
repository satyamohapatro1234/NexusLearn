'use client'

/**
 * NexusLearn Lesson Composition Components
 * Each slide type is a Remotion Sequence that animates over its durationFrames.
 * 
 * Renders inside <Player> which takes the full LessonConfig and plays it through.
 */

import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  AbsoluteFill,
  Sequence,
} from 'remotion'
import type {
  LessonConfig,
  TitleSlide,
  ConceptSlide,
  CodeSlide,
  QuizSlide,
  SummarySlide,
  CaptionWord,
} from '@/lib/lessonConfig'

// ── Design tokens ─────────────────────────────────────────────────────────────
const COLORS = {
  bg: '#0f172a',          // slate-900
  surface: '#1e293b',     // slate-800
  surfaceHover: '#334155', // slate-700
  indigo: '#6366f1',
  indigoLight: '#818cf8',
  green: '#22c55e',
  yellow: '#fbbf24',
  red: '#f87171',
  text: '#f1f5f9',
  textMuted: '#94a3b8',
  code: '#1e293b',
  codeBorder: '#334155',
}

const FONT = `'Inter', 'Segoe UI', system-ui, sans-serif`
const CODE_FONT = `'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace`

// ── Helpers ───────────────────────────────────────────────────────────────────
function fadeIn(frame: number, start = 0, duration = 15): number {
  return interpolate(frame, [start, start + duration], [0, 1], { extrapolateRight: 'clamp' })
}

function slideUp(frame: number, fps: number, start = 0, delay = 0): number {
  return spring({ fps, frame: frame - start - delay, config: { damping: 18, stiffness: 120 } })
}

// ── TitleCard ─────────────────────────────────────────────────────────────────
export function TitleCard({ slide }: { slide: TitleSlide }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const opacity = fadeIn(frame)
  const scale = interpolate(frame, [0, 20], [0.92, 1], { extrapolateRight: 'clamp' })
  const emojiScale = spring({ fps, frame, config: { damping: 12, stiffness: 100 } })

  return (
    <AbsoluteFill style={{ background: COLORS.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
      {/* Glow blob */}
      <div style={{
        position: 'absolute', width: 600, height: 600,
        background: `radial-gradient(circle, ${COLORS.indigo}22 0%, transparent 70%)`,
        top: '50%', left: '50%', transform: 'translate(-50%, -60%)',
      }} />

      {/* Emoji */}
      {slide.emoji && (
        <div style={{
          fontSize: 96, opacity, transform: `scale(${emojiScale})`,
          marginBottom: 24, filter: 'drop-shadow(0 0 24px rgba(99,102,241,0.4))',
        }}>
          {slide.emoji}
        </div>
      )}

      {/* Title */}
      <div style={{
        fontSize: 72, fontWeight: 800, color: COLORS.text,
        opacity, transform: `scale(${scale})`, textAlign: 'center',
        letterSpacing: '-2px', lineHeight: 1.1,
        background: `linear-gradient(135deg, ${COLORS.text}, ${COLORS.indigoLight})`,
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        maxWidth: '80%',
      }}>
        {slide.title}
      </div>

      {/* Subtitle */}
      {slide.subtitle && (
        <div style={{
          fontSize: 28, color: COLORS.textMuted, opacity: fadeIn(frame, 15),
          marginTop: 20, textAlign: 'center', maxWidth: '60%',
        }}>
          {slide.subtitle}
        </div>
      )}

      {/* Bottom bar */}
      <div style={{
        position: 'absolute', bottom: 40,
        width: interpolate(frame, [10, 40], [0, 200], { extrapolateRight: 'clamp' }),
        height: 3, background: `linear-gradient(90deg, ${COLORS.indigo}, ${COLORS.indigoLight})`,
        borderRadius: 3,
      }} />
    </AbsoluteFill>
  )
}

// ── ConceptSlide ──────────────────────────────────────────────────────────────
export function ConceptSlideComp({ slide }: { slide: ConceptSlide }) {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const revealInterval = Math.floor(durationInFrames / (slide.points.length + 2))

  return (
    <AbsoluteFill style={{
      background: COLORS.bg, fontFamily: FONT, padding: '60px 80px',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Heading */}
      <div style={{
        fontSize: 52, fontWeight: 700, color: COLORS.text,
        opacity: fadeIn(frame), borderLeft: `4px solid ${COLORS.indigo}`,
        paddingLeft: 24, marginBottom: 48, lineHeight: 1.2,
      }}>
        {slide.heading}
      </div>

      {/* Points revealed one by one */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
        {slide.points.map((point, i) => {
          const revealFrame = (i + 1) * revealInterval
          const opacity = fadeIn(frame, revealFrame)
          const x = interpolate(frame, [revealFrame, revealFrame + 15], [-30, 0], { extrapolateRight: 'clamp' })
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 20,
              opacity, transform: `translateX(${x}px)`,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: COLORS.indigo, color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 700, flexShrink: 0, marginTop: 4,
              }}>
                {i + 1}
              </div>
              <div style={{ fontSize: 30, color: COLORS.text, lineHeight: 1.5 }}>{point}</div>
            </div>
          )
        })}
      </div>

      {/* Analogy callout */}
      {slide.analogy && (
        <div style={{
          opacity: fadeIn(frame, (slide.points.length + 1) * revealInterval),
          background: `${COLORS.indigo}22`, border: `1px solid ${COLORS.indigo}44`,
          borderRadius: 16, padding: '20px 28px', marginTop: 24,
        }}>
          <span style={{ color: COLORS.indigoLight, fontWeight: 600, fontSize: 22 }}>
            💡 Think of it like:{' '}
          </span>
          <span style={{ color: COLORS.text, fontSize: 22 }}>{slide.analogy}</span>
        </div>
      )}
    </AbsoluteFill>
  )
}

// ── CodeTypewriter ────────────────────────────────────────────────────────────
export function CodeTypewriterComp({ slide }: { slide: CodeSlide }) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()

  const lines = slide.code.split('\n')
  // How many characters to show total at current frame
  const totalChars = slide.code.length
  const charsToShow = Math.floor(
    interpolate(frame, [10, Math.floor(durationInFrames * 0.75)], [0, totalChars], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    })
  )

  // Build visible code char by char
  let visible = slide.code.slice(0, charsToShow)

  // Cursor blink
  const cursorVisible = frame % 20 < 12 && charsToShow < totalChars
  if (cursorVisible) visible += '▋'

  const explainOpacity = fadeIn(frame, Math.floor(durationInFrames * 0.7))

  return (
    <AbsoluteFill style={{
      background: COLORS.bg, fontFamily: FONT, padding: '48px 64px',
      display: 'flex', flexDirection: 'column', gap: 24,
    }}>
      {/* Language badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          background: COLORS.indigo, color: 'white', fontSize: 16, fontWeight: 700,
          padding: '4px 16px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: 1,
        }}>
          {slide.language}
        </div>
        <div style={{ color: COLORS.textMuted, fontSize: 20 }}>Teacher writes...</div>
      </div>

      {/* Code block */}
      <div style={{
        background: COLORS.code, border: `1px solid ${COLORS.codeBorder}`,
        borderRadius: 16, padding: '28px 32px', flex: 1, overflow: 'hidden',
      }}>
        <pre style={{
          fontFamily: CODE_FONT, fontSize: 26, color: COLORS.text,
          margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.7,
        }}>
          {visible}
        </pre>
      </div>

      {/* Explanation banner */}
      <div style={{
        opacity: explainOpacity,
        background: `${COLORS.green}22`, border: `1px solid ${COLORS.green}44`,
        borderRadius: 12, padding: '16px 24px',
        color: COLORS.text, fontSize: 24, lineHeight: 1.4,
      }}>
        <span style={{ color: COLORS.green, fontWeight: 700 }}>✓ </span>
        {slide.explanation}
      </div>
    </AbsoluteFill>
  )
}

// ── QuizSlide ─────────────────────────────────────────────────────────────────
export function QuizSlideComp({ slide, showAnswer }: { slide: QuizSlide; showAnswer?: boolean }) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  // Show answer at 60% of duration
  const answerFrame = Math.floor(durationInFrames * 0.6)
  const revealing = frame >= answerFrame

  return (
    <AbsoluteFill style={{
      background: COLORS.bg, fontFamily: FONT, padding: '60px 80px',
      display: 'flex', flexDirection: 'column', gap: 32,
    }}>
      {/* Question */}
      <div style={{ fontSize: 36, fontWeight: 700, color: COLORS.text, opacity: fadeIn(frame), lineHeight: 1.4 }}>
        ❓ {slide.question}
      </div>

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
        {slide.options.map((opt, i) => {
          const revealFrame = i * 15 + 10
          const isCorrect = i === slide.correctIndex
          const bgColor = revealing && isCorrect ? `${COLORS.green}33`
            : revealing && !isCorrect ? `${COLORS.red}11`
            : COLORS.surface
          const borderColor = revealing && isCorrect ? COLORS.green
            : revealing && !isCorrect ? `${COLORS.red}33`
            : COLORS.surfaceHover

          return (
            <div key={i} style={{
              opacity: fadeIn(frame, revealFrame),
              transform: `translateX(${interpolate(frame, [revealFrame, revealFrame + 15], [-20, 0], { extrapolateRight: 'clamp' })}px)`,
              background: bgColor, border: `2px solid ${borderColor}`,
              borderRadius: 12, padding: '18px 24px',
              display: 'flex', alignItems: 'center', gap: 16,
              transition: 'all 0.3s',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: revealing && isCorrect ? COLORS.green : COLORS.indigo,
                color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 18, flexShrink: 0,
              }}>
                {String.fromCharCode(65 + i)}
              </div>
              <div style={{ fontSize: 26, color: COLORS.text }}>{opt}</div>
              {revealing && isCorrect && (
                <div style={{ marginLeft: 'auto', color: COLORS.green, fontSize: 24, fontWeight: 700 }}>✓</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Explanation */}
      {revealing && (
        <div style={{
          opacity: fadeIn(frame, answerFrame),
          background: `${COLORS.yellow}22`, border: `1px solid ${COLORS.yellow}44`,
          borderRadius: 12, padding: '16px 24px',
          color: COLORS.text, fontSize: 22, lineHeight: 1.4,
        }}>
          <span style={{ color: COLORS.yellow, fontWeight: 700 }}>💡 </span>
          {slide.explanation}
        </div>
      )}
    </AbsoluteFill>
  )
}

// ── SummarySlide ──────────────────────────────────────────────────────────────
export function SummarySlideComp({ slide }: { slide: SummarySlide }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const scale = spring({ fps, frame, config: { damping: 18, stiffness: 100 } })

  return (
    <AbsoluteFill style={{
      background: COLORS.bg, fontFamily: FONT, padding: '60px 80px',
      display: 'flex', flexDirection: 'column', gap: 32,
    }}>
      <div style={{
        fontSize: 56, fontWeight: 800, color: COLORS.text,
        opacity: fadeIn(frame), transform: `scale(${scale})`, textAlign: 'center',
        background: `linear-gradient(135deg, ${COLORS.green}, ${COLORS.indigoLight})`,
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
      }}>
        🎯 {slide.title}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
        {slide.keyPoints.map((pt, i) => (
          <div key={i} style={{
            opacity: fadeIn(frame, (i + 1) * 15),
            transform: `translateX(${interpolate(frame, [(i + 1) * 15, (i + 1) * 15 + 15], [-20, 0], { extrapolateRight: 'clamp' })}px)`,
            display: 'flex', alignItems: 'center', gap: 16,
            fontSize: 28, color: COLORS.text,
          }}>
            <span style={{ color: COLORS.green, fontSize: 24 }}>✓</span> {pt}
          </div>
        ))}
      </div>

      {slide.nextStep && (
        <div style={{
          opacity: fadeIn(frame, slide.keyPoints.length * 15 + 20),
          background: `${COLORS.indigo}33`, border: `1px solid ${COLORS.indigo}66`,
          borderRadius: 16, padding: '20px 28px',
          fontSize: 24, color: COLORS.indigoLight,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 28 }}>→</span>
          <strong>Next: </strong>{slide.nextStep}
        </div>
      )}
    </AbsoluteFill>
  )
}

// ── TikTok-style captions ─────────────────────────────────────────────────────
export function TikTokCaptions({
  captions,
  currentTimeMs,
}: {
  captions: CaptionWord[]
  currentTimeMs: number
}) {
  if (!captions.length) return null

  // Find currently spoken word
  const activeIdx = captions.findIndex(
    (w) => currentTimeMs >= w.startMs && currentTimeMs <= w.endMs
  )

  // Show a window of words around the active one
  const windowStart = Math.max(0, activeIdx - 2)
  const windowEnd = Math.min(captions.length, activeIdx + 8)
  const visible = captions.slice(windowStart, windowEnd)

  return (
    <div style={{
      position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center',
      maxWidth: '80%',
    }}>
      {visible.map((word, i) => {
        const globalIdx = windowStart + i
        const isActive = globalIdx === activeIdx
        const isPast = globalIdx < activeIdx

        return (
          <span key={globalIdx} style={{
            fontSize: 32, fontFamily: FONT, fontWeight: isActive ? 800 : 500,
            color: isActive ? COLORS.yellow : isPast ? COLORS.textMuted : COLORS.text,
            background: isActive ? `${COLORS.yellow}22` : 'transparent',
            borderRadius: 8, padding: '2px 8px',
            transition: 'all 0.1s',
            transform: isActive ? 'scale(1.1)' : 'scale(1)',
            display: 'inline-block',
            textShadow: '0 2px 8px rgba(0,0,0,0.8)',
          }}>
            {word.text}
          </span>
        )
      })}
    </div>
  )
}

// ── Master LessonComposition ──────────────────────────────────────────────────
export function LessonComposition({ config }: { config: LessonConfig }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const currentTimeMs = (frame / fps) * 1000

  let offset = 0

  return (
    <>
      {config.slides.map((slide, i) => {
        const duration = slide.durationFrames ?? 120
        const startAt = offset
        offset += duration

        return (
          <Sequence key={i} from={startAt} durationInFrames={duration}>
            {slide.type === 'title' && <TitleCard slide={slide} />}
            {slide.type === 'concept' && <ConceptSlideComp slide={slide} />}
            {slide.type === 'code' && <CodeTypewriterComp slide={slide} />}
            {slide.type === 'quiz' && <QuizSlideComp slide={slide} />}
            {slide.type === 'summary' && <SummarySlideComp slide={slide} />}

            {config.captions && (
              <TikTokCaptions captions={config.captions} currentTimeMs={currentTimeMs} />
            )}
          </Sequence>
        )
      })}
    </>
  )
}
