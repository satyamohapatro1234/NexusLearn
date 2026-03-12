/**
 * NexusLearn TTS Client
 * 
 * Connects to VibeVoice service (ws://localhost:8195/tts/stream).
 * Falls back to browser SpeechSynthesis if service is unavailable.
 * 
 * Usage:
 *   const tts = new TTSClient()
 *   await tts.speak("Recursion is when a function calls itself", "guide")
 *   tts.stop()
 */

const TTS_WS_URL = process.env.NEXT_PUBLIC_TTS_URL || 'ws://localhost:8195/tts/stream'
const SAMPLE_RATE = 24000

export type AgentVoice =
  | 'guide'      // Emma — warm teacher
  | 'question'   // Grace — encouraging quizzes
  | 'solve'      // Carter — energetic coding
  | 'research'   // Frank — calm explanations
  | 'chat'       // Davis — casual
  | 'ideagen'    // Grace — creative
  | 'co_writer'  // Mike — patient
  | 'emma' | 'grace' | 'carter' | 'frank' | 'davis' | 'mike' | 'samuel'

export interface TTSOptions {
  onStart?: () => void
  onChunk?: (chunkNumber: number) => void
  onEnd?: () => void
  onError?: (error: string) => void
  onFallback?: () => void  // called when falling back to browser TTS
}

export class TTSClient {
  private ws: WebSocket | null = null
  private audioCtx: AudioContext | null = null
  private sourceNodes: AudioBufferSourceNode[] = []
  private isPlaying = false
  private nextStartTime = 0
  private vibeVoiceAvailable: boolean | null = null  // null = not yet checked

  constructor() {
    if (typeof window !== 'undefined') {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
  }

  /** Check once if VibeVoice service is running */
  private async checkAvailability(): Promise<boolean> {
    if (this.vibeVoiceAvailable !== null) return this.vibeVoiceAvailable
    try {
      const res = await fetch('http://localhost:8195/health', { signal: AbortSignal.timeout(2000) })
      const data = await res.json()
      this.vibeVoiceAvailable = data.status === 'ready'
    } catch {
      this.vibeVoiceAvailable = false
    }
    return this.vibeVoiceAvailable
  }

  /** Main method: speak text with a given agent voice */
  async speak(text: string, voice: AgentVoice = 'guide', opts: TTSOptions = {}): Promise<void> {
    if (!text.trim()) return
    this.stop()

    const available = await this.checkAvailability()

    if (!available) {
      opts.onFallback?.()
      return this.speakBrowser(text, opts)
    }

    return this.speakVibeVoice(text, voice, opts)
  }

  /** VibeVoice streaming speech */
  private async speakVibeVoice(text: string, voice: AgentVoice, opts: TTSOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.audioCtx) return reject(new Error('No AudioContext'))

      this.ws = new WebSocket(TTS_WS_URL)
      this.ws.binaryType = 'arraybuffer'
      this.isPlaying = true
      this.nextStartTime = this.audioCtx.currentTime + 0.05  // tiny buffer before first chunk
      let chunkCount = 0

      this.ws.onopen = () => {
        this.ws!.send(JSON.stringify({ text, voice }))
        opts.onStart?.()
      }

      this.ws.onmessage = async (event: MessageEvent) => {
        // Check for END signal
        if (event.data instanceof ArrayBuffer && event.data.byteLength === 3) {
          const view = new Uint8Array(event.data)
          if (view[0] === 69 && view[1] === 78 && view[2] === 68) {  // "END"
            this.ws?.close()
            return
          }
        }

        if (event.data instanceof ArrayBuffer) {
          await this.scheduleAudioChunk(event.data)
          chunkCount++
          opts.onChunk?.(chunkCount)
        } else if (typeof event.data === 'string') {
          const msg = JSON.parse(event.data)
          if (msg.error) {
            // VibeVoice error — fall back to browser
            this.vibeVoiceAvailable = false
            opts.onFallback?.()
            this.speakBrowser(text, opts).then(resolve).catch(reject)
          }
        }
      }

      this.ws.onclose = () => {
        this.isPlaying = false
        opts.onEnd?.()
        resolve()
      }

      this.ws.onerror = (e) => {
        this.vibeVoiceAvailable = false
        opts.onFallback?.()
        this.speakBrowser(text, opts).then(resolve).catch(reject)
      }
    })
  }

  /** Schedule a raw float32 audio chunk for seamless playback */
  private async scheduleAudioChunk(arrayBuffer: ArrayBuffer): Promise<void> {
    if (!this.audioCtx) return

    // VibeVoice outputs float32 at 24kHz
    const float32Array = new Float32Array(arrayBuffer)
    const audioBuffer = this.audioCtx.createBuffer(1, float32Array.length, SAMPLE_RATE)
    audioBuffer.copyToChannel(float32Array, 0)

    const source = this.audioCtx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(this.audioCtx.destination)

    // Chain chunks seamlessly: each starts exactly when the previous ends
    const startAt = Math.max(this.audioCtx.currentTime, this.nextStartTime)
    source.start(startAt)
    this.nextStartTime = startAt + audioBuffer.duration
    this.sourceNodes.push(source)
  }

  /** Fallback: browser SpeechSynthesis (robotic but functional) */
  private async speakBrowser(text: string, opts: TTSOptions): Promise<void> {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 0.95
      utterance.pitch = 1.0

      // Pick a decent voice if available
      const voices = window.speechSynthesis.getVoices()
      const preferred = voices.find(v =>
        v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha')
      )
      if (preferred) utterance.voice = preferred

      utterance.onstart = () => opts.onStart?.()
      utterance.onend = () => { opts.onEnd?.(); resolve() }
      utterance.onerror = () => { opts.onError?.('Browser TTS error'); resolve() }
      window.speechSynthesis.speak(utterance)
    })
  }

  /** Stop all playback immediately */
  stop(): void {
    // Close WebSocket
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    // Stop all scheduled audio
    this.sourceNodes.forEach(node => {
      try { node.stop() } catch { /* already stopped */ }
    })
    this.sourceNodes = []
    this.isPlaying = false

    // Stop browser TTS
    if (typeof window !== 'undefined') {
      window.speechSynthesis?.cancel()
    }
  }

  get speaking(): boolean {
    return this.isPlaying
  }

  /** Force re-check of VibeVoice availability */
  resetAvailability(): void {
    this.vibeVoiceAvailable = null
  }
}

// Singleton instance for use across components
let _ttsClient: TTSClient | null = null

export function getTTSClient(): TTSClient {
  if (!_ttsClient) {
    _ttsClient = new TTSClient()
  }
  return _ttsClient
}
