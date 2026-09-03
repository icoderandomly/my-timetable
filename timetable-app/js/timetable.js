/* ============================================================================
   timetable.js  —  ALL YOUR TIMETABLE DATA LIVES HERE
   ----------------------------------------------------------------------------
   This is the ONLY file you need to edit to change your schedule.
   Nothing here talks to the internet. Everything runs in the browser.

   HOW TO EDIT — three parts:
     1. SLOTS     : the 8 daily period timings (24-hour "HH:MM" strings)
     2. SUBJECTS  : each course, its code and (optional) faculty name
     3. SCHEDULE  : which subject sits in which slot, on which day

   A schedule entry looks like this:
       { slot: 0, subject: "webdev", room: "B-217", group: "Group 07" }
     - slot    : index into SLOTS below (0 = 09:10–10:00, 1 = 10:05–10:55, ...)
     - subject : a key from SUBJECTS below
     - room    : free text, shown on the card
     - group   : free text, shown as a small tag
     - note    : optional free text, shown under the class
     - type    : optional; overrides the auto-detected "Lecture" / "Lab"

   Leave a slot out entirely to make it a free period.
   ============================================================================ */

const TIMETABLE = {

  /* ------------------------------------------------------------------
     COURSE / HEADER INFORMATION  (shown in the masthead and footer)
     ------------------------------------------------------------------ */
  meta: {
    institution: "K.R. Mangalam University",
    programme: "B.Tech CSE (AI & ML)",
    batch: "2025–2029",
    semester: "Semester 3",
    section: "Section A",
    sourceWeek: "10 Aug 2026 – 16 Aug 2026",

    // Shown large in the header. The final word is picked out in the accent colour.
    title: "Class Timetable",
    tagline: "Live dashboard — what's on now, what's next"
  },

  /* ------------------------------------------------------------------
     BEHAVIOUR SETTINGS
     ------------------------------------------------------------------ */
  settings: {
    // Join back-to-back periods of the same subject in the same room into a
    // single block (e.g. Web Dev 09:10–10:00 + 10:05–10:55 shows as 09:10–10:55).
    // Set to false to keep every period separate on the Today view.
    mergeConsecutive: true,

    // Largest gap (minutes) that will still be treated as "back-to-back".
    mergeGapTolerance: 10,

    // Gaps of at least this many minutes are shown as a Free Period row.
    freePeriodMinimum: 15,

    // Optional browser reminder is fired this many minutes before a class.
    notifyLeadMinutes: 10,

    // Days that carry no classes at all (used for the "rest day" message).
    restDays: ["saturday", "sunday"]

    // The look is chosen with the Theme buttons in the header and remembered
    // per device. To change the default, edit DEFAULT_THEME near the top of
    // js/app.js: 'terminal', 'blueprint', 'departure' or 'manuscript'.
  },

  /* ------------------------------------------------------------------
     PERIOD TIMINGS  —  exactly as printed on the university timetable
     ------------------------------------------------------------------ */
  slots: [
    { start: "09:10", end: "10:00" }, // 0
    { start: "10:05", end: "10:55" }, // 1
    { start: "11:00", end: "11:50" }, // 2
    { start: "11:50", end: "12:40" }, // 3
    { start: "12:40", end: "13:30" }, // 4
    { start: "13:30", end: "14:20" }, // 5
    { start: "14:20", end: "15:10" }, // 6
    { start: "15:10", end: "16:00" }  // 7
  ],

  /* ------------------------------------------------------------------
     SUBJECTS
     `faculty` is intentionally blank — faculty names were not visible in the
     source timetable. Fill them in and they appear everywhere automatically.
     ------------------------------------------------------------------ */
  subjects: {
    webdev: {
      name: "Web Development III",
      subtitle: "Node.js & Express Backend",
      code: "ETCCWD303",
      abbr: "WEB DEV",
      faculty: "",
      accent: "indigo"
    },
    daa: {
      name: "Design & Analysis of Algorithms",
      subtitle: "",
      code: "ETCCDA302",
      abbr: "DAA",
      faculty: "",
      accent: "gold"
    },
    dbms: {
      name: "Database Management Systems",
      subtitle: "",
      code: "ETCCMS304",
      abbr: "DBMS",
      faculty: "",
      accent: "patina"
    },
    coding: {
      name: "Competitive Coding I",
      subtitle: "",
      code: "AUC001",
      abbr: "CC-I",
      faculty: "",
      accent: "vermilion"
    },
    nand2tetris: {
      name: "Nand to Tetris I",
      subtitle: "",
      code: "ETCCNT301",
      abbr: "N2T",
      faculty: "",
      accent: "indigo"
    },
    verbal: {
      name: "Verbal Ability",
      subtitle: "",
      code: "UNAEVB001",
      abbr: "VERBAL",
      faculty: "",
      accent: "patina"
    },
    community: {
      name: "Community Services",
      subtitle: "SGET",
      code: "CS002",
      abbr: "COMMUNITY",
      faculty: "",
      accent: "patina"
    },
    ml: {
      name: "Introduction to Machine Learning",
      subtitle: "",
      code: "",
      abbr: "ML",
      faculty: "",
      accent: "vermilion"
    }
  },

  /* ------------------------------------------------------------------
     WEEKLY SCHEDULE
     Transcribed from the official timetable for 10 Aug – 16 Aug 2026.
     ------------------------------------------------------------------ */
  schedule: {

    monday: [
      { slot: 0, subject: "webdev",  room: "B-217", group: "Group 07" },
      { slot: 1, subject: "webdev",  room: "B-217", group: "Group 07" },
      { slot: 2, subject: "verbal",  room: "B-217", group: "Group 01" },
      // 11:50–12:40 free
      { slot: 4, subject: "ml",      room: "",      group: "" },
      { slot: 5, subject: "ml",      room: "",      group: "" },
      { slot: 6, subject: "coding",  room: "B-217", group: "Group 06" },
      { slot: 7, subject: "coding",  room: "B-217", group: "Group 06" }
    ],

    tuesday: [
      { slot: 0, subject: "daa",         room: "B-217", group: "Group 07" },
      { slot: 1, subject: "daa",         room: "B-217", group: "Group 07" },
      { slot: 2, subject: "dbms",        room: "B-116", group: "Group 07" },
      // 11:50–12:40 free
      { slot: 4, subject: "ml",          room: "",      group: "" },
      // 13:30–14:20 free
      { slot: 6, subject: "nand2tetris", room: "B-217", group: "Group 07" },
      { slot: 7, subject: "nand2tetris", room: "B-217", group: "Group 07" }
    ],

    wednesday: [
      { slot: 0, subject: "dbms",        room: "LAB-19-D201", group: "Group 07" },
      { slot: 1, subject: "dbms",        room: "LAB-19-D201", group: "Group 07" },
      { slot: 2, subject: "webdev",      room: "B-217",       group: "Group 07" },
      { slot: 3, subject: "nand2tetris", room: "B-217",       group: "Group 07" },
      // 12:40–13:30 free
      { slot: 5, subject: "community",   room: "B-217",       group: "Group 07" },
      { slot: 6, subject: "ml",          room: "",            group: "" },
      { slot: 7, subject: "ml",          room: "",            group: "" }
    ],

    thursday: [
      { slot: 0, subject: "coding",      room: "B-315", group: "Group 06" },
      { slot: 1, subject: "coding",      room: "B-315", group: "Group 06" },
      // 11:00–12:40 free
      { slot: 4, subject: "nand2tetris", room: "B-217", group: "Group 07" },
      { slot: 5, subject: "nand2tetris", room: "B-217", group: "Group 07" },
      { slot: 6, subject: "daa",         room: "B-217", group: "Group 07" },
      { slot: 7, subject: "daa",         room: "B-217", group: "Group 07" }
    ],

    friday: [
      { slot: 0, subject: "webdev", room: "B-217", group: "Group 07" },
      { slot: 1, subject: "webdev", room: "B-217", group: "Group 07" },
      { slot: 2, subject: "dbms",   room: "B-217", group: "Group 07" },
      { slot: 3, subject: "dbms",   room: "B-217", group: "Group 07" },
      // 12:40–13:30 free
      { slot: 5, subject: "daa",    room: "B-217", group: "Group 07" },
      // 14:20–15:10 free
      { slot: 7, subject: "verbal", room: "B-217", group: "Group 01" }
    ],

    saturday: [],

    sunday: []
  }
};
