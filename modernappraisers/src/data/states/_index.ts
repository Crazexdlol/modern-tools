// Alphabetical list of US states we serve. Massachusetts and Rhode Island
// are intentionally excluded; the validator fails the build if either is
// added. Count must be exactly 48.

import type { StateMeta } from '../state-types'

export const STATES: readonly StateMeta[] = [] as const
