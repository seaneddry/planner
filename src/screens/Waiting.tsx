import { useState } from 'react';
import { Screen } from '../components/Screen';
import { ItemRow } from '../components/ItemRow';
import { OfflineBanner, Section, SpaceSwitch } from '../components/Bits';
import { CaptureBar, useCapture } from '../components/Capture';
import { Empty } from '../components/States';
import { Icon } from '../components/Icon';
import { inSpace, useOpenItems, waitingDays } from '../lib/items';
import { useRefs, useWide } from '../lib/refs';
import { todayKL } from '../lib/dates';
import type { Item } from '../types';

type Group = 'person' | 'project' | 'age';

export function Waiting() {
  const items = useOpenItems();
  const { space, personById, projectById } = useRefs();
  const wide = useWide();
  const capture = useCapture();
  const [group, setGroup] = useState<Group>('person');
  const today = todayKL();

  const list = (items.data ?? []).filter((i) => i.kind === 'follow_up' && inSpace(i, space)).sort((a, b) => waitingDays(b, today) - waitingDays(a, today));

  const groups = new Map<string, Item[]>();
  for (const i of list) {
    let key: string;
    if (group === 'person') key = i.person_id ? (personById.get(i.person_id)?.name ?? 'Someone') : 'No one named';
    else if (group === 'project') key = i.project_id ? (projectById.get(i.project_id)?.name ?? 'Project') : 'No project';
    else {
      const d = waitingDays(i, today);
      key = d >= 7 ? 'A week or more' : d >= 3 ? '3 to 6 days' : 'Under 3 days';
    }
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }
  const order = group === 'age' ? ['A week or more', '3 to 6 days', 'Under 3 days'] : [...groups.keys()].sort((a, b) => (groups.get(b)!.length - groups.get(a)!.length) || a.localeCompare(b));

  return (
    <Screen
      title="Waiting on"
      sub={list.length ? `${list.length} follow-up${list.length === 1 ? '' : 's'}` : undefined}
      right={
        !wide ? (
          <button className="nav-icon-button" onClick={() => capture({ kind: 'follow_up' })} aria-label="New follow-up">
            <Icon name="plus" size={22} />
          </button>
        ) : null
      }
    >
      <main className="page">
        <div className="toolbar toolbar-split">
          <SpaceSwitch />
          <div className="segmented segmented-inline" role="radiogroup" aria-label="Group by">
            {(
              [
                ['person', 'Person'],
                ['project', 'Project'],
                ['age', 'Age'],
              ] as [Group, string][]
            ).map(([g, l]) => (
              <button key={g} role="radio" aria-checked={group === g} className={group === g ? 'on' : ''} onClick={() => setGroup(g)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <OfflineBanner show={items.offline} />
        {wide ? <CaptureBar kind="follow_up" placeholder="Waiting for… e.g. @client GA4 events list #porsche" /> : null}
        {list.length === 0 && !items.loading ? (
          <Empty icon="hourglass" title="Not waiting on anyone" text='Add a follow-up with "fu @person what you need". It gets a nudge date 3 days out.' />
        ) : null}
        <div className="stack-tight">
          {order
            .filter((k) => groups.has(k))
            .map((k) => (
              <Section key={k} title={k} count={groups.get(k)!.length}>
                {groups.get(k)!.map((i) => (
                  <ItemRow key={i.id} item={i} hideProject={group === 'project'} />
                ))}
              </Section>
            ))}
        </div>
      </main>
    </Screen>
  );
}
