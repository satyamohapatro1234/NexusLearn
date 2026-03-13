'use client'

/**
 * VoiceTeacher — LiveKit voice session component
 * 
 * Full-duplex: student speaks → STT → Superintendent → VibeVoice → student hears
 * 
 * When LiveKit is running (docker run livekit/livekit-server --dev),
 * this replaces push-to-talk with a real voice conversation.
 * 
 * Graceful fallback: if LiveKit unavailable, shows a "Start Voice Session"
 * button that opens instructions rather than crashing.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Room,
  RoomEvent,
  Track,
  Participant,
  RemoteTrackPublication,
  RemoteParticipant,
  ConnectionState,
} from 'livekit-client'
import { Mic, MicOff, PhoneOff, Phone, Volume2, Loader2, WifiOff } from 'lucide-react'

interface VoiceTeacherProps {
  studentId?: string
  onTranscript?: (text: string) => void
  onTeacherSpeak?: (text: string, voice: string) => void
  className?: string
}

type SessionState = 'idle' | 'connecting' | 'connected' | 'error' | 'unavailable'

export default function VoiceTeacher({
  studentId = 'student_001',
  onTranscript,
  onTeacherSpeak,
  className = '',
}: VoiceTeacherProps) {
  const [state, setState] = useState<SessionState>('idle')
  const [isMicActive, setIsMicActive] = useState(false)
  const [isTeacherSpeaking, setIsTeacherSpeaking] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [roomName, setRoomName] = useState('')

  const roomRef = useRef<Room | null>(null)

  // ── Connect ──────────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    setState('connecting')

    try {
      // 1. Get token from our backend
      const res = await fetch('http://localhost:8001/api/v1/voice/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId }),
        signal: AbortSignal.timeout(5000),
      })
      const data = await res.json()

      if (data.error || !data.token) {
        setState('unavailable')
        setErrorMsg(data.message || 'LiveKit not available')
        return
      }

      setRoomName(data.room)

      // 2. Start teacher agent
      await fetch('http://localhost:8001/api/v1/voice/start-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, room_name: data.room }),
      }).catch(() => { /* best effort */ })

      // 3. Connect to LiveKit room
      const room = new Room({
        audioCaptureDefaults: {
          noiseSuppression: true,
          echoCancellation: true,
        },
      })
      roomRef.current = room

      // Teacher audio: when teacher speaks, detect and report
      room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
        if (track.kind === Track.Kind.Audio && participant.identity === 'teacher-agent') {
          const audio = new Audio()
          audio.srcObject = new MediaStream([track.mediaStreamTrack])
          audio.play().catch(() => {})
          setIsTeacherSpeaking(true)
          track.on('ended', () => setIsTeacherSpeaking(false))
        }
      })

      room.on(RoomEvent.TrackUnsubscribed, () => {
        setIsTeacherSpeaking(false)
      })

      room.on(RoomEvent.Disconnected, () => {
        setState('idle')
        setIsMicActive(false)
        setIsTeacherSpeaking(false)
      })

      room.on(RoomEvent.ConnectionStateChanged, (state) => {
        if (state === ConnectionState.Connected) {
          setState('connected')
        } else if (state === ConnectionState.Reconnecting) {
          setState('connecting')
        }
      })

      await room.connect(data.url, data.token)

      // Enable microphone
      await room.localParticipant.setMicrophoneEnabled(true)
      setIsMicActive(true)
      setState('connected')

    } catch (err: any) {
      setState('error')
      setErrorMsg(err.message || 'Connection failed')
      setTimeout(() => setState('idle'), 3000)
    }
  }, [studentId])

  // ── Disconnect ────────────────────────────────────────────────────────────
  const disconnect = useCallback(async () => {
    if (roomRef.current) {
      await roomRef.current.disconnect()
      roomRef.current = null
    }
    setState('idle')
    setIsMicActive(false)
    setIsTeacherSpeaking(false)
  }, [])

  // ── Toggle mic ────────────────────────────────────────────────────────────
  const toggleMic = useCallback(async () => {
    if (!roomRef.current) return
    const enabled = !isMicActive
    await roomRef.current.localParticipant.setMicrophoneEnabled(enabled)
    setIsMicActive(enabled)
  }, [isMicActive])

  // Cleanup on unmount
  useEffect(() => () => { roomRef.current?.disconnect() }, [])

  // ── Render ────────────────────────────────────────────────────────────────
  if (state === 'unavailable') {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-xl text-xs text-slate-500 ${className}`}>
        <WifiOff className="w-3 h-3 flex-shrink-0" />
        <span>Voice sessions require LiveKit. </span>
        <a
          href="https://docs.livekit.io/home/self-hosting/local/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-500 hover:underline"
        >
          Setup guide →
        </a>
      </div>
    )
  }

  if (state === 'idle') {
    return (
      <button
        onClick={connect}
        className={`flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-600 rounded-xl text-sm transition-all ${className}`}
        title="Start voice session with AI teacher"
      >
        <Phone className="w-4 h-4" />
        <span className="hidden sm:inline">Voice session</span>
      </button>
    )
  }

  if (state === 'connecting') {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-500 rounded-xl text-sm ${className}`}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Connecting...</span>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 bg-red-50 text-red-500 rounded-xl text-sm ${className}`}>
        <WifiOff className="w-4 h-4" />
        <span>{errorMsg || 'Connection failed'}</span>
      </div>
    )
  }

  // Connected state
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Teacher speaking indicator */}
      {isTeacherSpeaking && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 text-indigo-400 rounded-xl text-xs">
          <Volume2 className="w-3 h-3" />
          <div className="flex gap-0.5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="w-0.5 rounded-full bg-indigo-400"
                style={{
                  height: `${8 + (i * 4)}px`,
                  animation: `pulse ${0.4 + i * 0.1}s ease-in-out infinite alternate`,
                }}
              />
            ))}
          </div>
          <span>Teacher</span>
        </div>
      )}

      {/* Mic toggle */}
      <button
        onClick={toggleMic}
        title={isMicActive ? 'Mute mic' : 'Unmute mic'}
        className={`flex items-center justify-center w-9 h-9 rounded-xl transition-all ${
          isMicActive
            ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
            : 'bg-slate-200 text-slate-400 hover:bg-slate-300'
        }`}
      >
        {isMicActive ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
      </button>

      {/* Room badge */}
      <div className="text-xs text-slate-400 bg-green-50 text-green-600 px-2 py-1 rounded-lg">
        Live
      </div>

      {/* Hang up */}
      <button
        onClick={disconnect}
        title="End voice session"
        className="flex items-center justify-center w-9 h-9 rounded-xl bg-red-500 hover:bg-red-600 text-white transition-all"
      >
        <PhoneOff className="w-4 h-4" />
      </button>
    </div>
  )
}
