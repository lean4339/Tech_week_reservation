import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reservationPeriod,
  inputDate,
  dateRange,
} from '../apps/frontend/src/lib/business.ts';

function period(start: string, end: string) {
  const form = new FormData();
  form.set('startsAt', start);
  form.set('endsAt', end);
  return form;
}
function withTimezone(zone: string, action: () => void) {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    action();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

test('booking forms convert local Argentina time to UTC and preserve it for editing', () =>
  withTimezone('America/Argentina/Buenos_Aires', () => {
    const value = reservationPeriod(
      period('2035-05-10T09:00', '2035-05-10T10:30'),
    );
    assert.deepEqual(value, {
      startsAt: '2035-05-10T12:00:00.000Z',
      endsAt: '2035-05-10T13:30:00.000Z',
    });
    assert.equal(inputDate(value.startsAt), '2035-05-10T09:00');
  }));

test('booking forms reject invalid, reversed, past and oversized periods before sending a write', () => {
  for (const [start, end] of [
    ['', ''],
    ['invalid', '2035-05-10T10:00'],
    ['2035-05-10T11:00', '2035-05-10T10:00'],
    ['2020-05-10T09:00', '2020-05-10T10:00'],
    ['2035-01-01T09:00', '2037-01-01T09:00'],
  ])
    assert.throws(() => reservationPeriod(period(start!, end!)));
});

test('calendar filters include the final local day and support month boundaries', () =>
  withTimezone('America/Argentina/Buenos_Aires', () => {
    assert.deepEqual(dateRange('2035-01-31', '2035-02-01'), {
      from: '2035-01-31T03:00:00.000Z',
      to: '2035-02-02T03:00:00.000Z',
    });
    assert.throws(() => dateRange('2035-01-03', '2035-01-01'));
    assert.deepEqual(dateRange('', ''), {});
    assert.deepEqual(dateRange('2035-01-01', ''), {
      from: '2035-01-01T03:00:00.000Z',
    });
    assert.deepEqual(dateRange('', '2035-01-01'), {
      to: '2035-01-02T03:00:00.000Z',
    });
    assert.doesNotThrow(() => dateRange('2035-01-01', '2037-01-01'));
    assert.throws(() => dateRange('invalid', ''));
    assert.throws(() => dateRange('', 'invalid'));
  }));

test('nonexistent daylight saving times are rejected and whole-day filters follow local midnight', () =>
  withTimezone('America/New_York', () => {
    // US DST begins on March 11 in 2035; 02:30 does not occur.
    assert.throws(
      () => reservationPeriod(period('2035-03-11T02:30', '2035-03-11T04:00')),
      /no existe/,
    );
    const range = dateRange('2035-03-11', '2035-03-11');
    assert.equal(Date.parse(range.to) - Date.parse(range.from), 23 * 3600000);
  }));
