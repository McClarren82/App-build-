// Pure budgeting logic: pay periods, bill placement and zero-based totals.
// Works in the browser (window.Budget) and in Node (module.exports) for tests.
(function (root) {
  'use strict';

  const DAY = 86400000;
  const PERIOD_DAYS = 14;
  const PAYCHECKS_PER_YEAR = 26;

  // Groups are fixed so each one keeps the same chart color everywhere.
  const GROUPS = ['Bills', 'Living', 'Savings', 'Debt', 'Giving', 'Fun'];

  // Item kinds:
  //   bill        - monthly amount due on `dueDay`; lands in the paycheck that covers the due date
  //   perPaycheck - the same amount out of every paycheck
  //   monthly     - monthly amount set aside evenly: amount * 12 / 26 per paycheck
  const KINDS = {
    bill: 'Bill (due date)',
    perPaycheck: 'Every paycheck',
    monthly: 'Monthly, split evenly',
  };

  // Dates are handled as UTC midnight timestamps so DST never shifts a day.
  function parseDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  }

  function toISO(ts) {
    return new Date(ts).toISOString().slice(0, 10);
  }

  function addDays(ts, n) {
    return ts + n * DAY;
  }

  function todayISO() {
    const now = new Date();
    return toISO(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  }

  function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  }

  // The pay date of the period that contains `dateISO`, aligned to the anchor pay date.
  function periodStartFor(anchorISO, dateISO) {
    const anchor = parseDate(anchorISO);
    const offset = Math.floor((parseDate(dateISO) - anchor) / DAY / PERIOD_DAYS);
    return toISO(addDays(anchor, offset * PERIOD_DAYS));
  }

  function shiftPeriod(startISO, n) {
    return toISO(addDays(parseDate(startISO), n * PERIOD_DAYS));
  }

  function periodEnd(startISO) {
    return toISO(addDays(parseDate(startISO), PERIOD_DAYS - 1));
  }

  // Every due date of a monthly bill that falls inside [startTs, endTs].
  // A due day past the end of a short month falls on that month's last day.
  function dueDatesBetween(dueDay, startTs, endTs) {
    const dates = [];
    const s = new Date(startTs);
    let y = s.getUTCFullYear();
    let m = s.getUTCMonth();
    for (;;) {
      const due = Date.UTC(y, m, Math.min(dueDay, daysInMonth(y, m)));
      if (due > endTs) break;
      if (due >= startTs) dates.push(due);
      m += 1;
      if (m > 11) { m = 0; y += 1; }
    }
    return dates;
  }

  // Bills are paid from the paycheck that arrives at least `leadDays` before the due date,
  // so the window of due dates a paycheck covers is shifted forward by leadDays.
  function billDueDates(item, startISO, leadDays) {
    const start = addDays(parseDate(startISO), leadDays);
    const end = addDays(start, PERIOD_DAYS - 1);
    return dueDatesBetween(Number(item.dueDay) || 1, start, end).map(toISO);
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  // The default planned amount of an item in a period, before any per-period override.
  function defaultPlanned(item, startISO, settings) {
    const amount = Number(item.amount) || 0;
    if (item.kind === 'perPaycheck') return amount;
    if (item.kind === 'monthly') return round2((amount * 12) / PAYCHECKS_PER_YEAR);
    return amount * billDueDates(item, startISO, Number(settings.leadDays) || 0).length;
  }

  function periodRecord(state, startISO) {
    return state.periods[startISO] || { extraIncome: 0, overrides: {}, actuals: {} };
  }

  // Everything the dashboard needs for one paycheck.
  function computePeriod(state, startISO) {
    const settings = state.settings;
    const rec = periodRecord(state, startISO);
    const lead = Number(settings.leadDays) || 0;

    const lines = state.items.map((item) => {
      const base = defaultPlanned(item, startISO, settings);
      const hasOverride = Object.prototype.hasOwnProperty.call(rec.overrides || {}, item.id);
      const planned = hasOverride ? Number(rec.overrides[item.id]) || 0 : base;
      const spent = Number((rec.actuals || {})[item.id]) || 0;
      const due = item.kind === 'bill' ? billDueDates(item, startISO, lead) : [];
      return { item, base, planned, spent, remaining: round2(planned - spent), due, overridden: hasOverride };
    });

    const income = round2((Number(settings.payAmount) || 0) + (Number(rec.extraIncome) || 0));
    const planned = round2(lines.reduce((s, l) => s + l.planned, 0));
    const spent = round2(lines.reduce((s, l) => s + l.spent, 0));
    const byGroup = GROUPS.map((g) => ({
      group: g,
      planned: round2(lines.filter((l) => l.item.group === g).reduce((s, l) => s + l.planned, 0)),
    }));

    return {
      start: startISO,
      end: periodEnd(startISO),
      income,
      extraIncome: Number(rec.extraIncome) || 0,
      planned,
      spent,
      leftToBudget: round2(income - planned),
      lines,
      byGroup,
    };
  }

  // Months (YYYY-MM) that contain three pay dates in the given periods.
  function threePaycheckMonths(starts) {
    const counts = {};
    starts.forEach((s) => { const k = s.slice(0, 7); counts[k] = (counts[k] || 0) + 1; });
    return Object.keys(counts).filter((k) => counts[k] >= 3);
  }

  // Zero out a period by moving whatever is left (or over) onto one item's planned amount.
  function assignLeftover(state, startISO, itemId) {
    const p = computePeriod(state, startISO);
    const line = p.lines.find((l) => l.item.id === itemId);
    if (!line) return state;
    const rec = JSON.parse(JSON.stringify(periodRecord(state, startISO)));
    rec.overrides = rec.overrides || {};
    rec.overrides[itemId] = Math.max(0, round2(line.planned + p.leftToBudget));
    return { ...state, periods: { ...state.periods, [startISO]: rec } };
  }

  const api = {
    GROUPS, KINDS, PERIOD_DAYS, PAYCHECKS_PER_YEAR,
    parseDate, toISO, todayISO, periodStartFor, shiftPeriod, periodEnd,
    dueDatesBetween, billDueDates, defaultPlanned, computePeriod,
    threePaycheckMonths, assignLeftover, round2,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Budget = api;
})(typeof window !== 'undefined' ? window : globalThis);
