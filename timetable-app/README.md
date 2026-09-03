# Class Timetable — Real-Time Dashboard

A live class dashboard for **B.Tech CSE (AI & ML), Semester 3, Section A** at K.R. Mangalam University.

It reads your device clock every second and shows what class is running, how much of it is
left, and what's coming next — with the full weekly timetable underneath. Pure HTML, CSS and
JavaScript: no build step, no server, no database, no API.

---

## 1. Running it locally

**Easiest way:** double-click `index.html`. It opens in your browser and works immediately —
there are no ES modules or `fetch()` calls, so the `file://` protocol is fine.

**If you prefer a local server** (optional):

```bash
cd timetable-app
python3 -m http.server 8000
# then open http://localhost:8000
```

The only thing that needs the internet is the Google Fonts stylesheet. Offline, the page falls
back to your system fonts and everything still works.

---

## 2. Themes

Four complete looks, switchable from the buttons in the header. Your choice is remembered on
that device.

| Theme | Look |
|---|---|
| **Terminal** *(default)* | Dark editor. Charcoal-blue ground, mint accent, monospace labels, soft corners. |
| **Blueprint** | Drafting sheet. Deep navy with a cyan measuring grid and crosshair corner marks. |
| **Departure** | Station board. Near-black slats, amber numerals with a glow, wide-tracked capitals. |
| **Manuscript** | Light parchment. Warm paper ground, gold rules, inscriptional serif — the readable one in daylight. |

A theme isn't just a colour swap: palette, typeface, texture, corner treatment, border radius
and type scale all change together. Everything is driven by a token block at the top of
`css/style.css`, so adding a fifth theme means copying one block and changing the values.

To change which theme loads first, edit `DEFAULT_THEME` near the top of `js/app.js`.

---

## 3. Editing the timetable

**Everything lives in `js/timetable.js`.** You never need to touch the other files.

### Change a period timing

```js
slots: [
  { start: "09:10", end: "10:00" },   // slot 0
  { start: "10:05", end: "10:55" },   // slot 1
  ...
]
```

Use 24-hour `"HH:MM"` strings. Add or remove slots freely — the weekly grid resizes itself.

### Add a faculty name

Faculty names weren't readable in the timetable screenshot, so they're blank. Fill one in and it
appears on the live card, the day list and the Courses tab automatically:

```js
daa: {
  name: "Design & Analysis of Algorithms",
  code: "ETCCDA302",
  faculty: "Dr. A. Sharma",     // <- just type it here
  ...
}
```

### Add, move or remove a class

```js
monday: [
  { slot: 0, subject: "webdev", room: "B-217", group: "Group 07" },
  { slot: 2, subject: "verbal", room: "B-217", group: "Group 01" },
]
```

- `slot` — index into the `slots` array (`0` = first period)
- `subject` — a key from the `subjects` object
- `room`, `group` — free text
- `note` — optional extra line shown under the class
- `type` — optional; otherwise it's auto-set to `Lab` when the room starts with "LAB"

**Leave a slot out to make it a free period.** The app inserts the free-period rows itself.

### Behaviour switches

| Setting | Default | What it does |
|---|---|---|
| `mergeConsecutive` | `true` | Joins back-to-back periods of the same subject into one block (Web Dev 09:10–10:00 + 10:05–10:55 shows as **09:10–10:55**). Set `false` to keep every period separate. |
| `mergeGapTolerance` | `10` | Biggest gap in minutes still treated as back-to-back. |
| `freePeriodMinimum` | `15` | Gaps at least this long get a "Free period" row. |
| `notifyLeadMinutes` | `10` | How early the optional reminder fires. |

The **Weekly timetable** tab always shows the raw, unmerged grid so it matches your official
university timetable cell for cell.

---

## 4. Deploying to GitHub Pages

1. Create a new repository on GitHub (e.g. `timetable`).
2. Upload every file from this folder into the repository root — `index.html` must sit at the
   top level, not inside a subfolder.

   ```bash
   cd timetable-app
   git init
   git add .
   git commit -m "Class timetable dashboard"
   git branch -M main
   git remote add origin https://github.com/<your-username>/timetable.git
   git push -u origin main
   ```

3. On GitHub: **Settings → Pages → Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: **main**, folder: **/ (root)**
   - Save.

4. Wait about a minute. Your site is live at:

   ```
   https://<your-username>.github.io/timetable/
   ```

All paths in the project are relative, so it works from a subfolder URL without changes. The
included `.nojekyll` file stops GitHub's Jekyll step from interfering.

**Tip:** on Android/iOS, open the site and use "Add to Home screen" — it opens full-screen like
an app, and the phone's status bar picks up the active theme's colour.

---

## 5. What each file does

```
timetable-app/
├── index.html          Page structure. Static markup only; the live parts are filled by JS.
├── css/
│   └── style.css       Four theme token blocks, then all styling built from those tokens.
├── js/
│   ├── timetable.js    YOUR DATA. Slots, subjects, weekly schedule, behaviour settings.
│   └── app.js          The logic: clock, live-class detection, countdowns, themes, rendering.
├── assets/
│   └── favicon.svg     Browser tab icon.
├── .nojekyll           Tells GitHub Pages to serve files as-is.
└── README.md           This file.
```

`app.js` reads the global `TIMETABLE` object from `timetable.js` — that's the only connection
between them, which is why editing your schedule can never break the app logic.

---

## 6. Features

- **Live clock** with the full date and the current week's date range, updating every second.
- **Current class panel** — subject, room, group, start, end, an `HH:MM:SS` countdown, and a
  progress rule that fills as the class runs, with exact percentages.
- **Next class** — always the nearest upcoming class, searched forward across days, so Friday
  evening correctly counts down to Monday morning (shown as `2d 13:10:00`).
- **Today's schedule** with `Live` / `Completed` / `Upcoming` / `Free` states; past classes fade,
  the running one is marked with a coloured rule and a live progress bar.
- **Day picker** (Mon–Sat) showing each day's calendar date, opening on today automatically.
- **Weekly timetable** — a proper grid on desktop with today's column highlighted; stacked,
  readable day cards on mobile.
- **Courses tab** — weekly period count, hours and rooms, calculated from your data.
- **Four themes**, remembered between visits.
- **Optional class reminders** via browser notifications. Entirely opt-in — the page never asks
  for permission unless you press the button, and everything works if you decline.

### Time-logic edge cases handled

Before the first class · between classes · after the last class · free periods and lunch gaps ·
rest days (Saturday and Sunday) · midnight rollover · waking a sleeping phone (the page redraws
on tab focus) · counting forward into next week. All comparisons use real `Date` objects, never
string comparison.

The day picker shows the Monday–Saturday week you're currently in. On a Sunday it rolls forward
to the week about to start, since a finished week is no use to anyone.

---

## 7. Notes on the source timetable

Transcribed from the official timetable for **10 Aug – 16 Aug 2026**, treated as the repeating
weekly pattern. Two things needed interpretation, both flagged here so you can correct them in
`js/timetable.js` in seconds:

1. **"Introduction to Machine Learning"** appears in the source as grey text spanning cells
   rather than as a normal class card, with no code, room or group. It has been entered as:
   Monday 12:40–14:20, Tuesday 12:40–13:30, Wednesday 14:20–16:00.
2. **Faculty names** were not visible in the source, so every `faculty` field is blank and the
   interface shows "Not listed" until you fill them in.

Everything else — subject codes, rooms, groups and timings — is exactly as printed.
