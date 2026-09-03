/* ============================================================================
   app.js — the working parts of the dashboard
   ----------------------------------------------------------------------------
   Reads TIMETABLE (from js/timetable.js), works out what is happening right
   now, and paints the page. Runs entirely in the browser; no server, no API.

   Reading order:
     1. Constants
     2. Time helpers
     3. Session building (raw periods -> merged blocks -> day plan with breaks)
     4. State resolution (what is on now, what is next)
     5. Rendering
     6. Interaction (tabs, day chips, theme, reminders)
     7. The tick loop
   ========================================================================== */

(function () {
  'use strict';

  /* ── 1. CONSTANTS ─────────────────────────────────────────────────────── */

  var TICK_MS = 250;                    // clock refresh; the display shows seconds

  var DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday',
                  'thursday', 'friday', 'saturday'];

  var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday',
                   'Thursday', 'Friday', 'Saturday'];

  var DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];

  var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Available looks. Each id matches a token block in css/style.css.
  var THEMES = [
    { id: 'terminal',   colour: '#0d1117' },
    { id: 'blueprint',  colour: '#0a1b2e' },
    { id: 'departure',  colour: '#0b0b0c' },
    { id: 'manuscript', colour: '#e4d3ac' }
  ];
  var DEFAULT_THEME = 'terminal';

  var WEEK_COLUMNS = [1, 2, 3, 4, 5, 6];  // Monday..Saturday, as printed

  var SETTINGS = TIMETABLE.settings;

  var $ = function (id) { return document.getElementById(id); };


  /* ── 2. TIME HELPERS ──────────────────────────────────────────────────── */

  /** "09:10" -> 550 (minutes past midnight) */
  function toMinutes(hhmm) {
    var bits = hhmm.split(':');
    return (parseInt(bits[0], 10) * 60) + parseInt(bits[1], 10);
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  /** "13:30" -> "1:30 PM" */
  function to12Hour(hhmm) {
    var m = toMinutes(hhmm);
    var h = Math.floor(m / 60);
    var mm = m % 60;
    var suffix = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12;
    if (h12 === 0) { h12 = 12; }
    return h12 + ':' + pad2(mm) + ' ' + suffix;
  }

  /**
   * A real Date for a given day offset and minute-of-day.
   * Built from midnight so day boundaries and month rollovers are handled
   * by the Date object itself rather than by arithmetic on strings.
   */
  function dateAt(base, dayOffset, minutes) {
    var d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    d.setDate(d.getDate() + dayOffset);
    d.setMinutes(minutes);            // setMinutes normalises values over 59
    return d;
  }

  /** milliseconds -> "01:23:45", or "2d 17:25:00" once past a day */
  function toCountdown(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    var days = Math.floor(total / 86400);
    var h = Math.floor((total % 86400) / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    var clock = pad2(h) + ':' + pad2(m) + ':' + pad2(s);
    return days > 0 ? days + 'd ' + clock : clock;
  }

  /** milliseconds -> "2 days 5 hr" / "1 hr 23 min" / "23 min" / "48 sec" */
  function toWords(ms) {
    var total = Math.max(0, Math.round(ms / 1000));
    if (total < 60) { return total + ' sec'; }
    var mins = Math.round(total / 60);
    if (mins < 60) { return mins + ' min'; }
    var hours = Math.floor(mins / 60);
    if (hours < 24) {
      var m = mins % 60;
      return hours + ' hr' + (m ? ' ' + m + ' min' : '');
    }
    var days = Math.floor(hours / 24);
    var h = hours % 24;
    return days + ' day' + (days > 1 ? 's' : '') + (h ? ' ' + h + ' hr' : '');
  }

  function durationWords(startMin, endMin) {
    var mins = endMin - startMin;
    if (mins < 60) { return mins + ' min'; }
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    return h + ' hr' + (m ? ' ' + m + ' min' : '');
  }

  function longDate(d) {
    return DAY_NAMES[d.getDay()] + ', ' + d.getDate() + ' ' +
           MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  /** "18 Aug" */
  function shortDate(d) {
    return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()];
  }

  /**
   * Calendar dates for Monday..Saturday of the week on screen, keyed by
   * getDay() index. The week starts on Monday; on a Sunday it rolls forward
   * to the week about to begin, since a past week is no use to anyone.
   */
  function weekDates(now) {
    var day = now.getDay();
    var deltaToMonday = (day === 0) ? 1 : (1 - day);
    var dates = {};
    for (var i = 1; i <= 6; i++) {
      dates[i] = new Date(now.getFullYear(), now.getMonth(),
                          now.getDate() + deltaToMonday + (i - 1));
    }
    return dates;
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }


  /* ── 3. SESSION BUILDING ──────────────────────────────────────────────── */

  var sessionCache = {};

  /** Raw periods for a day, in time order, one object per timetable slot. */
  function rawSessions(dayKey) {
    var entries = TIMETABLE.schedule[dayKey] || [];
    return entries.map(function (entry) {
      var slot = TIMETABLE.slots[entry.slot];
      var subject = TIMETABLE.subjects[entry.subject];
      var room = entry.room || '';
      var isLab = /^lab/i.test(room);
      return {
        id: dayKey + '-' + entry.slot,
        dayKey: dayKey,
        kind: 'class',
        slotFrom: entry.slot,
        slotTo: entry.slot,
        periods: 1,
        subject: subject,
        room: room,
        group: entry.group || '',
        note: entry.note || '',
        type: entry.type || (isLab ? 'Lab' : 'Lecture'),
        start: slot.start,
        end: slot.end,
        startMin: toMinutes(slot.start),
        endMin: toMinutes(slot.end)
      };
    }).sort(function (a, b) { return a.startMin - b.startMin; });
  }

  /** Join back-to-back periods of the same subject in the same room. */
  function mergeSessions(list) {
    if (!SETTINGS.mergeConsecutive) { return list.slice(); }
    var tolerance = SETTINGS.mergeGapTolerance;
    var out = [];
    list.forEach(function (session) {
      var prev = out[out.length - 1];
      var joinable = prev &&
        prev.subject === session.subject &&
        prev.room === session.room &&
        (session.startMin - prev.endMin) <= tolerance;

      if (joinable) {
        prev.end = session.end;
        prev.endMin = session.endMin;
        prev.slotTo = session.slotTo;
        prev.periods += session.periods;
      } else {
        out.push(Object.assign({}, session));
      }
    });
    return out;
  }

  /** Merged classes for a day (cached — the timetable never changes at runtime). */
  function daySessions(dayKey) {
    if (!sessionCache[dayKey]) {
      sessionCache[dayKey] = mergeSessions(rawSessions(dayKey));
    }
    return sessionCache[dayKey];
  }

  /** Merged classes with free-period rows inserted between them. */
  function dayPlan(dayKey) {
    var classes = daySessions(dayKey);
    var plan = [];
    classes.forEach(function (session, i) {
      plan.push(session);
      var next = classes[i + 1];
      if (next && (next.startMin - session.endMin) >= SETTINGS.freePeriodMinimum) {
        plan.push({
          id: dayKey + '-free-' + i,
          dayKey: dayKey,
          kind: 'free',
          start: session.end,
          end: next.start,
          startMin: session.endMin,
          endMin: next.startMin
        });
      }
    });
    return plan;
  }

  function isRestDay(dayKey) {
    return daySessions(dayKey).length === 0;
  }


  /* ── 4. STATE RESOLUTION ──────────────────────────────────────────────── */

  /**
   * Works out the live picture for a moment in time.
   * Returns { todayKey, current, next } where current/next carry real
   * timestamps (startAt / endAt) so countdowns survive day changes.
   */
  function resolveState(now) {
    var todayIndex = now.getDay();
    var todayKey = DAY_KEYS[todayIndex];
    var nowMs = now.getTime();
    var current = null;
    var next = null;

    // What is running right now (today only, by definition)
    daySessions(todayKey).some(function (session) {
      var startAt = dateAt(now, 0, session.startMin).getTime();
      var endAt = dateAt(now, 0, session.endMin).getTime();
      if (nowMs >= startAt && nowMs < endAt) {
        current = Object.assign({}, session, { startAt: startAt, endAt: endAt, dayOffset: 0 });
        return true;
      }
      return false;
    });

    // The nearest class still to come — searched forward across days,
    // so Friday evening correctly points at Monday morning.
    for (var offset = 0; offset <= 7 && !next; offset++) {
      var key = DAY_KEYS[(todayIndex + offset) % 7];
      daySessions(key).some(function (session) {
        var startAt = dateAt(now, offset, session.startMin).getTime();
        if (startAt > nowMs) {
          next = Object.assign({}, session, {
            startAt: startAt,
            endAt: dateAt(now, offset, session.endMin).getTime(),
            dayOffset: offset,
            dayKey: key
          });
          return true;
        }
        return false;
      });
    }

    return { todayKey: todayKey, todayIndex: todayIndex, current: current, next: next };
  }

  /** "Today" / "Tomorrow" / "Monday" for a day offset. */
  function offsetLabel(now, offset) {
    if (offset === 0) { return 'Today'; }
    if (offset === 1) { return 'Tomorrow'; }
    return DAY_NAMES[(now.getDay() + offset) % 7];
  }


  /* ── 5. RENDERING ─────────────────────────────────────────────────────── */

  /** "Faculty · Room · Group · 2 periods" — already HTML-escaped. */
  function subjectLine(session) {
    var bits = [];
    if (session.room) { bits.push(session.room); }
    if (session.group) { bits.push(session.group); }
    if (session.subject.faculty) { bits.unshift(session.subject.faculty); }
    if (session.periods > 1) { bits.push(session.periods + ' periods'); }
    return bits.map(escapeHtml).join(' · ');
  }

  function cornerMarkup() {
    return '<span class="cornerset" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
  }

  /* --- masthead clock ---------------------------------------------------- */

  function renderClock(now) {
    var h = now.getHours();
    var h12 = h % 12; if (h12 === 0) { h12 = 12; }
    $('clockTime').textContent = pad2(h12) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds());
    $('clockMeridiem').textContent = (h >= 12 ? 'PM' : 'AM');
    $('clockDate').textContent = longDate(now);
    var week = weekDates(now);
    $('clockWeek').textContent = 'Week of ' + shortDate(week[1]) + ' — ' + shortDate(week[6]);
  }

  /* --- hero: the live class --------------------------------------------- */

  function renderHero(now, state) {
    var host = $('heroCard');
    var today = daySessions(state.todayKey);
    var html = cornerMarkup();

    if (state.current) {
      html += heroLive(now, state.current);
    } else if (today.length === 0) {
      html += heroMessage('badge--rest', 'Rest day',
        'No classes today',
        DAY_NAMES[now.getDay()] + ' carries no periods on your timetable.');
    } else {
      var firstStart = dateAt(now, 0, today[0].startMin).getTime();
      var lastEnd = dateAt(now, 0, today[today.length - 1].endMin).getTime();
      if (now.getTime() < firstStart) {
        html += heroMessage('badge--upcoming', 'Before first period',
          'The day has not begun',
          'First class of the day starts at ' + to12Hour(today[0].start) + '.');
      } else if (now.getTime() >= lastEnd) {
        html += heroMessage('badge--done', 'Day complete',
          'Classes have concluded',
          'The last period ended at ' + to12Hour(today[today.length - 1].end) + '.');
      } else {
        html += heroFree(now, today);
      }
    }

    host.innerHTML = html;
  }

  function heroLive(now, session) {
    var elapsed = now.getTime() - session.startAt;
    var total = session.endAt - session.startAt;
    var remaining = session.endAt - now.getTime();
    var donePct = Math.min(100, Math.max(0, (elapsed / total) * 100));
    var leftPct = 100 - donePct;
    var periodLabel = session.periods > 1
      ? 'Periods ' + (session.slotFrom + 1) + '–' + (session.slotTo + 1) + ' of ' + TIMETABLE.slots.length
      : 'Period ' + (session.slotFrom + 1) + ' of ' + TIMETABLE.slots.length;

    return '' +
      '<div class="hero__top">' +
        '<span class="badge badge--live"><span class="pulse"></span> In session</span>' +
        '<span class="hero__period">' + periodLabel + ' · ' + escapeHtml(session.type) + '</span>' +
      '</div>' +

      '<h2 class="hero__subject">' + escapeHtml(session.subject.name) + '</h2>' +
      (session.subject.subtitle
        ? '<p class="hero__subtitle">' + escapeHtml(session.subject.subtitle) + '</p>' : '') +

      '<div class="facts">' +
        fact('Started', to12Hour(session.start)) +
        fact('Ends', to12Hour(session.end)) +
        (session.room ? fact('Room', session.room) : '') +
        (session.group ? fact('Group', session.group) : '') +
        (session.subject.faculty ? fact('Faculty', session.subject.faculty) : '') +
        (session.subject.code ? fact('Code', session.subject.code) : '') +
      '</div>' +

      '<div class="slab">' +
        '<div>' +
          '<p class="slab__count slab__count--live">' + toCountdown(remaining) + '</p>' +
          '<p class="slab__note">Remaining</p>' +
        '</div>' +
        '<p class="slab__words">' + toWords(remaining) + ' left of ' +
          durationWords(session.startMin, session.endMin) + '</p>' +
      '</div>' +

      inkLine(donePct, leftPct);
  }

  function heroFree(now, today) {
    // find the gap we are sitting in
    var nowMs = now.getTime();
    var prev = null, upcoming = null;
    today.forEach(function (s) {
      if (dateAt(now, 0, s.endMin).getTime() <= nowMs) { prev = s; }
      if (!upcoming && dateAt(now, 0, s.startMin).getTime() > nowMs) { upcoming = s; }
    });
    var gapStart = prev ? dateAt(now, 0, prev.endMin) : null;
    var gapEnd = upcoming ? dateAt(now, 0, upcoming.startMin) : null;
    var remaining = gapEnd ? gapEnd.getTime() - nowMs : 0;
    var total = (gapStart && gapEnd) ? gapEnd.getTime() - gapStart.getTime() : 0;
    var donePct = total ? Math.min(100, ((nowMs - gapStart.getTime()) / total) * 100) : 0;

    return '' +
      '<div class="hero__top">' +
        '<span class="badge badge--free">Free period</span>' +
        '<span class="hero__period">' +
          (prev ? to12Hour(prev.end) : '') + ' — ' + (upcoming ? to12Hour(upcoming.start) : '') +
        '</span>' +
      '</div>' +
      '<h2 class="hero__subject">No class right now</h2>' +
      '<p class="hero__subtitle">The next period begins at ' +
        (upcoming ? to12Hour(upcoming.start) : '—') + '.</p>' +
      '<div class="slab">' +
        '<div>' +
          '<p class="slab__count">' + toCountdown(remaining) + '</p>' +
          '<p class="slab__note">Until the next class</p>' +
        '</div>' +
        '<p class="slab__words">' + toWords(remaining) + ' of free time left</p>' +
      '</div>' +
      inkLine(donePct, 100 - donePct, 'Break elapsed', 'Break left');
  }

  function heroMessage(badgeClass, badgeText, title, body) {
    return '' +
      '<div class="hero__top">' +
        '<span class="badge ' + badgeClass + '">' + badgeText + '</span>' +
      '</div>' +
      '<h2 class="hero__subject">' + title + '</h2>' +
      '<p class="hero__subtitle">' + body + '</p>';
  }

  function fact(label, value) {
    return '<div class="fact">' +
             '<p class="fact__label">' + escapeHtml(label) + '</p>' +
             '<p class="fact__value">' + escapeHtml(value) + '</p>' +
           '</div>';
  }

  function inkLine(donePct, leftPct, doneLabel, leftLabel) {
    return '<div class="ink">' +
             '<div class="ink__rule">' +
               '<div class="ink__fill" style="width:' + donePct.toFixed(2) + '%">' +
                 '<span class="ink__nib"></span>' +
               '</div>' +
             '</div>' +
             '<p class="ink__legend">' +
               '<span><b>' + donePct.toFixed(1) + '%</b> ' + (doneLabel || 'Completed') + '</span>' +
               '<span><b>' + leftPct.toFixed(1) + '%</b> ' + (leftLabel || 'Remaining') + '</span>' +
             '</p>' +
           '</div>';
  }

  /* --- next class -------------------------------------------------------- */

  function renderNext(now, state) {
    var host = $('nextCard');
    if (!state.next) {
      host.hidden = true;
      return;
    }
    host.hidden = false;
    var next = state.next;
    var when = offsetLabel(now, next.dayOffset);

    host.innerHTML =
      '<div class="next__left">' +
        '<span class="badge badge--upcoming">Next class</span>' +
        '<h2 class="next__name">' + escapeHtml(next.subject.name) + '</h2>' +
        '<p class="next__meta">' + when + ' · ' + to12Hour(next.start) + ' — ' +
          to12Hour(next.end) + (subjectLine(next) ? ' · ' + subjectLine(next) : '') +
        '</p>' +
      '</div>' +
      '<div class="next__right">' +
        '<p class="next__count">' + toCountdown(next.startAt - now.getTime()) + '</p>' +
        '<p class="slab__note">Starts in</p>' +
      '</div>';
  }

  /* --- day chips --------------------------------------------------------- */

  function renderDayChips(now, todayIndex) {
    var host = $('dayButtons');
    var dates = weekDates(now);
    host.innerHTML = WEEK_COLUMNS.map(function (index) {
      var classes = 'daychip';
      if (index === selectedDayIndex) { classes += ' is-selected'; }
      if (index === todayIndex) { classes += ' is-today'; }
      return '<button type="button" class="' + classes + '" data-day="' + index + '">' +
               DAY_SHORT[index] +
               '<small>' + shortDate(dates[index]) + '</small>' +
             '</button>';
    }).join('');
  }

  /* --- today's ledger ---------------------------------------------------- */

  function renderLedger(now, state) {
    var host = $('ledger');
    var dayKey = DAY_KEYS[selectedDayIndex];
    var viewingToday = selectedDayIndex === state.todayIndex;
    var plan = dayPlan(dayKey);

    $('scheduleDate').textContent = viewingToday
      ? longDate(now)
      : DAY_NAMES[selectedDayIndex] + ' · ' + shortDate(weekDates(now)[selectedDayIndex]);

    if (plan.length === 0) {
      host.innerHTML = '<li class="empty"><strong>No classes</strong>' +
        DAY_NAMES[selectedDayIndex] + ' is free on your timetable.</li>';
      return;
    }

    var nowMs = now.getTime();

    host.innerHTML = plan.map(function (item) {
      if (item.kind === 'free') {
        return '<li class="entry entry--free">' +
                 timeCell(item) +
                 '<div class="entry__body">' +
                   '<p class="entry__name">Free period</p>' +
                   '<p class="entry__meta">' + durationWords(item.startMin, item.endMin) + ' unscheduled</p>' +
                 '</div>' +
                 '<div class="entry__tail"><span class="badge badge--free">Free</span></div>' +
               '</li>';
      }

      var status = 'upcoming';
      var bar = '';
      if (viewingToday) {
        var startAt = dateAt(now, 0, item.startMin).getTime();
        var endAt = dateAt(now, 0, item.endMin).getTime();
        if (nowMs >= endAt) {
          status = 'done';
        } else if (nowMs >= startAt) {
          status = 'live';
          var pct = ((nowMs - startAt) / (endAt - startAt)) * 100;
          bar = '<div class="entry__bar"><i style="width:' + pct.toFixed(2) + '%"></i></div>';
        }
      }

      var badge =
        status === 'live' ? '<span class="badge badge--live"><span class="pulse"></span> Live</span>' :
        status === 'done' ? '<span class="badge badge--done">Completed</span>' :
                            '<span class="badge badge--upcoming">Upcoming</span>';

      return '<li class="entry entry--' + status + '">' +
               timeCell(item) +
               '<div class="entry__body">' +
                 '<p class="entry__name">' + escapeHtml(item.subject.name) + '</p>' +
                 '<p class="entry__meta">' +
                   (subjectLine(item) || escapeHtml(item.type)) +
                   (item.subject.code ? ' · ' + escapeHtml(item.subject.code) : '') +
                 '</p>' +
                 (item.note ? '<p class="entry__meta">' + escapeHtml(item.note) + '</p>' : '') +
               '</div>' +
               '<div class="entry__tail">' + badge + '</div>' +
               bar +
             '</li>';
    }).join('');
  }

  function timeCell(item) {
    return '<div class="entry__time">' + to12Hour(item.start) +
             '<span>' + to12Hour(item.end) + '</span>' +
           '</div>';
  }

  /* --- weekly views ------------------------------------------------------ */

  function renderWeek(now, todayIndex) {
    var dates = weekDates(now);
    $('weekSub').textContent = TIMETABLE.meta.section + ' · timetable of ' + TIMETABLE.meta.sourceWeek;

    /* grid (desktop): every printed slot, exactly as the university prints it */
    var cells = ['<div class="wg-cell wg-head" role="columnheader">Slot</div>'];
    WEEK_COLUMNS.forEach(function (index) {
      cells.push('<div class="wg-cell wg-head' + (index === todayIndex ? ' wg-col-today' : '') +
                 '" role="columnheader">' + DAY_SHORT[index] +
                 '<small>' + shortDate(dates[index]) + '</small></div>');
    });

    TIMETABLE.slots.forEach(function (slot, slotIndex) {
      cells.push('<div class="wg-cell wg-time" role="rowheader">' +
                   slot.start + '<br>' + slot.end + '</div>');

      WEEK_COLUMNS.forEach(function (dayIndex) {
        var dayKey = DAY_KEYS[dayIndex];
        var match = null;
        rawSessions(dayKey).some(function (s) {
          if (s.slotFrom === slotIndex) { match = s; return true; }
          return false;
        });

        var classes = 'wg-cell' + (dayIndex === todayIndex ? ' wg-col-today' : '');
        if (!match) {
          cells.push('<div class="' + classes + '" role="cell"></div>');
          return;
        }
        var inner = '<div class="wg-class' + (match.type === 'Lab' ? ' wg-class--lab' : '') + '">' +
                      '<b>' + escapeHtml(match.subject.abbr) + '</b>' +
                      (match.room ? '<span>' + escapeHtml(match.room) + '</span><br>' : '') +
                      (match.group ? '<span>' + escapeHtml(match.group) + '</span>' : '') +
                    '</div>';
        cells.push('<div class="' + classes + '" role="cell">' + inner + '</div>');
      });
    });
    $('weekGrid').innerHTML = cells.join('');

    /* stack (mobile): merged blocks, easier to read on a phone */
    $('weekStack').innerHTML = WEEK_COLUMNS.map(function (dayIndex) {
      var dayKey = DAY_KEYS[dayIndex];
      var list = daySessions(dayKey);
      var rows = list.length
        ? list.map(function (s) {
            return '<div class="wsrow">' +
                     '<p class="wsrow__time">' + s.start + '<br>' + s.end + '</p>' +
                     '<div>' +
                       '<p class="wsrow__name">' + escapeHtml(s.subject.name) + '</p>' +
                       '<p class="wsrow__meta">' + (subjectLine(s) || escapeHtml(s.type)) + '</p>' +
                     '</div>' +
                   '</div>';
          }).join('')
        : '<div class="wsrow"><p class="wsrow__time">—</p><p class="wsrow__meta">No classes</p></div>';

      return '<section class="wsday' + (dayIndex === todayIndex ? ' wsday--today' : '') + '">' +
               '<header class="wsday__head">' +
                 '<h3 class="wsday__name">' + DAY_NAMES[dayIndex] +
                   (dayIndex === todayIndex ? ' — Today' : '') + '</h3>' +
                 '<span class="wsday__date">' + shortDate(dates[dayIndex]) + '</span>' +
               '</header>' + rows +
             '</section>';
    }).join('');
  }

  /* --- courses ----------------------------------------------------------- */

  function renderCourses() {
    var tally = {};
    DAY_KEYS.forEach(function (dayKey) {
      rawSessions(dayKey).forEach(function (s) {
        var key = s.subject.code || s.subject.name;
        if (!tally[key]) {
          tally[key] = { subject: s.subject, periods: 0, minutes: 0, rooms: {}, days: {} };
        }
        tally[key].periods += 1;
        tally[key].minutes += (s.endMin - s.startMin);
        if (s.room) { tally[key].rooms[s.room] = true; }
        tally[key].days[dayKey] = true;
      });
    });

    var list = Object.keys(tally).map(function (k) { return tally[k]; })
      .sort(function (a, b) { return b.periods - a.periods; });

    $('courses').innerHTML = list.map(function (item) {
      var hours = (item.minutes / 60);
      var rooms = Object.keys(item.rooms);
      return '<article class="course">' +
               '<p class="course__code">' + escapeHtml(item.subject.code || 'No code listed') + '</p>' +
               '<h3 class="course__name">' + escapeHtml(item.subject.name) + '</h3>' +
               (item.subject.subtitle
                 ? '<p class="course__subtitle">' + escapeHtml(item.subject.subtitle) + '</p>' : '') +
               '<div class="course__stats">' +
                 '<span><b>' + item.periods + '</b> periods / week</span>' +
                 '<span><b>' + hours.toFixed(1) + '</b> hrs / week</span>' +
                 '<span><b>' + Object.keys(item.days).length + '</b> days</span>' +
               '</div>' +
               '<div class="course__stats">' +
                 '<span>Room: <b>' + (rooms.length ? escapeHtml(rooms.join(', ')) : '—') + '</b></span>' +
               '</div>' +
               '<div class="course__stats">' +
                 '<span>Faculty: <b>' +
                   (item.subject.faculty ? escapeHtml(item.subject.faculty) : 'Not listed') +
                 '</b></span>' +
               '</div>' +
             '</article>';
    }).join('');
  }

  /* --- static chrome ----------------------------------------------------- */

  function renderStatic() {
    var meta = TIMETABLE.meta;
    $('metaLine').textContent = [meta.institution, meta.programme, meta.semester, meta.section]
      .filter(Boolean).join(' · ');

    // The last word of the title is picked out in the accent colour.
    var words = (meta.title || 'Class Timetable').split(' ');
    var last = words.pop();
    $('titleLine').innerHTML = escapeHtml(words.join(' ')) +
      (words.length ? ' ' : '') + '<span>' + escapeHtml(last) + '</span>';

    $('taglineLine').textContent = meta.tagline || '';
    document.title = (meta.title || 'Class Timetable') + ' — ' + (meta.tagline || 'Dashboard');
    $('colophonLine').textContent = meta.programme + ' · ' + meta.batch + ' · ' +
      meta.semester + ' · ' + meta.section;
  }


  /* ── 6. INTERACTION ───────────────────────────────────────────────────── */

  var selectedDayIndex = new Date().getDay();
  if (selectedDayIndex === 0) { selectedDayIndex = 1; }   // Sunday opens on Monday

  /* tabs */
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
    tab.addEventListener('click', function () {
      Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
        t.classList.toggle('is-active', t === tab);
        if (t === tab) { t.setAttribute('aria-current', 'page'); }
        else { t.removeAttribute('aria-current'); }
      });
      ['today', 'week', 'subjects'].forEach(function (name) {
        $('view-' + name).hidden = (name !== tab.dataset.view);
      });
    });
  });

  /* day chips (event delegation — chips are re-rendered) */
  $('dayButtons').addEventListener('click', function (event) {
    var chip = event.target.closest('.daychip');
    if (!chip) { return; }
    selectedDayIndex = parseInt(chip.dataset.day, 10);
    forceRender = true;
  });

  /* theme picker */
  var root = document.documentElement;

  function readStored(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function writeStored(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* private mode */ }
  }

  function themeById(id) {
    var found = null;
    THEMES.forEach(function (t) { if (t.id === id) { found = t; } });
    return found;
  }

  function applyTheme(id) {
    var theme = themeById(id) || themeById(DEFAULT_THEME);
    root.setAttribute('data-theme', theme.id);

    // keep the browser/phone chrome in step with the page
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) { meta.setAttribute('content', theme.colour); }

    Array.prototype.forEach.call(document.querySelectorAll('.chip[data-theme-id]'), function (chip) {
      var on = chip.dataset.themeId === theme.id;
      chip.classList.toggle('is-active', on);
      chip.setAttribute('aria-pressed', String(on));
    });
  }

  applyTheme(readStored('timetable-theme') || DEFAULT_THEME);

  Array.prototype.forEach.call(document.querySelectorAll('.chip[data-theme-id]'), function (chip) {
    chip.addEventListener('click', function () {
      applyTheme(chip.dataset.themeId);
      writeStored('timetable-theme', chip.dataset.themeId);
    });
  });

  /* optional reminders — nothing here is required for the page to work */
  var remindersOn = false;
  var alreadyNotified = {};

  function setReminderUi(on) {
    remindersOn = on;
    $('notifyToggle').setAttribute('aria-pressed', String(on));
    $('notifyLabel').textContent = on ? 'Reminders on' : 'Class reminders';
  }

  $('notifyToggle').addEventListener('click', function () {
    if (!('Notification' in window)) {
      $('notifyLabel').textContent = 'Not supported here';
      return;
    }
    if (remindersOn) { setReminderUi(false); return; }
    try {
      Notification.requestPermission().then(function (result) {
        if (result === 'granted') { setReminderUi(true); }
        else { $('notifyLabel').textContent = 'Reminders blocked'; }
      });
    } catch (e) {
      $('notifyLabel').textContent = 'Reminders unavailable';
    }
  });

  function maybeRemind(now, next) {
    if (!remindersOn || !next) { return; }
    var minutesAway = (next.startAt - now.getTime()) / 60000;
    var key = next.id + '@' + next.startAt;
    if (minutesAway > 0 && minutesAway <= SETTINGS.notifyLeadMinutes && !alreadyNotified[key]) {
      alreadyNotified[key] = true;
      try {
        new Notification('Class in ' + Math.round(minutesAway) + ' min', {
          body: next.subject.name + (next.room ? ' · ' + next.room : '') +
                ' · starts ' + to12Hour(next.start)
        });
      } catch (e) { /* ignore — reminders are a bonus, never a requirement */ }
    }
  }


  /* ── 7. THE TICK LOOP ─────────────────────────────────────────────────── */

  var lastKey = '';
  var forceRender = false;

  function tick() {
    var now = new Date();
    var state = resolveState(now);

    renderClock(now);

    /* A cheap signature of everything that changes the layout. When it is the
       same as last tick, only the numbers that move each second are redrawn. */
    var key = [
      state.todayKey,
      selectedDayIndex,
      state.current ? state.current.id : 'none',
      state.next ? next_id(state.next) : 'none'
    ].join('|');

    if (forceRender || key !== lastKey) {
      lastKey = key;
      forceRender = false;
      renderDayChips(now, state.todayIndex);
      renderHero(now, state);
      renderNext(now, state);
      renderLedger(now, state);
      renderWeek(now, state.todayIndex);
    } else {
      updateTicking(now, state);
    }

    maybeRemind(now, state.next);
  }

  function next_id(next) { return next.id + '@' + next.dayOffset; }

  /** Per-second updates that do not need a full repaint. */
  function updateTicking(now, state) {
    var nowMs = now.getTime();

    /* hero countdown + ink line */
    var heroCount = document.querySelector('#heroCard .slab__count');
    var heroWords = document.querySelector('#heroCard .slab__words');
    var fill = document.querySelector('#heroCard .ink__fill');
    var legend = document.querySelectorAll('#heroCard .ink__legend b');

    if (state.current && heroCount) {
      var remaining = state.current.endAt - nowMs;
      var total = state.current.endAt - state.current.startAt;
      var donePct = Math.min(100, ((nowMs - state.current.startAt) / total) * 100);
      heroCount.textContent = toCountdown(remaining);
      if (heroWords) {
        heroWords.textContent = toWords(remaining) + ' left of ' +
          durationWords(state.current.startMin, state.current.endMin);
      }
      if (fill) { fill.style.width = donePct.toFixed(2) + '%'; }
      if (legend.length === 2) {
        legend[0].textContent = donePct.toFixed(1) + '%';
        legend[1].textContent = (100 - donePct).toFixed(1) + '%';
      }
    } else if (!state.current && heroCount && state.next && state.next.dayOffset === 0) {
      // free period countdown
      var left = state.next.startAt - nowMs;
      heroCount.textContent = toCountdown(left);
      if (heroWords) { heroWords.textContent = toWords(left) + ' of free time left'; }
    }

    /* next-class countdown */
    var nextCount = document.querySelector('#nextCard .next__count');
    if (nextCount && state.next) {
      nextCount.textContent = toCountdown(state.next.startAt - nowMs);
    }

    /* live row progress in the ledger */
    var liveBar = document.querySelector('.entry--live .entry__bar i');
    if (liveBar && state.current) {
      var pct = ((nowMs - state.current.startAt) /
                 (state.current.endAt - state.current.startAt)) * 100;
      liveBar.style.width = pct.toFixed(2) + '%';
    }
  }

  /* start */
  renderStatic();
  renderCourses();
  tick();
  setInterval(tick, TICK_MS);

  /* redraw immediately when the tab is brought back into view, so a phone
     waking from sleep never shows a stale class */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { forceRender = true; tick(); }
  });

})();
