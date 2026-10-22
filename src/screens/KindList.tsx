import { Navigate, useParams } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { ItemRow } from '../components/ItemRow';
import { CaptureBar } from '../components/Capture';
import { EmptyLine, OfflineBanner, Section } from '../components/Bits';
import { useOpenItems, sortItems } from '../lib/items';
import { KINDS } from '../lib/labels';
import { addDays, daysBetween, todayKL } from '../lib/dates';
import type { Item, ItemKind } from '../types';

const HINT: Partial<Record<ItemKind, { placeholder: string; footer: string }>> = {
  errand: { placeholder: 'Add an errand… e.g. collect parcel +post_office sat', footer: 'Use +place to group errands by where they get done.' },
  shopping: { placeholder: 'Add to the list… e.g. batteries +mrdiy', footer: 'Use +shop to group the list by store. Paste several lines to add them all.' },
  renewal: { placeholder: 'Add a renewal… e.g. road tax 1/12', footer: 'Renewals repeat yearly and remind you 2 weeks before. Change either on the item.' },
  maintenance: { placeholder: 'Add maintenance… e.g. aircond service 24 oct every 6 months', footer: 'Set how often it repeats; the next one is scheduled when you tick it off.' },
  occasion: { placeholder: "Add an occasion… e.g. Mum's birthday 12 mar", footer: 'Occasions repeat yearly and remind you 3 days before.' },
  appointment: { placeholder: 'Add an appointment… e.g. dentist 5/11 10am', footer: 'Appointments with a time remind you an hour before.' },
};

function groupBy(items: Item[], key: (i: Item) => string): [string, Item[]][] {
  const m = new Map<string, Item[]>();
  for (const i of items) m.set(key(i), [...(m.get(key(i)) ?? []), i]);
  return [...m.entries()].sort((a, b) => (a[0] === 'Anywhere' ? 1 : b[0] === 'Anywhere' ? -1 : a[0].localeCompare(b[0])));
}

export function KindList() {
  const { kind } = useParams();
  const items = useOpenItems();
  const today = todayKL();
  if (!kind || !(kind in KINDS)) return <Navigate to="/" replace />;
  const k = kind as ItemKind;
  const meta = KINDS[k];
  const list = (items.data ?? []).filter((i) => i.kind === k).sort(sortItems);
  const hint = HINT[k];

  let body;
  if (k === 'errand' || k === 'shopping') {
    const groups = groupBy(list, (i) => i.place ?? 'Anywhere');
    body = groups.length ? (
      groups.map(([place, rows]) => (
        <Section key={place} title={place} count={rows.length}>
          {rows.map((i) => (
            <ItemRow key={i.id} item={i} />
          ))}
        </Section>
      ))
    ) : (
      <Section title={meta.plural}>
        <EmptyLine>Nothing on the list.</EmptyLine>
      </Section>
    );
  } else {
    const soon = list.filter((i) => i.due_on && i.due_on <= addDays(today, 30));
    const later = list.filter((i) => !i.due_on || i.due_on > addDays(today, 30));
    body = (
      <>
        <Section title="Next 30 days" count={soon.length}>
          {soon.map((i) => (
            <Countdown key={i.id} item={i} today={today} />
          ))}
          {soon.length === 0 ? <EmptyLine>Nothing in the next 30 days.</EmptyLine> : null}
        </Section>
        {later.length ? (
          <Section title="Later" count={later.length}>
            {later.map((i) => (
              <Countdown key={i.id} item={i} today={today} />
            ))}
          </Section>
        ) : null}
      </>
    );
  }

  return (
    <Screen title={meta.plural} sub="Personal">
      <main className="page">
        <OfflineBanner show={items.offline} />
        <CaptureBar kind={k} placeholder={hint?.placeholder} />
        {hint ? <p className="footnote capture-hint">{hint.footer}</p> : null}
        <div className="stack-tight">{body}</div>
      </main>
    </Screen>
  );
}

function Countdown({ item, today }: { item: Item; today: string }) {
  const days = item.due_on ? daysBetween(today, item.due_on) : null;
  return (
    <div className="countdown-row">
      <ItemRow item={item} />
      {days !== null ? (
        <span className={`countdown ${days < 0 ? 'is-late' : days <= 7 ? 'is-soon' : ''}`}>
          {days < 0 ? `${-days}d late` : days === 0 ? 'today' : `in ${days}d`}
        </span>
      ) : null}
    </div>
  );
}
