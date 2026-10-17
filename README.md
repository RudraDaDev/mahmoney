# MahMoney 💸

Teen micro-finance app. Cash only, rupees, small amounts. Track spending, savings goals, and who owes whom.

## Stack
- Vanilla HTML/CSS/JS (no build step)
- Supabase (optional) or localStorage (demo mode)
- Client-side password gate (not secure — by design, as requested)

## Run locally
Just open `index.html` in a browser, OR serve the folder:

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## First run
You'll be asked to create a password (min 3 chars). That locks the app on this device (sessionStorage). Data is stored locally until you configure Supabase.

## Configure Supabase (optional)
1. Create a Supabase project.
2. Run `schema.sql` in the SQL editor.
3. In `config.js`, set `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
4. Reload. Badge shows "☁️ Cloud".

### schema.sql
See `schema.sql` in this folder.

### Security note
RLS is disabled in schema.sql (anon can read/write). This is intentional per request ("doesn't matter if hacked"). Do NOT store sensitive data.

## v2 features
- Charts: spending by category (donut) + last 7 days (bars), plain canvas, no libs
- Bills & reminders: due dates, monthly-repeating ones roll forward automatically
- Tags on transactions + dedicated Transactions view with search & category filter
- Savings goals with optional % per month interest and 12-month projection
- PWA: installable, offline after first load (service worker)
- Fresh UI: sticker-note style, cream/lime/pink, Baloo 2 + Caveat fonts, no boring dark-blue default

## v1 features
- Dashboard: cash in hand, total in/out, monthly budget progress + over-budget alert
- Cash count tool (count notes to verify balance)
- Add income/expense with categories
- Split bill: auto-creates debts for everyone else's share
- Savings goals with progress
- Owe / lent tracker with settle
- Recurring monthly pocket money (auto)
- Export JSON / CSV, clear data
- Change password

## Deploy
Drop the folder on any static host (GitHub Pages, Netlify, Vercel). Works offline in local mode.
