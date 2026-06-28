# POSH Compass — Web Demo

A front-end demo of **POSH Compass** (Jijiwisha Society · POSH vertical) — a digital
platform for mandatory harassment-prevention training that measures *understanding,
not attendance*. The UI reproduces the mockups from `The_Posh_Jijiwisha.pptx`.

It runs in two modes:

- **Offline demo** — plain HTML/CSS/JS, no server. Just double-click `index.html`.
  The questionnaire grades in the browser using `assets/questions.js`.
- **Online (full stack)** — a Node.js/Express backend adds real accounts, server-side
  grading, saved attempts, issued certificates and a live admin dashboard.

The frontend auto-detects the backend: if `/api/health` responds it runs online,
otherwise it falls back to the offline demo.

## Run it — offline demo

Double-click **`index.html`**, or serve the folder: `npx http-server -p 8080`.

## Run it — with the backend (recommended)

One command (installs deps if needed, starts API + site on :8000):

```powershell
./run-backend.ps1
```

Then open <http://localhost:8000>. Sign in with the seeded demo admin
(**admin@demo.gov** / **demo1234**) to see the live dashboard, or register a
fresh organisation. Manual start instead of the script:

```powershell
npm install
npm start
```

### Backend at a glance

- **Stack**: Node.js/Express + SQLite via the built-in `node:sqlite` module
  (`backend/poshcompass.db`). Token auth and password hashing use Node's built-in
  `crypto` module only — no native build deps. Swap `backend/db.js` for another
  engine in production.
- **Security**: correct answers never ship to the browser; every answer is graded
  on the server (`backend/scoring.js`). Every action is written to an `audit_log`.
- **Key endpoints** (`/api`): `auth/register`, `auth/login`, `me`, `attempts`,
  `attempts/{id}/answer`, `attempts/{id}/finish`, `verify/{code}`, `admin/stats`.

```
backend/
  server.js         Express app: routes, auth middleware, static mount
  db.js             SQLite connection + schema
  auth.js           password hashing + token sign/verify
  scoring.js        server-side grading for all five formats
  questionsSeed.js  question bank (payload kept separate from answers)
  seed.js           demo org/data seeding
```

> The original Python/FastAPI implementation is kept for reference in
> `backend-python/`.

## Pages

| File | What it is | Mockup it matches |
|------|------------|-------------------|
| `index.html` | Marketing homepage — hero + compass, sourced stat band, how-it-works, question-bank overview, pricing | Slide 15 (One Front Door) |
| `assessment.html` | **The demo questionnaire** — start screen → 5-format quiz → results → certificate | Slides 16 (Learning Layer), 22 (Live Simulations), 24 (Certificate) |
| `dashboard.html` | Admin compliance dashboard — KPIs, department completion, org-compliance donut, pre/post, activity feed, dept risk index + evidence pack | Slides 17 / 23 (Data Layer & Admin Dashboard), 18 (Audit Module) |

## The questionnaire

The demo ships a representative subset of every question format. The full programme:

| Format | Demo | Full target |
|--------|-----:|------------:|
| Fill in the Blank (FIB) | 4 | **500** |
| Match the Following (MTF) | 2 | **300** |
| Multiple Choice (MCQ) | 4 | **200** |
| Case Studies | 2 | **108** |
| Live Case Simulations | 2 | **100** |

Scoring: each question contributes points; **≥80%** earns an individual certificate
(the mockup threshold). The module breakdown and certificate appear on the results screen.

### Adding more questions

- **Offline demo** content lives in [`assets/questions.js`](assets/questions.js).
- **Backend** content lives in [`backend/questions_seed.py`](backend/questions_seed.py)
  (delete `backend/poshcompass.db` to re-seed). Keep the two in sync, or point the
  offline bank at the backend.

The engine renders and scores anything you add automatically — just append objects.
Schema per format:

- **mcq** — `{ text, options[], answer (index), explain }`
- **fib** — `{ before, after, answer[] (accepted strings), explain }`
- **mtf** — `{ instruction, pairs[{left,right}], explain }`
- **caseStudy** — `{ scenario, subs[{ text, options[], answer, explain }] }`
- **simulation** — `{ label, branch, scenario, question, options[{ text, verdict, outcome }], explain }`
  where `verdict` is `recommended` | `also-correct` | `wrong`.

## Files

```
index.html · assessment.html · dashboard.html    front-end pages
run-backend.ps1                                   one-shot backend launcher
assets/
  styles.css        design system (forest-green / orange / gold palette from the deck)
  api.js            tiny API client + online/offline detection
  questions.js      offline demo question bank
  assessment.js     dual-mode quiz engine: render, grade, progress, certificate
backend/
  app.py · scoring.py · questions_seed.py · requirements.txt
```

> Illustrative product demo. All figures are the sourced statistics from the deck;
> question content is aligned to the POSH Act, 2013.
