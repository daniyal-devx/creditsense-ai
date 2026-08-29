/**
 * The build phases, mirrored from the project README.
 *
 * Kept in code so the running app can show honest progress on the status
 * dashboard rather than a hand-maintained screenshot. Update `status` here in
 * the same commit that finishes a phase.
 */

export type PhaseStatus = 'done' | 'in-progress' | 'todo'

export interface Phase {
  number: number
  title: string
  /** What the phase unlocks, in the README's words. */
  answers: string
  status: PhaseStatus
}

export const PHASES: readonly Phase[] = [
  {
    number: 0,
    title: 'Foundation & Project Setup',
    answers: 'Scaffold, database connection, design tokens, shared components, responsive app shell.',
    status: 'done',
  },
  {
    number: 1,
    title: 'Digital Signal Data Layer',
    answers: 'What can we even see about this person? Wallet, top-up and bill-payment signals.',
    status: 'done',
  },
  {
    number: 2,
    title: 'Auth, Email & Access Control',
    answers: 'Signup, email verification, Google sign-in, roles and permissions.',
    status: 'in-progress',
  },
  {
    number: 3,
    title: 'CreditSense Score',
    answers: 'Q1 — Can this person repay? A 0–1000 score with plain-language reasons.',
    status: 'todo',
  },
  {
    number: 4,
    title: 'Financial Affordability Engine',
    answers: 'Q2 — How much can they safely borrow?',
    status: 'todo',
  },
  {
    number: 5,
    title: 'FraudSense',
    answers: 'Q3 — Can we trust this application? Anomalies and the relationship graph.',
    status: 'todo',
  },
  {
    number: 6,
    title: 'Continuous Financial Monitoring',
    answers: 'Q4 — What happens after the loan is given? Early-warning signals.',
    status: 'todo',
  },
  {
    number: 7,
    title: 'Role Dashboards & Decision Workflow',
    answers: 'Turns the modules into an actual approve / reject decision.',
    status: 'todo',
  },
  {
    number: 8,
    title: 'Demo Data, Polish & Deploy',
    answers: 'Makes the impact provable to judges and lenders.',
    status: 'todo',
  },
]

export function currentPhase(): Phase | undefined {
  return PHASES.find((p) => p.status === 'in-progress')
}

/** Used by placeholder pages to say honestly when a section arrives. */
export function phase(number: number): Phase {
  const found = PHASES.find((p) => p.number === number)
  if (!found) throw new Error(`Unknown phase ${number}`)
  return found
}
