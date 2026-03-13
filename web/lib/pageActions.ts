'use client'

/**
 * NexusLearn PageAgent Integration
 * 
 * Allows the teacher (Guide/Solve agents) to control the UI while speaking:
 *  - Type code into the editor
 *  - Click the Run button
 *  - Highlight specific lines
 *  - Focus different panels
 *  - Scroll to results
 * 
 * How it works:
 *  1. Superintendent wraps guide/solve responses with page_actions[] array
 *  2. This module executes those actions in sequence
 *  3. Actions are timed to sync with VibeVoice audio playback
 * 
 * Teacher command format (from Superintendent):
 * {
 *   "explanation": "Watch how I write the base case...",
 *   "voice": "emma",
 *   "page_actions": [
 *     {"action": "focus",    "target": "code-editor"},
 *     {"action": "type",     "text": "if n == 0:\n    return 1"},
 *     {"action": "pause",    "ms": 800},
 *     {"action": "click",    "target": "run-button"},
 *     {"action": "highlight","target": "code-editor", "lines": [2,3]},
 *     {"action": "scroll",   "target": "output-panel"}
 *   ]
 * }
 * 
 * UI elements must have data-nexus-id attributes matching target names.
 */

export interface PageAction {
  action: 'focus' | 'type' | 'pause' | 'click' | 'highlight' | 'scroll' | 'clear'
  target?: string    // data-nexus-id value
  text?: string      // for 'type' action
  ms?: number        // for 'pause' action (default: 600)
  lines?: number[]   // for 'highlight' action
}

export type ActionCallback = (action: PageAction, element: Element | null) => void

/** Find an element by its data-nexus-id attribute */
function findTarget(targetId: string): Element | null {
  return document.querySelector(`[data-nexus-id="${targetId}"]`)
}

/** Simulate human-like typing into a textarea/input */
async function simulateTyping(element: Element, text: string, msPerChar = 40): Promise<void> {
  if (!element) return
  const input = element as HTMLTextAreaElement | HTMLInputElement

  // Focus the element
  input.focus()

  // Type character by character
  for (const char of text) {
    const current = input.value
    const selStart = input.selectionStart ?? current.length
    const selEnd = input.selectionEnd ?? current.length

    // Insert character at cursor position
    const newValue = current.slice(0, selStart) + char + current.slice(selEnd)
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    )?.set || Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(input, newValue)
    } else {
      input.value = newValue
    }

    // Trigger React synthetic event
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))

    // Move cursor forward
    const newPos = selStart + 1
    input.setSelectionRange(newPos, newPos)

    await sleep(msPerChar + Math.random() * 20) // slight variance for realism
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Execute a sequence of page actions.
 * Actions run in order, awaiting each one.
 * 
 * @param actions   Array of PageAction objects from Superintendent
 * @param onAction  Optional callback after each action (for UI feedback)
 * @param signal    AbortSignal to cancel mid-sequence
 */
export async function executePageActions(
  actions: PageAction[],
  onAction?: ActionCallback,
  signal?: AbortSignal,
): Promise<void> {
  for (const action of actions) {
    if (signal?.aborted) break

    const target = action.target ? findTarget(action.target) : null

    switch (action.action) {
      case 'focus':
        if (target) {
          (target as HTMLElement).focus()
          target.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
        break

      case 'type':
        if (target && action.text !== undefined) {
          await simulateTyping(target, action.text)
        }
        break

      case 'pause':
        await sleep(action.ms ?? 600)
        break

      case 'click':
        if (target) {
          (target as HTMLElement).click()
          // Visual flash
          ;(target as HTMLElement).style.outline = '2px solid #6366f1'
          setTimeout(() => {
            (target as HTMLElement).style.outline = ''
          }, 500)
        }
        break

      case 'highlight':
        if (target && action.lines?.length) {
          // Add a data attribute — CodeStudio reads this to render line highlights
          target.setAttribute('data-highlight-lines', JSON.stringify(action.lines))
          await sleep(1500)
          target.removeAttribute('data-highlight-lines')
        }
        break

      case 'scroll':
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
        break

      case 'clear':
        if (target) {
          const el = target as HTMLTextAreaElement | HTMLInputElement
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, 'value'
          )?.set
          if (nativeInputValueSetter) {
            nativeInputValueSetter.call(el, '')
          } else {
            el.value = ''
          }
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
        }
        break
    }

    onAction?.(action, target)

    // Small gap between actions for readability
    if (action.action !== 'pause') {
      await sleep(100)
    }
  }
}

/**
 * React hook to execute page actions from a Superintendent response.
 * 
 * Usage:
 *   const { execute, isExecuting, cancel } = usePageActions()
 *   // When response arrives with page_actions:
 *   execute(response.page_actions)
 */
import { useRef, useState, useCallback } from 'react'

export function usePageActions() {
  const [isExecuting, setIsExecuting] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const execute = useCallback(async (actions: PageAction[]) => {
    if (!actions?.length) return
    // Cancel any running sequence
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsExecuting(true)
    try {
      await executePageActions(actions, undefined, controller.signal)
    } finally {
      setIsExecuting(false)
    }
  }, [])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setIsExecuting(false)
  }, [])

  return { execute, isExecuting, cancel }
}

/**
 * Generate example page_actions for common teaching patterns.
 * The Guide agent uses these templates when generating responses.
 */
export const PAGE_ACTION_TEMPLATES = {
  typeAndRun: (code: string): PageAction[] => [
    { action: 'focus',  target: 'code-editor' },
    { action: 'clear',  target: 'code-editor' },
    { action: 'type',   target: 'code-editor', text: code },
    { action: 'pause',  ms: 800 },
    { action: 'click',  target: 'run-button' },
    { action: 'pause',  ms: 1000 },
    { action: 'scroll', target: 'output-panel' },
  ],

  highlightLine: (lines: number[]): PageAction[] => [
    { action: 'highlight', target: 'code-editor', lines },
    { action: 'pause', ms: 2000 },
  ],

  showOutput: (): PageAction[] => [
    { action: 'focus',  target: 'output-panel' },
    { action: 'scroll', target: 'output-panel' },
  ],
}
