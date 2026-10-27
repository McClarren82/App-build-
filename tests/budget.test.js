const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../src/budget.js');

const state = (items, extra = {}) => ({
  settings: { payAmount: 2000, payDate: '2026-10-23', leadDays: 0, ...extra.settings },
  items,
  periods: extra.periods || {},
});

test('periodStartFor aligns any date to the bi-weekly grid', () => {
  assert.equal(B.periodStartFor('2026-10-23', '2026-10-23'), '2026-10-23');
  assert.equal(B.periodStartFor('2026-10-23', '2026-11-05'), '2026-10-23');
  assert.equal(B.periodStartFor('2026-10-23', '2026-11-06'), '2026-11-06');
  assert.equal(B.periodStartFor('2026-10-23', '2026-10-22'), '2026-10-09');
});

test('bill lands only in the paycheck covering its due date', () => {
  const items = [{ id: 'r', name: 'Rent', group: 'Bills', kind: 'bill', amount: 1000, dueDay: 1 }];
  // Period Oct 23 - Nov 5 contains Nov 1.
  assert.equal(B.computePeriod(state(items), '2026-10-23').planned, 1000);
  // Period Nov 6 - Nov 19 does not.
  assert.equal(B.computePeriod(state(items), '2026-11-06').planned, 0);
});

test('due day past month end falls on the last day', () => {
  const feb = B.dueDatesBetween(31, B.parseDate('2027-02-20'), B.parseDate('2027-03-05')).map(B.toISO);
  assert.deepEqual(feb, ['2027-02-28']);
});

test('lead days move a bill to the earlier paycheck', () => {
  const items = [{ id: 'r', name: 'Rent', group: 'Bills', kind: 'bill', amount: 1000, dueDay: 7 }];
  // Due Nov 7: normally the Nov 6 paycheck; with 3 lead days, the Oct 23 one.
  assert.equal(B.computePeriod(state(items), '2026-11-06').planned, 1000);
  const early = state(items, { settings: { leadDays: 3 } });
  assert.equal(B.computePeriod(early, '2026-10-23').planned, 1000);
  assert.equal(B.computePeriod(early, '2026-11-06').planned, 0);
});

test('a monthly bill is planned exactly 12 times across a year of paychecks', () => {
  const items = [{ id: 'b', name: 'B', group: 'Bills', kind: 'bill', amount: 10, dueDay: 15 }];
  let total = 0;
  // 2027-01-01 .. 2027-12-31 is covered by periods starting from the one containing Jan 1.
  let start = B.periodStartFor('2026-10-23', '2027-01-01');
  while (start <= '2027-12-31') {
    total += B.computePeriod(state(items), start).planned;
    start = B.shiftPeriod(start, 1);
  }
  assert.equal(total, 120);
});

test('monthly split and per-paycheck amounts', () => {
  const items = [
    { id: 'm', name: 'Fund', group: 'Savings', kind: 'monthly', amount: 130 },
    { id: 'p', name: 'Food', group: 'Living', kind: 'perPaycheck', amount: 200 },
  ];
  const p = B.computePeriod(state(items), '2026-10-23');
  assert.equal(p.lines[0].planned, 60);
  assert.equal(p.lines[1].planned, 200);
  assert.equal(p.leftToBudget, 2000 - 260);
});

test('overrides, actuals and extra income feed the totals', () => {
  const items = [{ id: 'p', name: 'Food', group: 'Living', kind: 'perPaycheck', amount: 200 }];
  const s = state(items, { periods: { '2026-10-23': { extraIncome: 100, overrides: { p: 250 }, actuals: { p: 80 } } } });
  const p = B.computePeriod(s, '2026-10-23');
  assert.equal(p.income, 2100);
  assert.equal(p.planned, 250);
  assert.equal(p.spent, 80);
  assert.equal(p.lines[0].remaining, 170);
});

test('assignLeftover zeroes the period', () => {
  const items = [
    { id: 'p', name: 'Food', group: 'Living', kind: 'perPaycheck', amount: 200 },
    { id: 's', name: 'Save', group: 'Savings', kind: 'perPaycheck', amount: 100 },
  ];
  const next = B.assignLeftover(state(items), '2026-10-23', 's');
  const p = B.computePeriod(next, '2026-10-23');
  assert.equal(p.leftToBudget, 0);
  assert.equal(p.lines[1].planned, 1800);
});

test('assignLeftover handles an overage', () => {
  const items = [{ id: 'p', name: 'Food', group: 'Living', kind: 'perPaycheck', amount: 2300 }];
  const p = B.computePeriod(B.assignLeftover(state(items), '2026-10-23', 'p'), '2026-10-23');
  assert.equal(p.leftToBudget, 0);
});

test('threePaycheckMonths finds months with three pay dates', () => {
  const starts = Array.from({ length: 26 }, (_, i) => B.shiftPeriod('2026-10-23', i));
  // Jan 1, 15, 29 2027 are all pay dates on this grid.
  assert.ok(B.threePaycheckMonths(starts).includes('2027-01'));
});
