/**
 * computeRecoveryReport — pure aggregation for the Reports page.
 * No Supabase: rows in, report out, injectable clock.
 */
import { describe, it, expect } from 'vitest'
import { computeRecoveryReport, type ReportRow } from '../lib/recovery'

const NOW = new Date('2026-07-07T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()

function row(over: Partial<ReportRow>): ReportRow {
  return {
    workstream: 'A_UPSELL',
    recovery_status: 'ROUTED',
    qualifying_ceiling: null,
    traced_phone: null,
    created_at: hoursAgo(1),
    updated_at: hoursAgo(1),
    returned_at: null,
    ...over,
  }
}

describe('computeRecoveryReport', () => {
  it('empty rows → zeroed report with full 14-day axis', () => {
    const r = computeRecoveryReport([], NOW)
    expect(r.feed.lastReceivedAt).toBeNull()
    expect(r.aConversion.routed).toBe(0)
    expect(r.medianHoursToReturn).toBeNull()
    expect(r.byDay).toHaveLength(14)
    expect(r.byDay.every((d) => d.count === 0)).toBe(true)
  })

  it('feed health: today / 7d / unrouted counts', () => {
    const r = computeRecoveryReport([
      row({ created_at: hoursAgo(2) }),                       // today
      row({ created_at: hoursAgo(3 * 24) }),                  // within 7d
      row({ created_at: hoursAgo(10 * 24) }),                 // outside 7d
      row({ workstream: 'NONE', created_at: hoursAgo(2) }),   // unrouted, today
    ], NOW)
    expect(r.feed.receivedToday).toBe(2)
    expect(r.feed.received7d).toBe(3)
    expect(r.feed.unrouted).toBe(1)
    expect(r.feed.lastReceivedAt).toBe(hoursAgo(2))
  })

  it('A funnel: priced / engaged / returned / funded percentages', () => {
    const r = computeRecoveryReport([
      row({ qualifying_ceiling: 100000, recovery_status: 'RE_ENGAGED' }),
      row({ qualifying_ceiling: 150000, recovery_status: 'RETURNED', returned_at: hoursAgo(0.5) }),
      row({ qualifying_ceiling: 90000, recovery_status: 'FUNDED', returned_at: hoursAgo(0.5) }),
      row({}), // routed, unpriced
    ], NOW)
    expect(r.aConversion.routed).toBe(4)
    expect(r.aConversion.priced).toBe(3)
    expect(r.aConversion.pricedPct).toBe(75)
    expect(r.aConversion.engaged).toBe(3)
    expect(r.aConversion.returned).toBe(2)
    expect(r.aConversion.funded).toBe(1)
    expect(r.attention.unpriced).toBe(1)
  })

  it('B funnel: traced / unreachable percentages', () => {
    const r = computeRecoveryReport([
      row({ workstream: 'B_REACTIVATION', traced_phone: '277300', recovery_status: 'ENGAGING' }),
      row({ workstream: 'B_REACTIVATION', recovery_status: 'UNREACHABLE' }),
    ], NOW)
    expect(r.bConversion.routed).toBe(2)
    expect(r.bConversion.tracedPct).toBe(50)
    expect(r.bConversion.unreachablePct).toBe(50)
    expect(r.attention.unreachable).toBe(1)
  })

  it('flags stalls: engaged with no movement >48h', () => {
    const r = computeRecoveryReport([
      row({ recovery_status: 'RE_ENGAGED', qualifying_ceiling: 1, updated_at: hoursAgo(72) }),
      row({ recovery_status: 'RE_ENGAGED', qualifying_ceiling: 1, updated_at: hoursAgo(2) }),
    ], NOW)
    expect(r.attention.stale48h).toBe(1)
  })

  it('median hours to return', () => {
    const r = computeRecoveryReport([
      row({ recovery_status: 'RETURNED', qualifying_ceiling: 1, created_at: hoursAgo(10), returned_at: hoursAgo(6) }),  // 4h
      row({ recovery_status: 'RETURNED', qualifying_ceiling: 1, created_at: hoursAgo(10), returned_at: hoursAgo(0) }),  // 10h
      row({ recovery_status: 'RETURNED', qualifying_ceiling: 1, created_at: hoursAgo(10), returned_at: hoursAgo(4) }),  // 6h
    ], NOW)
    expect(r.medianHoursToReturn).toBe(6)
  })

  it('opt-outs counted', () => {
    const r = computeRecoveryReport([row({ recovery_status: 'OPTED_OUT' })], NOW)
    expect(r.attention.optedOut).toBe(1)
  })
})
