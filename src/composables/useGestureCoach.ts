/**
 * First-run gesture coach.
 *
 * Edge-step gestures carry the canvas's navigation and are invisible: nothing on
 * screen suggests that pushing the pointer against an edge reveals the
 * storylines or the agent. This walks a new user through them one at a time,
 * advancing only when the gesture is actually performed, because reading about
 * a gesture is not learning it.
 *
 * The timelines sheet is not taught here: it opens from the toolbar button, not
 * from an edge. A lesson for a gesture that no longer exists could never be
 * performed, and the tour would stall on it forever.
 *
 * See PRODUCT_DESIGN.md > First-run gesture coach.
 */
import { computed, ref } from 'vue'

export const GESTURE_LESSONS = ['right', 'left'] as const

export type GestureLesson = (typeof GESTURE_LESSONS)[number]

const STORAGE_KEY = 'nodus-gesture-coach-done'

export function useGestureCoach() {
  const index = ref(0)
  const active = ref(false)

  const lesson = computed<GestureLesson | null>(() =>
    active.value ? GESTURE_LESSONS[index.value] : null
  )
  const step = computed(() => index.value + 1)

  function finish() {
    active.value = false
    localStorage.setItem(STORAGE_KEY, 'true')
  }

  /** Begin the tour unless the user has already seen or skipped it */
  function start() {
    if (localStorage.getItem(STORAGE_KEY) === 'true') return
    index.value = 0
    active.value = true
  }

  /** Run the tour again on request, ignoring that it was already completed */
  function restart() {
    localStorage.removeItem(STORAGE_KEY)
    start()
  }

  /**
   * Report an edge step the user performed. Only the gesture currently being
   * taught advances the tour; the others are the application working normally.
   */
  function recordGesture(kind: GestureLesson) {
    if (!active.value || kind !== lesson.value) return
    if (index.value >= GESTURE_LESSONS.length - 1) {
      finish()
      return
    }
    index.value++
  }

  function skip() {
    finish()
  }

  return {
    active,
    lesson,
    step,
    total: GESTURE_LESSONS.length,
    start,
    restart,
    recordGesture,
    skip,
  }
}
