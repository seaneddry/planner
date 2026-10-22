import { supabase } from '../supabase';

export type PushState =
  | { kind: 'unsupported' }
  | { kind: 'needs-install' }
  | { kind: 'blocked' }
  | { kind: 'off' }
  | { kind: 'on' };

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Resolves with the active service worker, or rejects if there is none within a few seconds. */
function workerReady(): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('The app is not ready for notifications yet. Reload and try again.')), 6000)),
  ]);
}

export async function getPushState(): Promise<PushState> {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!supported) {
    // iPhone Safari only offers push to apps added to the Home Screen.
    return isIos() && !isStandalone() ? { kind: 'needs-install' } : { kind: 'unsupported' };
  }
  if (Notification.permission === 'denied') return { kind: 'blocked' };
  try {
    const reg = await workerReady();
    const sub = await reg.pushManager.getSubscription();
    return Notification.permission === 'granted' && sub ? { kind: 'on' } : { kind: 'off' };
  } catch {
    return { kind: 'off' };
  }
}

function keyToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Must be called straight from a tap: the permission prompt only appears for a user gesture. */
export async function enablePush(userId: string): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications were not allowed.');

  const { data, error } = await supabase.functions.invoke('planner-push', { body: { action: 'public-key' } });
  if (error) throw new Error(error.message);
  const publicKey = (data as { publicKey?: string } | null)?.publicKey;
  if (!publicKey) throw new Error('The server did not return a notification key.');

  const reg = await workerReady();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }));

  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) throw new Error('This device returned an incomplete subscription.');

  const { error: dbError } = await supabase
    .from('planner_push_subscriptions')
    .upsert(
      { user_id: userId, endpoint: json.endpoint, p256dh, auth, user_agent: navigator.userAgent.slice(0, 200) },
      { onConflict: 'endpoint' },
    );
  if (dbError) throw new Error(dbError.message);
}

export async function disablePush(): Promise<void> {
  const reg = await workerReady();
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const { error } = await supabase.from('planner_push_subscriptions').delete().eq('endpoint', sub.endpoint);
  if (error) throw new Error(error.message);
  await sub.unsubscribe();
}

export async function sendTestPush(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('planner-push', { body: { action: 'test' } });
  if (error) throw new Error(error.message);
  const result = data as { sent?: number; error?: string } | null;
  if (result?.error) throw new Error(result.error);
  if (!result?.sent) throw new Error('The notification could not be delivered. Try turning notifications off and on again.');
}
