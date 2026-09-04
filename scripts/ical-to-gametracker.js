#!/usr/bin/env node
/* ============================================================================
   iCal -> GameTracker adapter

   Converts an .ics calendar feed into the canonical GameTracker payload.
   This is the whole of "adding a schedule source": a shim that produces the
   array the importer already accepts. It touches no schema, no API, no UI.

     node scripts/ical-to-gametracker.js <file.ics> --source <key> --sport <key> [options]

   Options
     --source   <key>   gametracker.sources key            (required)
     --sport    <key>   gametracker.sports key             (required)
     --league   <name>  e.g. "Section VI"
     --region   <name>  default WNY
     --level    <name>  default varsity
     --season   <year>  default derived from each date
     --tz       <zone>  default America/New_York
     --out      <file>  write JSON here (default: stdout)
     --report           print what the feed actually contained, and stop

   Why --report exists: never assume a feed's shape. Run it first and it tells
   you which iCal properties are present, how many events parsed cleanly, and
   which SUMMARY lines it could NOT split into two teams -- so the unknowns are
   visible before anything is imported.
   ============================================================================ */

'use strict';
const fs = require('fs');

/* ── RFC 5545 unfolding ──────────────────────────────────────────────────
   Long lines are wrapped with CRLF followed by a space or tab. Unfold before
   parsing or every long team name silently loses its tail. */
function unfold(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

/* Escaped characters inside iCal TEXT values. */
function unescapeText(v) {
  return String(v || '')
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function parseEvents(text) {
  const lines = unfold(text).split('\n');
  const events = [];
  let cur = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT')   { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;

    const i = line.indexOf(':');
    if (i < 0) continue;
    const rawName = line.slice(0, i);
    const value   = line.slice(i + 1);
    const parts   = rawName.split(';');
    const name    = parts[0].toUpperCase();

    const params = {};
    for (const p of parts.slice(1)) {
      const eq = p.indexOf('=');
      if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
    }
    // Keep the first occurrence; repeated props (e.g. multiple ATTENDEE) are not used here.
    if (!(name in cur)) cur[name] = { value, params };
  }
  return events;
}

/* ── DTSTART -> local date + time ─────────────────────────────────────────
   Three shapes appear in the wild:
     DTSTART;VALUE=DATE:20260904                 all-day, no time
     DTSTART;TZID=America/New_York:20260904T190000   already local
     DTSTART:20260904T230000Z                    UTC, needs converting
   The last one is the trap: treating it as local would show a 7pm Friday
   game at 11pm. Convert through the target zone rather than assuming. */
function parseDTStart(prop, tz) {
  if (!prop) return { date: null, time: null };
  const v = prop.value.trim();

  const dateOnly = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) return { date: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`, time: null };

  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) return { date: null, time: null };

  const [, Y, Mo, D, H, Mi, S, zulu] = m;

  if (zulu) {
    const utc = new Date(Date.UTC(+Y, +Mo - 1, +D, +H, +Mi, +S));
    // en-CA gives YYYY-MM-DD; hour12:false with hourCycle h23 avoids "24:00".
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23',
    });
    const p = {};
    for (const part of fmt.formatToParts(utc)) p[part.type] = part.value;
    return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
  }

  // Floating or TZID-qualified: the wall-clock time is already what we want.
  return { date: `${Y}-${Mo}-${D}`, time: `${H}:${Mi}` };
}

/* ── "Away @ Home" ────────────────────────────────────────────────────────
   The convention this feed uses. Also tolerates "Away at Home" and "Home vs
   Away" -- note vs REVERSES the order, which is exactly the kind of thing
   that silently puts the wrong school first on every card if assumed. */
function splitTeams(summary) {
  const s = unescapeText(summary).replace(/\s+/g, ' ').trim();
  if (!s) return null;

  let m = s.match(/^(.+?)\s+@\s+(.+)$/);
  if (m) return { away: m[1].trim(), home: m[2].trim(), form: '@' };

  m = s.match(/^(.+?)\s+at\s+(.+)$/i);
  if (m) return { away: m[1].trim(), home: m[2].trim(), form: 'at' };

  m = s.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
  if (m) return { home: m[1].trim(), away: m[2].trim(), form: 'vs' };

  return null;   // reported, never guessed
}

function seasonFor(dateStr, override) {
  if (override) return +override;
  const [y, m] = dateStr.split('-').map(Number);
  return m >= 7 ? y : y - 1;      // season rolls in July
}

function arg(flag, dflt) {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

function main() {
  const file = process.argv[2];
  if (!file || file.startsWith('--')) {
    console.error('usage: node scripts/ical-to-gametracker.js <file.ics> --source <key> --sport <key> [--league "Section VI"] [--report]');
    process.exit(1);
  }

  const tz       = arg('--tz', 'America/New_York');
  const source   = arg('--source', null);
  const sport    = arg('--sport', null);
  const league   = arg('--league', null);
  const region   = arg('--region', 'WNY');
  const level    = arg('--level', 'varsity');
  const season   = arg('--season', null);
  const out      = arg('--out', null);
  const report   = process.argv.includes('--report');

  const events = parseEvents(fs.readFileSync(file, 'utf8'));

  // What did the feed actually give us? Report before trusting.
  const propCount = {};
  for (const e of events) for (const k of Object.keys(e)) propCount[k] = (propCount[k] || 0) + 1;

  const rows = [];
  const unparsed = [];
  const noDate = [];
  const forms = {};

  for (const e of events) {
    const summary = e.SUMMARY ? e.SUMMARY.value : '';
    const teams = splitTeams(summary);
    const { date, time } = parseDTStart(e.DTSTART, e.DTSTART?.params?.TZID || tz);

    if (!teams)  { unparsed.push(unescapeText(summary)); continue; }
    if (!date)   { noDate.push(unescapeText(summary));  continue; }
    forms[teams.form] = (forms[teams.form] || 0) + 1;

    const uid = e.UID ? e.UID.value.trim() : null;
    const row = {
      source,
      // UID is the feed's own stable key -- exactly what the importer upserts
      // on, so a moved game updates instead of duplicating.
      source_event_id: uid || `${date}-${teams.away}-${teams.home}`
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      sport,
      level,
      region,
      season: seasonFor(date, season),
      home_team_name: teams.home,
      away_team_name: teams.away,
      event_date: date,
      timezone: tz,
    };
    if (league) row.league = league;
    if (time) row.start_time = time;

    const loc = e.LOCATION ? unescapeText(e.LOCATION.value) : '';
    if (loc) row.venue = loc;

    // Classification (A1, B2, C North ...) if the feed carries one.
    const cats = e.CATEGORIES ? unescapeText(e.CATEGORIES.value) : '';
    if (cats) row.classification = cats.split(',')[0].trim();

    const desc = e.DESCRIPTION ? unescapeText(e.DESCRIPTION.value) : '';
    if (desc) row.notes = desc.slice(0, 500);

    rows.push(row);
  }

  if (report) {
    console.log('FEED REPORT');
    console.log('  file:              ' + file);
    console.log('  VEVENT blocks:     ' + events.length);
    console.log('  parsed to games:   ' + rows.length);
    console.log('  matchup forms:     ' + (Object.keys(forms).length ? JSON.stringify(forms) : 'none'));
    console.log('  properties present:');
    for (const [k, n] of Object.entries(propCount).sort((a, b) => b[1] - a[1])) {
      console.log('     ' + k.padEnd(22) + n + '/' + events.length);
    }
    if (unparsed.length) {
      console.log('  SUMMARY lines with no readable matchup (' + unparsed.length + ') -- NOT imported:');
      unparsed.slice(0, 25).forEach(s => console.log('     ' + JSON.stringify(s)));
      if (unparsed.length > 25) console.log('     ... and ' + (unparsed.length - 25) + ' more');
    }
    if (noDate.length) {
      console.log('  events with no usable DTSTART (' + noDate.length + ') -- NOT imported:');
      noDate.slice(0, 10).forEach(s => console.log('     ' + JSON.stringify(s)));
    }
    const sample = rows.slice(0, 5);
    console.log('  first ' + sample.length + ' converted:');
    sample.forEach(r => console.log('     ' + r.event_date + ' ' + (r.start_time || 'TBD').padEnd(6) +
      ' ' + r.away_team_name + ' @ ' + r.home_team_name +
      (r.venue ? '  [' + r.venue + ']' : '') +
      (r.classification ? '  {' + r.classification + '}' : '')));
    console.log('  date range:        ' +
      (rows.length ? rows.map(r => r.event_date).sort()[0] + ' .. ' +
                     rows.map(r => r.event_date).sort().slice(-1)[0] : 'n/a'));
    return;
  }

  if (!source || !sport) {
    console.error('--source and --sport are required to emit a payload (use --report to inspect first)');
    process.exit(1);
  }

  const json = JSON.stringify(rows, null, 2);
  if (out) { fs.writeFileSync(out, json); console.error(`wrote ${rows.length} games -> ${out}`); }
  else console.log(json);

  if (unparsed.length) {
    console.error(`NOTE: ${unparsed.length} event(s) had no readable matchup and were left out. Run with --report to see them.`);
  }
}

main();
