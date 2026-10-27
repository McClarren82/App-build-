# Paycheck Planner

A bi-weekly, zero-based budget dashboard. Every paycheck gets its own plan, and the goal is that each one hits **$0 left to budget**.

## Run it

No build step or dependencies. Open `index.html` in a browser, or serve the folder:

```sh
npm start        # serves at http://localhost:8000
npm test         # unit tests for the budgeting logic (Node 18+)
```

Data is saved in your browser's localStorage. Use **Budget setup → Export JSON** to back it up or move it to another device.

## How it works

- **Pay periods**: enter your net pay and any one pay date. The app builds the 14-day grid from that date.
- **Budget items** come in three types:
  - **Bill (due date)**: a monthly amount due on a day of the month. It is planned in the paycheck whose period covers the due date. Set "Pay bills this many days early" to move bills onto an earlier paycheck.
  - **Every paycheck**: the same amount from every check (groceries, gas, savings).
  - **Monthly, split evenly**: a monthly amount set aside as `amount × 12 ÷ 26` per paycheck (rent sinking fund, annual expenses).
- **Dashboard**: shows income, assigned, left to budget and spent for the selected paycheck. It also has an allocation bar by group, a chart of the next 12 paychecks against income, and an editable plan where you can override planned amounts for one paycheck and log spending. **Zero it out** moves any leftover (or overage) onto a line item you pick.
- **Year ahead**: lists the next 26 paychecks with their status and highlights the third paycheck in a month.

## Files

- `index.html`: the app page
- `src/budget.js`: pure budgeting logic (periods, bill placement, totals)
- `src/app.js`: UI rendering and events
- `src/styles.css`: styles with light and dark themes
- `tests/budget.test.js`: logic tests
