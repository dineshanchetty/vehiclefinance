// Small helpers shared by bot + web + api. Keep each self-contained and pure.

import type { DealStatus, PhotoAngle } from '../types'
import { MANDATORY_PHOTO_ANGLES } from '../constants'

// ── Deal helpers ────────────────────────────────────────────────────────────
export const DEAL_NUMBER_PATTERN = /^DL-\d{4}-\d{5}$/

export function isValidDealNumber(n: string | null | undefined): n is string {
  return typeof n === 'string' && DEAL_NUMBER_PATTERN.test(n)
}

/** Coarse progress stage used for timeline UI (1..7). */
export function dealStage(status: DealStatus): number {
  const s = status
  if (s.startsWith('APPLICATION') || s.startsWith('CONSENT'))  return 1
  if (s.startsWith('BUYER_DOCS') || s === 'EXTRACTION_IN_PROGRESS' || s.startsWith('BUYER_CONFIRM')) return 2
  if (s.startsWith('SELLER_'))                                  return 3
  if (s.startsWith('VEHICLE_PHOTOS') || s.startsWith('QUICK_EVAL')) return 4
  if (s.startsWith('FNI_') || s.startsWith('QUOTE_') || s.startsWith('INSPECTION_')) return 5
  if (s.includes('CONTRACT'))                                   return 6
  if (s.includes('NATIS') || s.startsWith('DEAL_'))             return 7
  return 0
}

// ── Photo helpers ───────────────────────────────────────────────────────────
export function isMandatoryAngle(angle: PhotoAngle | null | undefined): boolean {
  return angle != null && (MANDATORY_PHOTO_ANGLES as readonly string[]).includes(angle)
}

/** Percentage 0..100 of mandatory photos accepted. */
export function coveragePct(received: number, required = MANDATORY_PHOTO_ANGLES.length): number {
  if (required <= 0) return 0
  return Math.round((Math.min(received, required) / required) * 100)
}

// ── Phone normalisation ─────────────────────────────────────────────────────
/** Collapse to E.164-ish +NN... by stripping whitespace, dashes, parens. */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim().replace(/[\s\-()]/g, '')
  if (trimmed.startsWith('00')) return '+' + trimmed.slice(2)
  if (trimmed.startsWith('0'))  return '+27' + trimmed.slice(1) // naive ZA default
  if (!trimmed.startsWith('+')) return '+' + trimmed
  return trimmed
}

// ── Error helpers ───────────────────────────────────────────────────────────
export function assertNever(x: never, context = 'assertNever'): never {
  throw new Error(`${context}: unexpected value ${JSON.stringify(x)}`)
}
