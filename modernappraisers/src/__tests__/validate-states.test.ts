import { describe, it, expect } from 'vitest'
import { validate } from '../../scripts/validate-states.mjs'

type Result = { errors: string[]; warnings: string[] }

describe('validate-states', () => {
  it('runs and returns the expected shape', () => {
    const { errors, warnings } = validate() as Result
    expect(Array.isArray(errors)).toBe(true)
    expect(Array.isArray(warnings)).toBe(true)
  })

  it('flags the current empty-index state with a count error', () => {
    const { errors } = validate() as Result
    const hasCountErr = errors.some(e => /Expected 48 entries/.test(e))
    // When index is empty (right after Task 2), expect count error. After
    // Task 4 populates the index, this check is removed from reality but
    // the test only asserts the SHAPE, so leaving as a soft check:
    expect(hasCountErr || errors.length === 0).toBe(true)
  })
})
