/**
 * First-run gesture coach (PRODUCT_DESIGN.md > First-run gesture coach).
 *
 * The edge-step gestures are invisible: nothing on screen suggests that pushing
 * the pointer against an edge reveals the storylines or the agent. A user
 * who never discovers them never finds those features, so the coach teaches each
 * one by having the user perform it.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useGestureCoach, GESTURE_LESSONS } from '../composables/useGestureCoach'

const STORAGE_KEY = 'nodus-gesture-coach-done'

describe('gesture coach', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('teaches the gestures in the order a new user needs them', () => {
    expect(GESTURE_LESSONS).toEqual(['right', 'left'])
  })

  it('starts on the first lesson', () => {
    const coach = useGestureCoach()
    coach.start()

    expect(coach.active.value).toBe(true)
    expect(coach.lesson.value).toBe('right')
    expect(coach.step.value).toBe(1)
    expect(coach.total).toBe(2)
  })

  it('advances only when the taught gesture is performed', () => {
    const coach = useGestureCoach()
    coach.start()

    // Any other edge is not the lesson: a user pushing the wrong edge has not
    // learned this one
    coach.recordGesture('left')
    expect(coach.lesson.value).toBe('right')

    coach.recordGesture('right')
    expect(coach.lesson.value).toBe('left')
  })

  it('ignores gestures before it is started', () => {
    const coach = useGestureCoach()

    coach.recordGesture('right')
    expect(coach.active.value).toBe(false)
    expect(coach.step.value).toBe(1)
  })

  it('finishes after the last lesson and never returns', () => {
    const coach = useGestureCoach()
    coach.start()
    for (const lesson of GESTURE_LESSONS) coach.recordGesture(lesson)

    expect(coach.active.value).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true')

    const reopened = useGestureCoach()
    reopened.start()
    expect(reopened.active.value).toBe(false)
  })

  it('can be skipped, and skipping is remembered', () => {
    const coach = useGestureCoach()
    coach.start()
    coach.skip()

    expect(coach.active.value).toBe(false)

    const reopened = useGestureCoach()
    reopened.start()
    expect(reopened.active.value).toBe(false)
  })

  it('can be replayed on request even once completed', () => {
    localStorage.setItem(STORAGE_KEY, 'true')

    const coach = useGestureCoach()
    coach.restart()

    expect(coach.active.value).toBe(true)
    expect(coach.lesson.value).toBe('right')
  })

  it('is driven by the real edge steps, not a separate detector', () => {
    // A lesson that advances on anything other than the gesture being taught
    // would teach the wrong thing the moment the gestures change
    const app = readFileSync(resolve(__dirname, '../App.vue'), 'utf-8')
    for (const lesson of GESTURE_LESSONS) {
      expect(app).toContain(`gestureCoach.recordGesture('${lesson}')`)
    }
  })
})

describe('gesture coach copy', () => {
  const locales = ['en', 'de', 'fr', 'es', 'it']

  it('has a title and instruction for every lesson in every language', () => {
    for (const locale of locales) {
      const messages = JSON.parse(
        readFileSync(resolve(__dirname, `../i18n/locales/${locale}.json`), 'utf-8')
      )
      expect(messages.gestureCoach?.skip, locale).toBeTruthy()
      for (const lesson of GESTURE_LESSONS) {
        expect(messages.gestureCoach?.[lesson]?.title, `${locale}.${lesson}`).toBeTruthy()
        expect(messages.gestureCoach?.[lesson]?.instruction, `${locale}.${lesson}`).toBeTruthy()
      }
      expect(messages.settings?.replayTour, locale).toBeTruthy()
    }
  })
})
