import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCapture, findActionLines, markActionLines } from './parse.ts';
import { computeRemind, detectRemind } from './labels.ts';

const ctx = {
  today: '2026-10-22', // Thursday
  defaultSpace: 'work' as const,
  projects: [
    { id: 'p1', name: 'Porsche BEV', tag: 'porsche', space: 'work' as const },
    { id: 'p2', name: 'MeMoSA', tag: null, space: 'work' as const },
    { id: 'p3', name: 'House', tag: 'home', space: 'personal' as const },
  ],
  people: [
    { id: 'u1', name: 'Client PIC', handle: 'client' },
    { id: 'u2', name: 'Aisyah Rahman', handle: null },
  ],
};

test('the mockup example', () => {
  const r = parseCapture('nudge @client on UAT feedback fri #porsche !high', ctx);
  assert.equal(r.kind, 'follow_up');
  assert.equal(r.title, 'Nudge on UAT feedback');
  assert.equal(r.personId, 'u1');
  assert.equal(r.projectId, 'p1');
  assert.equal(r.space, 'work');
  assert.equal(r.dueOn, '2026-10-23');
  assert.equal(r.priority, 3);
});

test('follow up prefix is dropped from the title', () => {
  const r = parseCapture('fu @aisyah server access tmr', ctx);
  assert.equal(r.kind, 'follow_up');
  assert.equal(r.title, 'Server access');
  assert.equal(r.personId, 'u2');
  assert.equal(r.dueOn, '2026-10-23');
});

test('unknown tag and person are kept for creation', () => {
  const r = parseCapture('kickoff deck #drg @hafiz', ctx);
  assert.equal(r.projectId, null);
  assert.equal(r.newProjectTag, 'drg');
  assert.equal(r.newPersonHandle, 'hafiz');
  assert.equal(r.title, 'Kickoff deck');
});

test('project by name prefix', () => {
  const r = parseCapture('check logs #memosa', ctx);
  assert.equal(r.projectId, 'p2');
});

test('dates', () => {
  assert.equal(parseCapture('x today', ctx).dueOn, '2026-10-22');
  assert.equal(parseCapture('x thu', ctx).dueOn, '2026-10-22');
  assert.equal(parseCapture('x mon', ctx).dueOn, '2026-10-26');
  assert.equal(parseCapture('x next fri', ctx).dueOn, '2026-10-30');
  assert.equal(parseCapture('x next week', ctx).dueOn, '2026-10-26');
  assert.equal(parseCapture('x weekend', ctx).dueOn, '2026-10-24');
  assert.equal(parseCapture('x eow', ctx).dueOn, '2026-10-23');
  assert.equal(parseCapture('x eom', ctx).dueOn, '2026-10-31');
  assert.equal(parseCapture('x in 3 days', ctx).dueOn, '2026-10-25');
  assert.equal(parseCapture('x in 2 weeks', ctx).dueOn, '2026-11-05');
  assert.equal(parseCapture('x 5/11', ctx).dueOn, '2026-11-05');
  assert.equal(parseCapture('x 3/1', ctx).dueOn, '2027-01-03');
  assert.equal(parseCapture('x 23 oct', ctx).dueOn, '2026-10-23');
  assert.equal(parseCapture('x dec 1', ctx).dueOn, '2026-12-01');
  assert.equal(parseCapture('x 1 jan 2028', ctx).dueOn, '2028-01-01');
  assert.equal(parseCapture('x 31/2', ctx).dueOn, null);
});

test('ordinary words are not dates', () => {
  const r = parseCapture('buy sun cream', ctx);
  assert.equal(r.dueOn, null);
  assert.equal(r.kind, 'shopping');
  assert.equal(r.title, 'Sun cream');
  assert.equal(r.space, 'personal');
  assert.equal(parseCapture('x on sun', ctx).dueOn, '2026-10-25');
  assert.equal(parseCapture('see may report', ctx).dueOn, null);
});

test('times', () => {
  const r = parseCapture('call bank tomorrow at 3:30pm', ctx);
  assert.equal(r.dueOn, '2026-10-23');
  assert.equal(r.dueTime, '15:30');
  assert.equal(r.title, 'Call bank');
  assert.equal(parseCapture('standup 9am', ctx).dueTime, '09:00');
  assert.equal(parseCapture('lunch noon', ctx).dueTime, '12:00');
  assert.equal(parseCapture('sync 14:00', ctx).dueTime, '14:00');
  assert.equal(parseCapture('2 laptops', ctx).dueTime, null);
});

test('effort, place, space and reminder', () => {
  const r = parseCapture('collect parcel +post_office ~15m ^9am /p', ctx);
  assert.equal(r.effortMin, 15);
  assert.equal(r.place, 'Post office');
  assert.equal(r.kind, 'errand');
  assert.equal(r.space, 'personal');
  assert.equal(r.remind, 'custom');
  assert.equal(r.remindTime, '09:00');
  assert.equal(r.title, 'Collect parcel');
  assert.equal(parseCapture('x ~1.5h', ctx).effortMin, 90);
  assert.equal(parseCapture('x ^1d', ctx).remind, '1d');
});

test('repeats', () => {
  const r = parseCapture('weekly tracker update every wed #porsche', ctx);
  assert.equal(r.repeat, 'weekly');
  assert.equal(r.dueOn, '2026-10-28');
  assert.equal(r.title, 'Weekly tracker update');
  const m = parseCapture('pay rent monthly 1/11', ctx);
  assert.equal(m.repeat, 'monthly');
  assert.equal(m.dueOn, '2026-11-01');
  assert.equal(parseCapture('water plants every 3 days', ctx).repeatEvery, 3);
  assert.equal(parseCapture('check inbox every weekday', ctx).repeat, 'weekdays');
});

test('kinds', () => {
  assert.equal(parseCapture('remind me to call mum 8pm', ctx).title, 'Call mum');
  assert.equal(parseCapture('remind me to call mum 8pm', ctx).kind, 'reminder');
  const b = parseCapture("Mum's birthday 12 mar", ctx);
  assert.equal(b.kind, 'occasion');
  assert.equal(b.repeat, 'yearly');
  assert.equal(b.dueOn, '2027-03-12');
  assert.equal(parseCapture('appt dentist 5/11 10am', ctx).kind, 'appointment');
  assert.equal(parseCapture('renew road tax 1/12', ctx).title, 'Renew road tax');
});

test('project from context', () => {
  const r = parseCapture('send minutes', { ...ctx, projectId: 'p3' });
  assert.equal(r.projectId, 'p3');
  assert.equal(r.space, 'personal');
});

test('action lines in meeting notes', () => {
  const body = 'Agenda\n- [ ] Send GA4 events list @client fri\nAI: update estimate #porsche\nnot an action\n-> book UAT room';
  const lines = findActionLines(body);
  assert.deepEqual(lines.map((l) => l.index), [1, 2, 4]);
  assert.equal(lines[0].text, 'Send GA4 events list @client fri');
  const marked = markActionLines(body, [1, 4]);
  assert.equal(marked.split('\n')[1], '✓ Send GA4 events list @client fri');
  assert.equal(findActionLines(marked).length, 1);
});

test('reminder maths', () => {
  const morning = computeRemind('morning', '2026-10-23', null, '09:00');
  assert.equal(morning, '2026-10-23T01:00:00.000Z');
  const hour = computeRemind('1h', '2026-10-23', '15:00', '09:00');
  assert.equal(hour, '2026-10-23T06:00:00.000Z');
  assert.equal(detectRemind(hour, '2026-10-23', '15:00', '09:00'), '1h');
  assert.equal(detectRemind('2026-10-20T03:00:00.000Z', '2026-10-23', null, '09:00'), 'custom');
});
