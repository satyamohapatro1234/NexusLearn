'use client'

/**
 * LessonVideo — Remotion Player wrapper
 * 
 * Renders an animated lesson video inline in the chat.
 * Used when the Guide agent returns content_type: "html_lesson" or "remotion".
 * 
 * Props:
 *   config  — LessonConfig from Guide agent (or generated from markdown)
 *   onEnd   — called when video finishes (triggers quiz agent)
 */

import { useEffect, useRef, useState } from 'react'
import { Player, type PlayerRef, type CallbackListener } from '@remotion/player'
import type { LessonConfig } from '@/lib/lessonConfig'
import { defaultLessonConfig } from '@/lib/lessonConfig'
import { LessonComposition } from './LessonCompositions'
import { Play, Pause, RotateCcw, ChevronRight } from 'lucide-react'

interface LessonVideoProps {
  topic: string
  title: string
  config?: LessonConfig | null
  onEnd?: () => void
  onSkip?: () => void
  className?: string
}

export default function LessonVideo({
  topic,
  title,
  config,
  onEnd,
  onSkip,
  className = '',
}: LessonVideoProps) {
  const playerRef = useRef<PlayerRef>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [ended, setEnded] = useState(false)

  const lessonConfig = config ?? defaultLessonConfig(topic, title)

  // Calculate total duration from slides
  const totalFrames = lessonConfig.slides.reduce(
    (acc, slide) => acc + (slide.durationFrames ?? 120),
    0
  )

  const progressPct = totalFrames > 0 ? (currentFrame / totalFrames) * 100 : 0

  useEffect(() => {
    const player = playerRef.current
    if (!player) return

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onEnded = () => {
      setIsPlaying(false)
      setEnded(true)
      onEnd?.()
    }
    const onFrame: CallbackListener<'frameupdate'> = ({ detail }) => {
      setCurrentFrame(detail.frame)
    }

    player.addEventListener('play', onPlay)
    player.addEventListener('pause', onPause)
    player.addEventListener('ended', onEnded)
    player.addEventListener('frameupdate', onFrame)

    return () => {
      player.removeEventListener('play', onPlay)
      player.removeEventListener('pause', onPause)
      player.removeEventListener('ended', onEnded)
      player.removeEventListener('frameupdate', onFrame)
    }
  }, [onEnd])

  const togglePlay = () => {
    if (!playerRef.current) return
    if (ended) {
      playerRef.current.seekTo(0)
      setEnded(false)
      playerRef.current.play()
    } else if (isPlaying) {
      playerRef.current.pause()
    } else {
      playerRef.current.play()
    }
  }

  const restart = () => {
    playerRef.current?.seekTo(0)
    setEnded(false)
    playerRef.current?.play()
  }

  return (
    <div className={`rounded-2xl overflow-hidden bg-slate-900 border border-slate-700 shadow-xl ${className}`}>
      {/* Lesson header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          <span className="text-sm font-medium text-slate-200">{title}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">
            {Math.ceil(totalFrames / (lessonConfig.fps || 30))}s
          </span>
          <span>{lessonConfig.slides.length} slides</span>
        </div>
      </div>

      {/* Remotion Player */}
      <div className="relative">
        <Player
          ref={playerRef}
          component={LessonComposition as any}
          inputProps={{ config: lessonConfig }}
          durationInFrames={Math.max(totalFrames, 1)}
          compositionWidth={1280}
          compositionHeight={720}
          fps={lessonConfig.fps || 30}
          style={{ width: '100%', aspectRatio: '16/9' }}
          controls={false}
          showVolumeControls={false}
          clickToPlay={false}
        />

        {/* Ended overlay */}
        {ended && (
          <div className="absolute inset-0 bg-slate-900/80 flex flex-col items-center justify-center gap-4">
            <div className="text-5xl">🎉</div>
            <div className="text-white text-xl font-semibold">Lesson complete!</div>
            <div className="flex gap-3">
              <button onClick={restart} className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-slate-200 rounded-xl hover:bg-slate-600 text-sm">
                <RotateCcw className="w-4 h-4" /> Watch again
              </button>
              {onSkip && (
                <button onClick={onSkip} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 text-sm">
                  Try a quiz <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Progress bar + controls */}
      <div className="px-4 py-3 bg-slate-800/80">
        {/* Progress */}
        <div className="w-full h-1.5 bg-slate-700 rounded-full mb-3 cursor-pointer"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const x = (e.clientX - rect.left) / rect.width
            playerRef.current?.seekTo(Math.floor(x * totalFrames))
          }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${progressPct}%`,
              background: 'linear-gradient(90deg, #6366f1, #818cf8)',
            }}
          />
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          <button onClick={togglePlay}
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            {ended ? (
              <RotateCcw className="w-4 h-4" />
            ) : isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4 ml-0.5" />
            )}
          </button>

          <span className="text-xs text-slate-400 tabular-nums">
            {Math.floor(currentFrame / (lessonConfig.fps || 30))}s / {Math.ceil(totalFrames / (lessonConfig.fps || 30))}s
          </span>

          {onSkip && !ended && (
            <button onClick={onSkip} className="ml-auto flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors">
              Skip to quiz <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
