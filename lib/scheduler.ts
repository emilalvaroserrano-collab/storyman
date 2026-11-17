import { createHash } from 'node:crypto';
import { getKV, query, setKV } from './db';
import { createJob, getSchedule, getSettings, listJobs } from './story-service';
import type { Schedule, ScheduleSlot } from './types';

export function localParts(date: Date, timezone: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
export function occurrenceKey(localDate: string, slot: ScheduleSlot) { return `daily:${localDate}:${slot.id}`; }
export function upcomingExecutions(schedule: Schedule, now = new Date(), count = 3) {
  if (!schedule.enabled) return [];
  const found: { slotId: string; at: string; localDate: string; time: string; timezone: string }[] = [];
  const seen = new Set<string>();
  for (let minute = 1; minute <= 60 * 24 * 8 && found.length < count; minute++) {
    const instant = new Date(Math.floor(now.getTime() / 60_000) * 60_000 + minute * 60_000);
    const local = localParts(instant, schedule.timezone);
    for (const slot of schedule.slots) if (slot.enabled && slot.time === local.time) {
      const key = occurrenceKey(local.date, slot);
      if (!seen.has(key)) { found.push({ slotId: slot.id, at: instant.toISOString(), localDate: local.date, time: slot.time, timezone: schedule.timezone }); seen.add(key); }
    }
  }
  return found;
}
export function dueOccurrences(schedule: Schedule, now: Date, previousTick?: Date) {
  if (!schedule.enabled) return [];
  const maxAgeMs = 6 * 60 * 60_000;
  const start = previousTick ? Math.max(previousTick.getTime(), now.getTime() - maxAgeMs) : now.getTime() - 60_000;
  const minutes = schedule.missedRunPolicy === 'skip_missed' ? [Math.floor(now.getTime()/60_000)*60_000] : Array.from({ length: Math.min(360, Math.max(1, Math.ceil((now.getTime()-start)/60_000))) }, (_,i) => Math.floor(start/60_000)*60_000+(i+1)*60_000);
  const found = new Map<string,{key:string;slot:ScheduleSlot;localDate:string}>();
  for (const ms of minutes) { if(ms > now.getTime()) continue; const local = localParts(new Date(ms), schedule.timezone); for (const slot of schedule.slots) if (slot.enabled && slot.time === local.time) { const key = occurrenceKey(local.date,slot); found.set(key, {key,slot,localDate:local.date}); } }
  const result = [...found.values()];
  return schedule.missedRunPolicy === 'catch_up_one' ? result.slice(-1) : result;
}
export async function runSchedulerTick(now = new Date()) {
  const schedule = await getSchedule();
  const previous = await getKV<string | null>('schedulerTick', null);
  await setKV('schedulerTick', now.toISOString());
  const due = dueOccurrences(schedule, now, previous ? new Date(previous) : undefined);
  const settings = await getSettings();
  for (const occurrence of due) {
    const jobs = await listJobs(500);
    const todayCount = jobs.filter(j => j.trigger === 'scheduled' && j.idempotencyKey.startsWith(`daily:${occurrence.localDate}:`)).length;
    if (todayCount >= settings.dailyCap) continue;
    const existing = await query('SELECT job_id FROM schedule_occurrences WHERE occurrence_key = ?', [occurrence.key]);
    if (existing.rows[0]?.job_id) continue;
    const selectionSeed = createHash('sha256').update(occurrence.key).digest('hex').slice(0,8);
    const { job } = await createJob({ prompt: `Discover a well-documented, distinct true ${occurrence.slot.genre.toLowerCase()} story for ${occurrence.localDate}, ${occurrence.slot.time}. Avoid every previously used subject and central event. Research selection ${selectionSeed}.`, genre: occurrence.slot.genre, language: settings.language, duration: settings.duration, voice: settings.voice, platforms: occurrence.slot.platforms, idempotencyKey: occurrence.key }, 'scheduled');
    await query('INSERT INTO schedule_occurrences (occurrence_key,job_id,created_at) VALUES (?,?,?) ON CONFLICT (occurrence_key) DO UPDATE SET job_id = excluded.job_id', [occurrence.key,job.id,now.toISOString()]);
  }
  return due.length;
}
