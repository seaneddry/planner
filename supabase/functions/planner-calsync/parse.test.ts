import { parseFeed } from './parse.ts';

const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
X-WR-TIMEZONE:Asia/Kuala_Lumpur
BEGIN:VTIMEZONE
TZID:Asia/Kuala_Lumpur
X-LIC-LOCATION:Asia/Kuala_Lumpur
BEGIN:STANDARD
TZOFFSETFROM:+0800
TZOFFSETTO:+0800
TZNAME:+08
DTSTART:19700101T000000
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
DTSTART;TZID=Asia/Kuala_Lumpur:20261023T100000
DTEND;TZID=Asia/Kuala_Lumpur:20261023T110000
UID:single@google.com
SUMMARY:UAT walkthrough
LOCATION:Meet
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20261026
DTEND;VALUE=DATE:20261029
UID:allday@google.com
SUMMARY:Offsite
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=Asia/Kuala_Lumpur:20261005T093000
DTEND;TZID=Asia/Kuala_Lumpur:20261005T100000
RRULE:FREQ=WEEKLY;BYDAY=MO
EXDATE;TZID=Asia/Kuala_Lumpur:20261026T093000
UID:standup@google.com
SUMMARY:Weekly standup
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=Asia/Kuala_Lumpur:20261103T140000
DTEND;TZID=Asia/Kuala_Lumpur:20261103T143000
RECURRENCE-ID;TZID=Asia/Kuala_Lumpur:20261102T093000
UID:standup@google.com
SUMMARY:Weekly standup (moved)
END:VEVENT
BEGIN:VEVENT
DTSTART:20261024T020000Z
DTEND:20261024T030000Z
UID:utc@google.com
SUMMARY:Dentist
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=Asia/Kuala_Lumpur:20261030T090000
DTEND;TZID=Asia/Kuala_Lumpur:20261030T100000
UID:cancel@google.com
STATUS:CANCELLED
SUMMARY:Cancelled thing
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=Asia/Kuala_Lumpur:20270901T090000
DTEND;TZID=Asia/Kuala_Lumpur:20270901T100000
UID:far@google.com
SUMMARY:Too far
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=Asia/Kuala_Lumpur:20261022T230000
DTEND;TZID=Asia/Kuala_Lumpur:20261023T010000
UID:overnight@google.com
SUMMARY:Overnight deploy
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=Asia/Kuala_Lumpur:20190101T090000
DTEND;TZID=Asia/Kuala_Lumpur:20190101T091500
RRULE:FREQ=DAILY
UID:daily@google.com
SUMMARY:Daily check
END:VEVENT
END:VCALENDAR`.replace(/\n/g, '\r\n');

const rows = parseFeed(ics, { user_id: 'u', calendar_id: 'c' }, new Date('2026-10-22T09:00:00+08:00'));
rows.sort((a, b) => a.starts_at < b.starts_at ? -1 : 1);
for (const r of rows.filter(x=>x.title!=='Daily check' && x.title!=='Weekly standup')) console.log(r.start_date, r.end_date, r.all_day ? 'ALLDAY' : new Date(r.starts_at).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kuala_Lumpur' }), '|', r.title, '|', r.uid.slice(0, 40));
const titles = rows.map((r) => r.title);
const assert = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); Deno.exit(1); } };
assert(!titles.includes('Cancelled thing'), 'cancelled skipped');
assert(!titles.includes('Too far'), 'out of window skipped');
assert(!rows.some((r) => r.title === 'Weekly standup' && r.start_date === '2026-10-26'), 'exdate removed');
assert(!rows.some((r) => r.title === 'Weekly standup' && r.start_date === '2026-11-02'), 'moved occurrence replaced');
assert(rows.some((r) => r.title === 'Weekly standup (moved)' && r.start_date === '2026-11-03'), 'moved occurrence present');
assert(rows.some((r) => r.title === 'Weekly standup' && r.start_date === '2026-10-12'), 'past within 14 days kept');
assert(!rows.some((r) => r.title === 'Weekly standup' && r.start_date === '2026-10-05'), 'older than 14 days dropped');
const off = rows.find((r) => r.title === 'Offsite')!;
assert(off.start_date === '2026-10-26' && off.end_date === '2026-10-28', 'all-day range inclusive');
const den = rows.find((r) => r.title === 'Dentist')!;
assert(den.start_date === '2026-10-24' && new Date(den.starts_at).toISOString() === '2026-10-24T02:00:00.000Z', 'UTC event');
const ov = rows.find((r) => r.title === 'Overnight deploy')!;
assert(ov.start_date === '2026-10-22' && ov.end_date === '2026-10-23', 'overnight spans 2 days');
const uat = rows.find((r) => r.title === 'UAT walkthrough')!;
assert(uat.starts_at === '2026-10-23T02:00:00.000Z', 'KL time zone applied');
assert(rows.filter((r) => r.title === 'Daily check').length > 150, 'old daily series still expands in window');
console.log('ALL OK', rows.length, 'rows');
