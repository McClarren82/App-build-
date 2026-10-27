// UI for the bi-weekly zero-based budget dashboard. Depends on window.Budget (budget.js).
(function () {
  'use strict';

  const B = window.Budget;
  const STORAGE_KEY = 'paycheck-planner:v1';
  const GROUP_VARS = {
    Bills: '--g-bills', Living: '--g-living', Savings: '--g-savings',
    Debt: '--g-debt', Giving: '--g-giving', Fun: '--g-fun',
  };

  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const moneyShort = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const fmt = (n) => money.format(n || 0);
  const fmtShort = (n) => moneyShort.format(n || 0);
  const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const dateLong = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const fmtDate = (iso) => dateFmt.format(B.parseDate(iso));
  const fmtDateLong = (iso) => dateLong.format(B.parseDate(iso));
  const groupColor = (g) => `var(${GROUP_VARS[g]})`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10);

  // ---- State -------------------------------------------------------------

  function sampleState() {
    const today = B.todayISO();
    const items = [
      ['Rent', 'Bills', 'monthly', 1300],
      ['Electric', 'Bills', 'bill', 120, 15],
      ['Internet', 'Bills', 'bill', 70, 20],
      ['Phone', 'Bills', 'bill', 85, 8],
      ['Car insurance', 'Bills', 'bill', 140, 12],
      ['Streaming', 'Fun', 'bill', 35, 18],
      ['Groceries', 'Living', 'perPaycheck', 275],
      ['Gas', 'Living', 'perPaycheck', 90],
      ['Household', 'Living', 'perPaycheck', 40],
      ['Emergency fund', 'Savings', 'perPaycheck', 150],
      ['Car repairs fund', 'Savings', 'monthly', 50],
      ['Holiday fund', 'Savings', 'monthly', 100],
      ['Car payment', 'Debt', 'bill', 320, 5],
      ['Student loan', 'Debt', 'bill', 220, 25],
      ['Giving', 'Giving', 'perPaycheck', 100],
      ['Fun money', 'Fun', 'perPaycheck', 75],
    ].map(([name, group, kind, amount, dueDay]) => ({ id: uid(), name, group, kind, amount, dueDay: dueDay || 1 }));
    return {
      settings: { payAmount: 2150, payDate: B.periodStartFor('2026-10-23', today), leadDays: 0, theme: 'auto' },
      items,
      periods: {},
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.settings && Array.isArray(s.items)) return { periods: {}, ...s };
      }
    } catch (e) { /* storage unavailable: fall back to sample data */ }
    return sampleState();
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  let state = load();
  let view = 'dashboard';
  let current = B.periodStartFor(state.settings.payDate, B.todayISO());

  function setState(next) {
    state = next;
    save();
    render();
  }

  function periodRec(start) {
    const r = state.periods[start] || {};
    return { extraIncome: r.extraIncome || 0, overrides: { ...(r.overrides || {}) }, actuals: { ...(r.actuals || {}) } };
  }

  function updatePeriod(start, fn) {
    const rec = periodRec(start);
    fn(rec);
    setState({ ...state, periods: { ...state.periods, [start]: rec } });
  }

  function applyTheme() {
    const t = state.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
  }

  // ---- Shared bits -------------------------------------------------------

  function statusBadge(left) {
    if (Math.abs(left) < 0.005) return '<span class="status good"><span class="dot"></span>✓ Every dollar assigned</span>';
    if (left > 0) return `<span class="status warn"><span class="dot"></span>! ${fmt(left)} still to assign</span>`;
    return `<span class="status crit"><span class="dot"></span>✕ Over by ${fmt(-left)}</span>`;
  }

  function kindLabel(line) {
    const it = line.item;
    if (it.kind === 'bill') {
      return line.due.length ? `Due ${line.due.map(fmtDate).join(', ')}` : `Due the ${ordinal(it.dueDay)} · not this paycheck`;
    }
    if (it.kind === 'monthly') return `${fmt(it.amount)}/mo set aside`;
    return 'Every paycheck';
  }

  function ordinal(n) {
    n = Number(n);
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  // ---- Dashboard ---------------------------------------------------------

  function renderDashboard() {
    const p = B.computePeriod(state, current);
    const thisPeriod = B.periodStartFor(state.settings.payDate, B.todayISO());
    const isCurrent = current === thisPeriod;

    return `
      <div class="period-bar">
        <div class="period-nav">
          <button class="btn icon" data-action="prev" aria-label="Previous paycheck">‹</button>
          <div>
            <h2>Paycheck ${fmtDateLong(p.start)}</h2>
            <div class="when">Covers ${fmtDate(p.start)} – ${fmtDate(p.end)}${isCurrent ? ' · <b>current</b>' : ''}</div>
          </div>
          <button class="btn icon" data-action="next" aria-label="Next paycheck">›</button>
          ${isCurrent ? '' : '<button class="btn" data-action="today">Today</button>'}
        </div>
        <label class="field" style="grid-auto-flow: column; align-items: center;">
          Extra income this period
          <input class="money" type="number" step="0.01" min="0" data-action="extra" value="${p.extraIncome || ''}" placeholder="0.00">
        </label>
      </div>

      <section class="kpis">
        <div class="card kpi">
          <div class="label">Paycheck income</div>
          <div class="value">${fmt(p.income)}</div>
          <div class="note">${p.extraIncome ? `incl. ${fmt(p.extraIncome)} extra` : 'net take-home'}</div>
        </div>
        <div class="card kpi">
          <div class="label">Assigned</div>
          <div class="value">${fmt(p.planned)}</div>
          <div class="note">${p.lines.filter((l) => l.planned > 0).length} line items</div>
        </div>
        <div class="card kpi">
          <div class="label">Left to budget</div>
          <div class="value">${fmt(p.leftToBudget)}</div>
          ${statusBadge(p.leftToBudget)}
        </div>
        <div class="card kpi">
          <div class="label">Spent so far</div>
          <div class="value">${fmt(p.spent)}</div>
          <div class="note">${fmt(p.planned - p.spent)} of plan remaining</div>
        </div>
      </section>

      <section class="grid two" style="margin-bottom:16px">
        <div class="card">
          <h2>Where this paycheck goes</h2>
          <p class="hint">Zero-based means this bar is full with nothing hatched left over.</p>
          ${allocationBar(p)}
          ${zeroOutControl(p)}
        </div>
        <div class="card chart">
          <h2>Next 12 paychecks</h2>
          <p class="hint">Planned outflow by group vs. income (dashed). Click a bar to open that paycheck.</p>
          ${upcomingChart()}
        </div>
      </section>

      <section class="grid two">
        <div class="card">
          <h2>Paycheck plan</h2>
          <p class="hint">Edit <b>Planned</b> to adjust just this paycheck (blue outline = changed from default). Log <b>Spent</b> as you go.</p>
          ${lineTable(p)}
        </div>
        <div class="card">
          <h2>Spending vs. plan</h2>
          <p class="hint">Bars fill as you log spending; red means over plan.</p>
          ${progressList(p)}
        </div>
      </section>`;
  }

  function allocationBar(p) {
    const total = Math.max(p.income, p.planned) || 1;
    const segs = p.byGroup.filter((g) => g.planned > 0).map((g) => `
      <div style="flex:${g.planned / total};background:${groupColor(g.group)}"
        data-tip="${esc(JSON.stringify({ title: g.group, rows: [['Planned', fmt(g.planned)], ['Share of income', pct(g.planned, p.income)]] }))}"></div>`).join('');
    const unassigned = p.leftToBudget > 0
      ? `<div class="unassigned" style="flex:${p.leftToBudget / total}" data-tip="${esc(JSON.stringify({ title: 'Unassigned', rows: [['Amount', fmt(p.leftToBudget)]] }))}"></div>`
      : '';
    const legend = p.byGroup.filter((g) => g.planned > 0).map((g) =>
      `<span><span class="sw" style="background:${groupColor(g.group)}"></span>${g.group} <b>${fmtShort(g.planned)}</b></span>`).join('');
    return `
      <div class="alloc" role="img" aria-label="Allocation of ${fmt(p.income)} income across groups">${segs}${unassigned}</div>
      <div class="legend">${legend}${p.leftToBudget > 0 ? `<span><span class="sw unassigned" style="background:var(--grid)"></span>Unassigned <b>${fmtShort(p.leftToBudget)}</b></span>` : ''}</div>`;
  }

  function pct(a, b) {
    return b ? `${Math.round((a / b) * 100)}%` : '—';
  }

  function zeroOutControl(p) {
    if (Math.abs(p.leftToBudget) < 0.005) return '<div class="zero-box">' + statusBadge(0) + '</div>';
    // Default the target to the first savings item: leftovers usually belong there.
    const target = (state.items.find((it) => it.group === 'Savings') || {}).id;
    const opts = state.items.map((it) => `<option value="${it.id}"${it.id === target ? ' selected' : ''}>${esc(it.name)}</option>`).join('');
    const verb = p.leftToBudget > 0 ? `Give the remaining ${fmt(p.leftToBudget)} to` : `Take the ${fmt(-p.leftToBudget)} overage from`;
    return `
      <div class="zero-box">
        ${verb}
        <select id="zero-target" aria-label="Line item">${opts}</select>
        <button class="btn primary" data-action="zero">Zero it out</button>
      </div>`;
  }

  function lineTable(p) {
    const rows = B.GROUPS.map((g) => {
      const lines = p.lines.filter((l) => l.item.group === g);
      if (!lines.length) return '';
      const gp = lines.reduce((s, l) => s + l.planned, 0);
      const gs = lines.reduce((s, l) => s + l.spent, 0);
      return `
        <tr class="group-row"><td><span class="sw" style="background:${groupColor(g)}"></span>${g}</td>
          <td class="num">${fmt(gp)}</td><td class="num">${fmt(gs)}</td><td class="num">${fmt(gp - gs)}</td></tr>
        ${lines.map((l) => `
          <tr${l.planned === 0 && l.spent === 0 ? ' class="idle"' : ''}>
            <td>${esc(l.item.name)}<div class="meta">${kindLabel(l)}${l.overridden ? ` · default ${fmt(l.base)} <a href="#" data-action="reset-line" data-id="${l.item.id}">reset</a>` : ''}</div></td>
            <td class="num"><input class="money${l.overridden ? ' overridden' : ''}" type="number" step="0.01" min="0" aria-label="Planned for ${esc(l.item.name)}"
              data-action="planned" data-id="${l.item.id}" value="${l.planned}"></td>
            <td class="num"><input class="money" type="number" step="0.01" min="0" aria-label="Spent on ${esc(l.item.name)}"
              data-action="spent" data-id="${l.item.id}" value="${l.spent || ''}" placeholder="0.00"></td>
            <td class="num">${fmt(l.remaining)}</td>
          </tr>`).join('')}`;
    }).join('');
    return `
      <div class="table-wrap"><table>
        <thead><tr><th>Item</th><th class="num">Planned</th><th class="num">Spent</th><th class="num">Remaining</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td>Total</td><td class="num">${fmt(p.planned)}</td><td class="num">${fmt(p.spent)}</td><td class="num">${fmt(p.planned - p.spent)}</td></tr></tfoot>
      </table></div>`;
  }

  function progressList(p) {
    const lines = p.lines.filter((l) => l.planned > 0 || l.spent > 0);
    if (!lines.length) return '<p class="meta">Nothing planned this paycheck.</p>';
    return `<div class="progress">${lines.map((l) => {
      const over = l.spent > l.planned + 0.005;
      const w = l.planned > 0 ? Math.min(100, (l.spent / l.planned) * 100) : 100;
      return `
        <div class="row">
          <span class="name">${esc(l.item.name)}</span>
          <span class="amt">${fmtShort(l.spent)} / ${fmtShort(l.planned)}${over ? ` <span class="over">✕ over ${fmtShort(l.spent - l.planned)}</span>` : ''}</span>
          <div class="track"><div class="fill" style="width:${w}%;background:${over ? 'var(--critical)' : groupColor(l.item.group)}"></div></div>
        </div>`;
    }).join('')}</div>`;
  }

  function niceMax(v) {
    if (v <= 0) return 100;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / mag;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return step * mag;
  }

  function upcomingChart() {
    const thisPeriod = B.periodStartFor(state.settings.payDate, B.todayISO());
    const periods = Array.from({ length: 12 }, (_, i) => B.computePeriod(state, B.shiftPeriod(thisPeriod, i)));
    const W = 560, H = 260, padL = 52, padR = 8, padT = 10, padB = 34;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const max = niceMax(Math.max(...periods.map((p) => Math.max(p.income, p.planned))) * 1.05);
    const y = (v) => padT + plotH - (v / max) * plotH;
    const slot = plotW / periods.length;
    const barW = Math.min(28, slot * 0.6);

    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
      const v = max * f, yy = y(v);
      return `<line class="${f === 0 ? 'baseline' : 'gridline'}" x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}"/>
        <text class="tick" x="${padL - 8}" y="${yy + 4}" text-anchor="end">${fmtShort(v)}</text>`;
    }).join('');

    const bars = periods.map((p, i) => {
      const cx = padL + slot * i + slot / 2;
      const x = cx - barW / 2;
      let acc = 0;
      const groups = p.byGroup.filter((g) => g.planned > 0);
      const segs = groups.map((g, gi) => {
        const y0 = y(acc), y1 = y(acc + g.planned);
        acc += g.planned;
        const top = gi === groups.length - 1;
        const h = Math.max(0, y0 - y1 - (top ? 0 : 2));
        // Top segment gets rounded data-end; others stay square with a 2px gap above.
        return top
          ? `<path d="${roundedTop(x, y1, barW, h, 4)}" fill="${groupColor(g.group)}"/>`
          : `<rect x="${x}" y="${y1 + 2}" width="${barW}" height="${h}" fill="${groupColor(g.group)}"/>`;
      }).join('');
      const incY = y(p.income);
      const tip = {
        title: `Paycheck ${fmtDate(p.start)}`,
        rows: [['Income', fmt(p.income)], ...groups.map((g) => [g.group, fmt(g.planned)]), ['Planned', fmt(p.planned)], ['Left to budget', fmt(p.leftToBudget)]],
      };
      const label = i % 2 === 0 || periods.length <= 6 ? `<text class="tick" x="${cx}" y="${H - padB + 16}" text-anchor="middle">${fmtDate(p.start)}</text>` : '';
      const flag = Math.abs(p.leftToBudget) >= 0.005
        ? `<text class="tick" x="${cx}" y="${H - 4}" text-anchor="middle" style="fill:${p.leftToBudget < 0 ? 'var(--critical)' : 'var(--text-2)'}">${p.leftToBudget < 0 ? '✕' : '!'}</text>`
        : `<text class="tick" x="${cx}" y="${H - 4}" text-anchor="middle" style="fill:var(--good)">✓</text>`;
      return `
        ${p.start === current ? `<rect class="sel" x="${padL + slot * i}" y="${padT}" width="${slot}" height="${plotH}"/>` : ''}
        ${segs}
        <line class="income-line" x1="${x - 4}" x2="${x + barW + 4}" y1="${incY}" y2="${incY}"/>
        ${label}${flag}
        <rect class="hit" x="${padL + slot * i}" y="${padT}" width="${slot}" height="${plotH + padB}" data-action="goto" data-start="${p.start}"
          data-tip="${esc(JSON.stringify(tip))}"/>`;
    }).join('');

    const used = B.GROUPS.filter((g) => periods.some((p) => p.byGroup.find((b) => b.group === g).planned > 0));
    const legend = used.map((g) => `<span><span class="sw" style="background:${groupColor(g)}"></span>${g}</span>`).join('')
      + '<span><span class="dash-sw"></span>Income</span>'
      + '<span>✓ zeroed · ! unassigned · ✕ over</span>';

    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Planned outflow for the next 12 paychecks">${ticks}${bars}</svg>
      <div class="legend">${legend}</div>`;
  }

  function roundedTop(x, y, w, h, r) {
    r = Math.min(r, h, w / 2);
    return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
  }

  // ---- Setup -------------------------------------------------------------

  function renderSetup() {
    const s = state.settings;
    const kindOpts = (k) => Object.entries(B.KINDS).map(([v, label]) => `<option value="${v}"${v === k ? ' selected' : ''}>${label}</option>`).join('');
    const groupOpts = (g) => B.GROUPS.map((v) => `<option${v === g ? ' selected' : ''}>${v}</option>`).join('');
    const perPaycheck = (it) => B.defaultPlanned({ ...it, kind: it.kind === 'bill' ? 'monthly' : it.kind }, s.payDate, s);
    const avgTotal = state.items.reduce((sum, it) => sum + perPaycheck(it), 0);
    const avgLeft = (Number(s.payAmount) || 0) - avgTotal;

    return `
      <section class="card" style="margin:8px 0 16px">
        <h2>Paycheck</h2>
        <p class="hint">Enter your net (take-home) pay per bi-weekly paycheck and any one of your pay dates.</p>
        <div class="settings">
          <label class="field">Net pay per paycheck
            <input type="number" step="0.01" min="0" data-setting="payAmount" value="${s.payAmount}"></label>
          <label class="field">A pay date
            <input type="date" data-setting="payDate" value="${s.payDate}"></label>
          <label class="field">Pay bills this many days early
            <input type="number" step="1" min="0" max="13" data-setting="leadDays" value="${s.leadDays}"></label>
          <label class="field">Theme
            <select data-setting="theme">
              ${['auto', 'light', 'dark'].map((t) => `<option value="${t}"${t === s.theme ? ' selected' : ''}>${t[0].toUpperCase() + t.slice(1)}</option>`).join('')}
            </select></label>
        </div>
      </section>

      <section class="card">
        <div class="toolbar" style="justify-content:space-between;margin-bottom:8px">
          <div>
            <h2>Budget items</h2>
            <p class="hint" style="margin:0">Bills land on the paycheck that covers their due date. "Monthly, split evenly" sets aside amount × 12 ÷ 26 every paycheck.</p>
          </div>
          <button class="btn primary" data-action="add-item">+ Add item</button>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Group</th><th>Type</th><th class="num">Monthly / per-check amount</th><th class="num">Due day</th><th class="num">Avg per paycheck</th><th></th></tr></thead>
          <tbody>
            ${state.items.map((it) => `
              <tr>
                <td><input class="text" data-item="${it.id}" data-field="name" value="${esc(it.name)}" aria-label="Name"></td>
                <td><select class="text" data-item="${it.id}" data-field="group" aria-label="Group">${groupOpts(it.group)}</select></td>
                <td><select class="text" data-item="${it.id}" data-field="kind" aria-label="Type">${kindOpts(it.kind)}</select></td>
                <td class="num"><input class="money" type="number" step="0.01" min="0" data-item="${it.id}" data-field="amount" value="${it.amount}" aria-label="Amount"></td>
                <td class="num">${it.kind === 'bill'
                  ? `<input class="small" type="number" min="1" max="31" data-item="${it.id}" data-field="dueDay" value="${it.dueDay}" aria-label="Due day">`
                  : '<span class="meta">—</span>'}</td>
                <td class="num">${fmt(perPaycheck(it))}</td>
                <td><button class="btn danger" data-action="del-item" data-id="${it.id}" aria-label="Delete ${esc(it.name)}">✕</button></td>
              </tr>`).join('')}
          </tbody>
          <tfoot><tr><td colspan="5">Average per paycheck (bills averaged over the year)</td><td class="num">${fmt(avgTotal)}</td><td></td></tr></tfoot>
        </table></div>
        <div class="zero-box">${statusBadge(B.round2(avgLeft))}<span class="meta">on an average paycheck — individual paychecks vary with bill due dates.</span></div>
      </section>

      <section class="card" style="margin-top:16px">
        <h2>Data</h2>
        <p class="hint">Your budget is saved in this browser. Export a backup or move it to another device.</p>
        <div class="toolbar">
          <button class="btn" data-action="export">Export JSON</button>
          <label class="btn">Import JSON<input type="file" accept="application/json" data-action="import" hidden></label>
          <button class="btn danger" data-action="reset">Reset to sample data</button>
        </div>
      </section>`;
  }

  // ---- Year ahead --------------------------------------------------------

  function renderYear() {
    const thisPeriod = B.periodStartFor(state.settings.payDate, B.todayISO());
    const starts = Array.from({ length: 26 }, (_, i) => B.shiftPeriod(thisPeriod, i));
    const triple = new Set(B.threePaycheckMonths(starts));
    const periods = starts.map((s) => B.computePeriod(state, s));
    const totIncome = periods.reduce((s, p) => s + p.income, 0);
    const totPlanned = periods.reduce((s, p) => s + p.planned, 0);

    return `
      <section class="card" style="margin-top:8px">
        <h2>Next 26 paychecks</h2>
        <p class="hint">Highlighted rows are the third paycheck in a month — monthly bills are already covered, so it's a great time to boost savings or debt. Click a row to open it.</p>
        <div class="table-wrap"><table>
          <thead><tr><th>Pay date</th><th class="num">Income</th><th class="num">Bills due</th><th class="num">Planned</th><th class="num">Left to budget</th><th>Status</th></tr></thead>
          <tbody>
            ${periods.map((p) => {
              const bills = p.lines.filter((l) => l.item.kind === 'bill').reduce((s, l) => s + l.planned, 0);
              const isTriple = triple.has(p.start.slice(0, 7)) && starts.filter((s) => s.slice(0, 7) === p.start.slice(0, 7)).indexOf(p.start) === 2;
              return `
                <tr class="${isTriple ? 'flag' : ''} ${p.start === current ? 'current' : ''}" data-action="goto" data-start="${p.start}" style="cursor:pointer">
                  <td>${fmtDateLong(p.start)}${isTriple ? '<span class="pill">3rd paycheck</span>' : ''}</td>
                  <td class="num">${fmt(p.income)}</td>
                  <td class="num">${fmt(bills)}</td>
                  <td class="num">${fmt(p.planned)}</td>
                  <td class="num">${fmt(p.leftToBudget)}</td>
                  <td>${statusBadge(p.leftToBudget)}</td>
                </tr>`;
            }).join('')}
          </tbody>
          <tfoot><tr><td>Year total</td><td class="num">${fmt(totIncome)}</td><td></td><td class="num">${fmt(totPlanned)}</td><td class="num">${fmt(totIncome - totPlanned)}</td><td></td></tr></tfoot>
        </table></div>
      </section>`;
  }

  // ---- Render & events ---------------------------------------------------

  const app = document.getElementById('app');
  const tooltip = document.getElementById('tooltip');

  function render() {
    applyTheme();
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === view)));
    app.innerHTML = view === 'setup' ? renderSetup() : view === 'year' ? renderYear() : renderDashboard();
  }

  document.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-view]');
    if (!b) return;
    view = b.dataset.view;
    render();
  });

  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if (a === 'prev') { current = B.shiftPeriod(current, -1); render(); }
    else if (a === 'next') { current = B.shiftPeriod(current, 1); render(); }
    else if (a === 'today') { current = B.periodStartFor(state.settings.payDate, B.todayISO()); render(); }
    else if (a === 'goto') { current = el.dataset.start; view = 'dashboard'; hideTip(); render(); }
    else if (a === 'zero') { setState(B.assignLeftover(state, current, document.getElementById('zero-target').value)); }
    else if (a === 'reset-line') {
      e.preventDefault();
      updatePeriod(current, (r) => { delete r.overrides[el.dataset.id]; });
    }
    else if (a === 'add-item') {
      setState({ ...state, items: [...state.items, { id: uid(), name: 'New item', group: 'Living', kind: 'perPaycheck', amount: 0, dueDay: 1 }] });
    }
    else if (a === 'del-item') {
      setState({ ...state, items: state.items.filter((it) => it.id !== el.dataset.id) });
    }
    else if (a === 'export') {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `paycheck-budget-${B.todayISO()}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
    }
    else if (a === 'reset') {
      if (confirm('Replace your budget with the sample data? This cannot be undone.')) {
        state = sampleState();
        current = B.periodStartFor(state.settings.payDate, B.todayISO());
        save(); render();
      }
    }
  });

  app.addEventListener('change', (e) => {
    const el = e.target;
    const num = (v) => Math.max(0, Number(v) || 0);

    if (el.dataset.action === 'planned') {
      updatePeriod(current, (r) => { r.overrides[el.dataset.id] = num(el.value); });
    } else if (el.dataset.action === 'spent') {
      updatePeriod(current, (r) => { r.actuals[el.dataset.id] = num(el.value); });
    } else if (el.dataset.action === 'extra') {
      updatePeriod(current, (r) => { r.extraIncome = num(el.value); });
    } else if (el.dataset.action === 'import') {
      const file = el.files && el.files[0];
      if (!file) return;
      file.text().then((txt) => {
        const s = JSON.parse(txt);
        if (!s.settings || !Array.isArray(s.items)) throw new Error('bad file');
        state = { periods: {}, ...s };
        current = B.periodStartFor(state.settings.payDate, B.todayISO());
        save(); render();
      }).catch(() => alert('That file doesn\'t look like a Paycheck Planner export.'));
    } else if (el.dataset.setting) {
      const key = el.dataset.setting;
      let val = el.value;
      if (key === 'payAmount') val = num(val);
      if (key === 'leadDays') val = Math.min(13, Math.floor(num(val)));
      if (key === 'payDate' && !val) return;
      setState({ ...state, settings: { ...state.settings, [key]: val } });
      if (key === 'payDate') current = B.periodStartFor(val, B.todayISO());
      render();
    } else if (el.dataset.item) {
      const f = el.dataset.field;
      let val = el.value;
      if (f === 'amount') val = num(val);
      if (f === 'dueDay') val = Math.min(31, Math.max(1, Math.floor(Number(val) || 1)));
      setState({ ...state, items: state.items.map((it) => (it.id === el.dataset.item ? { ...it, [f]: val } : it)) });
    }
  });

  // Tooltips for any element carrying data-tip (chart bars, allocation segments).
  function hideTip() { tooltip.hidden = true; }
  app.addEventListener('mousemove', (e) => {
    const el = e.target.closest('[data-tip]');
    if (!el) return hideTip();
    const t = JSON.parse(el.dataset.tip);
    tooltip.innerHTML = `<div class="tt-title">${esc(t.title)}</div>${t.rows.map(([k, v]) => `<div class="tt-row"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}`;
    tooltip.hidden = false;
    const r = tooltip.getBoundingClientRect();
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - 14;
    if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - 14;
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  });
  app.addEventListener('mouseleave', hideTip);

  render();
})();
