/**
 * NexusLearn Lesson Composition Types
 * 
 * The Guide agent generates a LessonConfig JSON object.
 * The frontend renders it as an animated Remotion video with:
 *  - TitleCard: animated lesson header
 *  - ConceptSlide: text explanation with timed reveals
 *  - CodeTypewriter: code that types itself line by line
 *  - TikTokCaptions: word-by-word captions synced to VibeVoice audio
 *  - QuizSlide: question with answer reveal
 */

export type SlideType =
  | 'title'
  | 'concept'
  | 'code'
  | 'quiz'
  | 'summary'

export interface TitleSlide {
  type: 'title'
  title: string
  subtitle?: string
  emoji?: string
  durationFrames?: number  // default: 90 (3s at 30fps)
}

export interface ConceptSlide {
  type: 'concept'
  heading: string
  points: string[]         // bullet points revealed one by one
  analogy?: string         // "Think of it like..." in a callout box
  durationFrames?: number  // default: 150 (5s at 30fps)
}

export interface CodeSlide {
  type: 'code'
  language: string
  code: string             // full code block
  highlightLines?: number[]  // lines to highlight after typing
  explanation: string      // spoken explanation (used by TTS)
  durationFrames?: number  // default: 180 (6s at 30fps)
}

export interface QuizSlide {
  type: 'quiz'
  question: string
  options: string[]
  correctIndex: number
  explanation: string
  durationFrames?: number  // default: 150
}

export interface SummarySlide {
  type: 'summary'
  title: string
  keyPoints: string[]
  nextStep?: string
  durationFrames?: number  // default: 120
}

export type LessonSlide =
  | TitleSlide
  | ConceptSlide
  | CodeSlide
  | QuizSlide
  | SummarySlide

export interface LessonConfig {
  id: string
  topic: string
  title: string
  totalDurationFrames?: number   // auto-calculated if not set
  fps: number                    // always 30
  slides: LessonSlide[]
  voicePersona?: string          // which VibeVoice voice reads this
  captions?: CaptionWord[]       // word-level captions from VibeVoice
}

export interface CaptionWord {
  text: string
  startMs: number
  endMs: number
}

/** Generate a default lesson config for a topic (used as fallback) */
export function defaultLessonConfig(topic: string, title: string): LessonConfig {
  return {
    id: `lesson_${topic}_${Date.now()}`,
    topic,
    title,
    fps: 30,
    slides: [
      {
        type: 'title',
        title,
        subtitle: `Let's learn about ${topic}`,
        emoji: '📖',
        durationFrames: 60,
      },
      {
        type: 'concept',
        heading: `What is ${topic}?`,
        points: [
          `${topic} is a fundamental programming concept`,
          'Understanding it unlocks many patterns',
          "Let's explore it step by step",
        ],
        durationFrames: 150,
      },
      {
        type: 'summary',
        title: 'Key Takeaways',
        keyPoints: [`You learned about ${topic}`, 'Practice makes perfect'],
        nextStep: 'Try a practice question',
        durationFrames: 90,
      },
    ],
  }
}

/** Parse lesson config from Guide agent markdown/JSON response */
export function parseLessonConfig(agentResponse: string, topic: string): LessonConfig | null {
  // Try to extract JSON block from agent response
  const jsonMatch = agentResponse.match(/```(?:json)?\s*(\{[\s\S]*?"slides"[\s\S]*?\})\s*```/i)
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]) as LessonConfig
    } catch { /* fall through */ }
  }
  return null
}
