// Runs in every frame of the portal; only acts in the frame that holds the
// "My Class Schedule" list view (PeopleSoft grid CLASS_MTG_VW).

const GRID_PREFIX = 'CLASS_MTG_VW$scroll$';
const DAYS = { Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6 };
const SGT_OFFSET_HOURS = 8; // Singapore has no DST

const text = (el) => (el ? el.innerText.trim() : '');
const byPrefix = (root, prefix) => text(root.querySelector(`[id^="${prefix}"]`));

function parseDate(s) {
  const [d, m, y] = s.split('/').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function parseSchedule(s) {
  // e.g. "Th 13:00 - 16:00", "MoWe 09:00 - 11:00" or "Th 1:00PM - 4:00PM"
  const m = s.match(
    /^((?:[A-Z][a-z])+)\s+(\d{1,2}):(\d{2})\s*([AP]M)?\s*-\s*(\d{1,2}):(\d{2})\s*([AP]M)?$/
  );
  if (!m) return null;
  const days = m[1].match(/[A-Z][a-z]/g).map((d) => DAYS[d]).filter((d) => d !== undefined);
  const to24 = (h, ampm) => (ampm ? (+h % 12) + (/p/i.test(ampm) ? 12 : 0) : +h);
  return { days, start: [to24(m[2], m[4]), +m[3]], end: [to24(m[5], m[7]), +m[6]] };
}

function scrape() {
  const dividers = [...document.querySelectorAll('td.PAGROUPDIVIDER')];
  const meetings = [];
  const grids = [...document.querySelectorAll(`[id^="${CSS.escape(GRID_PREFIX)}"]`)]
    .filter((g) => g.tagName === 'TABLE');

  grids.forEach((grid, i) => {
    const block = grid.closest('[id^="ACE_DERIVED_REGFRM1_DESCR20$"]');
    const titleCell = (block && block.querySelector('td.PAGROUPDIVIDER')) || dividers[i];
    const title = text(titleCell);
    const [code, ...rest] = title.split(' - ');
    let ctx = { classNbr: '', section: '', component: '' };

    grid.querySelectorAll('tr[id^="trCLASS_MTG_VW"]').forEach((row) => {
      const classNbr = byPrefix(row, 'DERIVED_CLS_DTL_CLASS_NBR');
      const section = byPrefix(row, 'MTG_SECTION');
      const component = byPrefix(row, 'MTG_COMP');
      // Continuation rows leave these cells blank; inherit from the row above.
      if (classNbr) ctx = { classNbr, section, component: component || ctx.component };
      else if (component) ctx.component = component;

      const sched = parseSchedule(byPrefix(row, 'MTG_SCHED'));
      const dates = byPrefix(row, 'MTG_DATES').split('-').map((s) => s.trim());
      if (!sched || dates.length !== 2 || !dates[0]) return; // TBA rows

      meetings.push({
        code: code.trim(),
        course: rest.join(' - ').trim(),
        classNbr: ctx.classNbr,
        section: ctx.section,
        component: ctx.component,
        sched,
        room: byPrefix(row, 'MTG_LOC'),
        instructor: byPrefix(row, 'DERIVED_CLS_DTL_SSR_INSTR_LONG'),
        from: parseDate(dates[0]),
        to: parseDate(dates[1]),
      });
    });
  });
  return meetings;
}

// Expand each meeting's date range into one event per matching weekday.
function expand(meetings) {
  const events = [];
  for (const m of meetings) {
    for (let d = new Date(m.from); d <= m.to; d.setUTCDate(d.getUTCDate() + 1)) {
      if (!m.sched.days.includes(d.getUTCDay())) continue;
      const at = ([h, min]) =>
        new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h - SGT_OFFSET_HOURS, min));
      events.push({ ...m, start: at(m.sched.start), end: at(m.sched.end) });
    }
  }
  return events.sort((a, b) => a.start - b.start);
}

const pad = (n) => String(n).padStart(2, '0');
const icsDate = (d) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
  `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
const icsEscape = (s) => s.replace(/([\\;,])/g, '\\$1').replace(/\n/g, '\\n');

function toICS(events) {
  const stamp = icsDate(new Date());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SIT Timetable Exporter//EN', 'CALSCALE:GREGORIAN'];
  events.forEach((e) => {
    const desc = [e.course, `${e.component} (${e.section})`, e.instructor && `Instructor: ${e.instructor}`]
      .filter(Boolean).join('\n');
    // Stable across exports so re-importing updates events instead of duplicating them.
    const uid = `${e.classNbr}-${e.component}-${icsDate(e.start)}`.replace(/[^\w-]/g, '');
    const summary = [e.code, e.course].filter(Boolean).join(' - ') + (e.component ? ` (${e.component})` : '');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}@sit-timetable-exporter`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(e.start)}`,
      `DTEND:${icsDate(e.end)}`,
      `SUMMARY:${icsEscape(summary)}`,
      `LOCATION:${icsEscape(e.room)}`,
      `DESCRIPTION:${icsEscape(desc)}`,
      'END:VEVENT'
    );
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function toCSV(events) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const sgt = (d) => new Date(d.getTime() + SGT_OFFSET_HOURS * 3600000).toISOString();
  const rows = [['Code', 'Course', 'Component', 'Section', 'Date', 'Start', 'End', 'Room', 'Instructor']];
  for (const e of events) {
    rows.push([e.code, e.course, e.component, e.section,
      sgt(e.start).slice(0, 10), sgt(e.start).slice(11, 16), sgt(e.end).slice(11, 16),
      e.room, e.instructor]);
  }
  return rows.map((r) => r.map(q).join(',')).join('\r\n');
}

function download(name, mime, content) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function run(format) {
  const events = expand(scrape());
  if (!events.length) {
    alert('No scheduled classes found. Make sure "List View" is selected.');
    return;
  }
  if (format === 'ics') download('timetable.ics', 'text/calendar', toICS(events));
  else download('timetable.csv', 'text/csv', toCSV(events));
}

function injectUI() {
  if (document.getElementById('sit-tt-export')) return;
  const box = document.createElement('div');
  box.id = 'sit-tt-export';
  box.style.cssText =
    'position:fixed;bottom:16px;right:16px;z-index:99999;display:flex;gap:6px;' +
    'font:13px sans-serif;background:#fff;border:1px solid #888;border-radius:6px;padding:6px 8px;' +
    'box-shadow:0 2px 6px rgba(0,0,0,.3);align-items:center';
  box.append('Export timetable:');
  for (const [label, fmt] of [['.ics', 'ics'], ['.csv', 'csv']]) {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'cursor:pointer;padding:3px 8px';
    b.addEventListener('click', () => run(fmt));
    box.appendChild(b);
  }
  document.body.appendChild(box);
}

// PeopleSoft re-renders via AJAX, so keep checking whether the grid is present.
setInterval(() => {
  const hasGrid = document.querySelector(`[id^="${CSS.escape(GRID_PREFIX)}"]`);
  const ui = document.getElementById('sit-tt-export');
  if (hasGrid && !ui) injectUI();
  else if (!hasGrid && ui) ui.remove();
}, 1000);
