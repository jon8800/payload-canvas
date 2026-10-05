import assert from 'node:assert/strict'
import { test } from 'node:test'

import { formatSaveTime } from './saveTime'

const options = { locale: 'en-GB', timeZone: 'UTC', now: new Date('2026-10-06T12:00:00Z') }

test('today shows the time only', () => {
  assert.equal(formatSaveTime('2026-10-06T00:05:00Z', options), '00:05')
  assert.equal(formatSaveTime('2026-10-06T23:42:00Z', options), '23:42')
})

test('an earlier day this year shows the day and the time', () => {
  assert.equal(formatSaveTime('2026-03-12T23:42:00Z', options), '12 Mar, 23:42')
  assert.equal(formatSaveTime('2026-10-05T23:59:00Z', options), '5 Oct, 23:59')
})

test('an earlier year also shows the year', () => {
  assert.equal(formatSaveTime('2025-03-12T23:42:00Z', options), '12 Mar 2025, 23:42')
  assert.equal(formatSaveTime('2025-10-06T12:00:00Z', options), '6 Oct 2025, 12:00')
})

test('the day is judged in the given time zone', () => {
  // 23:30 UTC on 5 Oct is already 6 Oct in Sydney (UTC+11), so it is today there.
  const sydney = { locale: 'en-GB', timeZone: 'Australia/Sydney', now: new Date('2026-10-06T05:00:00Z') }
  assert.equal(formatSaveTime('2026-10-05T23:30:00Z', sydney), '10:30')
})

test('an empty or invalid date gives an empty string', () => {
  assert.equal(formatSaveTime(null, options), '')
  assert.equal(formatSaveTime('', options), '')
  assert.equal(formatSaveTime('not a date', options), '')
})
