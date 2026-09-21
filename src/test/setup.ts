import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest does not expose its globals by default, so Testing Library's automatic
// cleanup hook is never registered. Register it explicitly: without this, a
// component mounted by one test stays mounted (with its timers running) during
// the next test, which would make the countdown tests lie.
afterEach(() => {
  cleanup()
})
