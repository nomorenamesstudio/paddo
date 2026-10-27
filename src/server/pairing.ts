import { randomBytes } from 'node:crypto'

import type { Config } from './config'
import type { MintInput } from './tokens'
import { mintToken } from './tokens'

/**
 * Pairing an agent without a secret in the transcript.
 *
 * The writer starts a pairing and gets a short code; the code goes into the chat
 * (harmless until approved). The agent claims it, the writer approves in Paddō, and
 * only then is a token minted — handed to the agent over its own connection, never
 * through the conversation.
 */

/** No I, O, 0 or 1: a code gets read aloud and retyped. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const TTL_MS = 10 * 60 * 1000

export type PairingState = 'waiting' | 'claimed' | 'approved'

interface Pairing {
  code: string
  /** What the token will be when the writer approves. */
  input: MintInput
  state: PairingState
  createdAt: number
  claimedAt?: number
  /** Minted on the first collection, not at approval: an unclaimed pairing leaves no token. */
  secret?: string
  tokenId?: string
  handovers: number
}

/**
 * A collection can be lost: an agent whose shell wipes its scratch directory between
 * commands gets the token once and then has nothing. Within the code's lifetime it may
 * collect again, up to this many times.
 */
const MAX_HANDOVERS = 5

// In memory on purpose: one process, personal service, and an abandoned pairing
// should die with it rather than linger on disk.
const pairings = new Map<string, Pairing>()

function newCode(): string {
  const bytes = randomBytes(8)
  let raw = ''
  for (const byte of bytes) raw += ALPHABET[byte % ALPHABET.length]
  return `${raw.slice(0, 4)}-${raw.slice(4)}`
}

/** Case and dashes are the caller's business; the code itself is forgiving. */
export function normalizeCode(input: string): string {
  const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return clean.length === 8 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : input.trim().toUpperCase()
}

function fresh(pairing: Pairing): boolean {
  return Date.now() - pairing.createdAt < TTL_MS
}

function prune(): void {
  for (const [code, pairing] of pairings) {
    if (!fresh(pairing)) pairings.delete(code)
  }
}

export function startPairing(input: MintInput): { code: string; expiresAt: number } {
  prune()
  const code = newCode()
  pairings.set(code, { code, input, state: 'waiting', createdAt: Date.now(), handovers: 0 })
  return { code, expiresAt: Date.now() + TTL_MS }
}

export interface PendingPairing {
  code: string
  name: string
  state: PairingState
  createdAt: number
}

/** What the approval screen shows: pairings waiting on the writer, claimed or not. */
export function listPairings(): PendingPairing[] {
  prune()
  return [...pairings.values()]
    .filter((pairing) => pairing.state !== 'approved')
    .map((pairing) => ({
      code: pairing.code,
      name: pairing.input.name,
      state: pairing.state,
      createdAt: pairing.createdAt,
    }))
}

export interface ClaimResult {
  state: 'unknown' | PairingState
  secret?: string
}

/**
 * The agent's side: claim the code, wait, then collect. The token is minted at the
 * first collection, so an approval nobody collects leaves no orphan behind, and a
 * collection that gets lost can be repeated while the code still lives.
 */
export async function claimPairing(config: Config, code: string): Promise<ClaimResult> {
  prune()
  const pairing = pairings.get(normalizeCode(code))
  if (!pairing) return { state: 'unknown' }

  if (pairing.state === 'waiting') {
    pairing.state = 'claimed'
    pairing.claimedAt = Date.now()
  }

  if (pairing.state !== 'approved') return { state: pairing.state }

  if (pairing.handovers >= MAX_HANDOVERS) {
    pairings.delete(pairing.code)
    return { state: 'unknown' }
  }

  if (!pairing.secret) {
    const { token, secret } = await mintToken(config, pairing.input)
    pairing.secret = secret
    pairing.tokenId = token.id
  }

  pairing.handovers += 1
  return { state: 'approved', secret: pairing.secret }
}

export function approvePairing(code: string): { approved: boolean; reason?: string } {
  prune()
  const pairing = pairings.get(normalizeCode(code))
  if (!pairing) return { approved: false, reason: 'that code is unknown or has expired' }
  if (pairing.state === 'approved') return { approved: false, reason: 'already approved' }

  // No token yet: nothing exists to orphan if the agent never comes back for it.
  pairing.state = 'approved'
  return { approved: true }
}

export function denyPairing(code: string): boolean {
  return pairings.delete(normalizeCode(code))
}
