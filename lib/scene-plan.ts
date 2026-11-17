import type { ResearchSource } from './types';

/** Structural copy of media.WordTiming so the planner stays dependency-free. */
export interface SceneWord { word: string; start: number; end: number; confidence: number; }
export type SceneKind = 'opening' | 'phrase' | 'stat' | 'timeline' | 'quote';
export interface SceneSource { title: string; url: string; domain: string; }
export interface Scene {
  start: number; end: number; kind: SceneKind; headline: string; support: string;
  emphasis?: string; stat?: string; source?: SceneSource; cta?: boolean; background: number;
}
export interface ScenePlan {
  version: 2; renderer: 'pillow-documentary-shorts-v2';
  format: { width: 1080; height: 1920; fps: 30; motionFps: number };
  duration: number; title: string; topic: string; kicker: string; handle: string; brandMark: string;
  cta: { title: string; subtitle: string; action: string };
  design: { palette: Record<string, string> };
  scenes: Scene[]; sources: SceneSource[]; cues: { start: number; end: number; text: string }[];
}

export interface ScenePlanInput {
  words: SceneWord[]; duration: number; title: string; genre?: string;
  sources?: ResearchSource[]; handle?: string; brandMark?: string; motionFps?: number;
}
export const palette: Record<string, string> = {
  ink: '#101014', inkSoft: '#191a21', paper: '#f4ead6', paperDeep: '#e6d6b9',
  red: '#c8202e', redDeep: '#8d1420', gold: '#d8a43c', yellow: '#f2c84b',
  white: '#fffdf7', forest: '#123a32', navy: '#122231', oxblood: '#3b1116', slate: '#566270',
};
const STOPWORDS = new Set(('ang ng mga sa na at ay si ni kay para isang ito iyon iyan siya niya kanilang kaniyang siyang may mayroon lang din rin pa ba po ko mo namin natin ninyo kanila the a an of to in and or was were is are it that this these those for with from as on by he she they his her their him them but had have has at into after before when where who which while than then there here their our your my me we you i do did does can could would should will just also very more most much many few other some such only own same so too s t don now pero kaya ngunit dahil habang noong muli agad talaga napaka sobrang parang tulad').split(/\s+/));
const SENTENCE_END = /[.!?…]["'”’)\]]*$/u;
const STAT = /(?:[₱$€£¥]\s?\d[\d,.]*|\b\d[\d,.]*(?:\s?(?:%|percent|million|billion|trillion|thousand|years?|taon))?\b)/giu;

function cleanDisplay(text: string) {
  return text.replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?…])/g, '$1')
    .replace(/\s+([”’)\]])/g, '$1')
    .replace(/(^|[\s(—–-])([“"'])\s+/g, '$1$2')
    .trim();
}
function tokenText(word: string) { return word.replace(/^[^\p{L}\p{N}₱$€£¥]+|[^\p{L}\p{N}%₱$€£¥]+$/gu, ''); }
function contentWords(text: string) {
  return text.split(/\s+/).map(tokenText).filter(word => word.length > 1 && !STOPWORDS.has(word.toLowerCase()));
}
function truncateWords(text: string, max: number) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1); const boundary = cut.lastIndexOf(' ');
  return `${(boundary > max * 0.55 ? cut.slice(0, boundary) : cut.slice(0, max)).replace(/[\s,;:.!?…-]+$/u, '')}…`;
}
function statToken(text: string): { value: string; year: boolean } | null {
  const matches = [...text.matchAll(STAT)].map(match => match[0].trim()).filter(Boolean);
  if (!matches.length) return null;
  const year = matches.find(value => /^(?:19|20)\d{2}$/.test(value));
  if (year) return { value: year, year: true };
  const money = matches.find(value => /^[₱$€£¥]/.test(value));
  if (money) return { value: money, year: false };
  const percent = matches.find(value => /%|percent/i.test(value));
  if (percent) return { value: percent, year: false };
  return { value: matches.sort((a, b) => b.length - a.length)[0], year: false };
}
function quoted(text: string): string | null {
  const match = text.match(/[“"]([^”"]{8,140})[”"]/u);
  return match ? match[1].trim().replace(/[\s,;:.!?…]+$/u, '') : null;
}
function headlineFor(text: string, _stat: { value: string; year: boolean } | null, quote: string | null) {
  if (quote) return quote;
  // Prefer the longest run of adjacent content words: it keeps phrases grammatical instead of
  // stitching together unrelated long words from opposite ends of the sentence.
  const runs: { words: string[]; chars: number; index: number }[] = [];
  let run: string[] = []; let runIndex = 0;
  const flushRun = () => { if (run.length) runs.push({ words: [...run], chars: run.join(' ').length, index: runIndex }); run = []; };
  text.split(/\s+/).forEach((token, index) => {
    const word = tokenText(token);
    if (word.length > 1 && !STOPWORDS.has(word.toLowerCase())) { if (!run.length) runIndex = index; run.push(word); }
    else flushRun();
  });
  flushRun();
  const trimmed = runs.map(item => {
    const words = [...item.words];
    while (words.length > 1 && words.join(' ').length > 30) words.pop();
    return { words, index: item.index };
  }).filter(item => item.words.join(' ').length <= 30 && item.words.join(' ').length >= 3);
  const best = trimmed.sort((a, b) => b.words.join(' ').length - a.words.join(' ').length || b.words.length - a.words.length || a.index - b.index)[0];
  return best ? best.words.join(' ') : text.split(/\s+/).slice(0, 3).join(' ');
}
function emphasisFor(headline: string, text: string) {
  const inHeadline = contentWords(headline);
  if (inHeadline.length) return inHeadline.sort((a, b) => b.length - a.length)[0].slice(0, 40);
  return (contentWords(text).sort((a, b) => b.length - a.length)[0] || '').slice(0, 40) || undefined;
}
function validSource(source: ResearchSource): SceneSource | null {
  try {
    const url = new URL(source.url);
    if (!['http:', 'https:'].includes(url.protocol) || !source.title.trim()) return null;
    return { title: source.title.trim().slice(0, 140), url: source.url, domain: url.hostname.replace(/^www\./, '') };
  } catch { return null; }
}
export function motionFpsFor(duration: number) {
  return duration <= 30 ? 12 : duration <= 90 ? 10 : 8;
}
export function buildScenePlan(input: ScenePlanInput): ScenePlan {
  const duration = Number(input.duration); const words = input.words.filter(word => Number.isFinite(word.start) && Number.isFinite(word.end) && word.end > word.start);
  if (!Number.isFinite(duration) || duration <= 0 || !words.length) throw new Error('A scene plan needs a positive duration and aligned words.');
  const sorted = [...words].sort((a, b) => a.start - b.start);
  type Group = { first: number; last: number; text: string };
  const groups: Group[] = [];
  let current: SceneWord[] = [];
  const flush = () => { if (current.length) { groups.push({ first: current[0].start, last: current[current.length - 1].end, text: cleanDisplay(current.map(word => word.word).join(' ')) }); current = []; } };
  for (let index = 0; index < sorted.length; index++) {
    const word = sorted[index]; current.push(word);
    const next = sorted[index + 1];
    const span = current[current.length - 1].end - current[0].start;
    const textLength = current.reduce((total, item) => total + item.word.length + 1, 0);
    const sentenceEnd = SENTENCE_END.test(word.word);
    const clauseEnd = /[,;:—–]$/u.test(word.word);
    const gap = next ? next.start - word.end : 0;
    if (!next || (sentenceEnd && span >= 1.0) || (clauseEnd && span >= 2.0) || gap >= .65 || span >= 5.6 || textLength >= 175) flush();
  }
  flush();
  // Short flashes are merged into the following beat; the reference cuts every few seconds, not every second.
  const merged: Group[] = [];
  for (const group of groups) {
    const previous = merged[merged.length - 1];
    if (previous && (group.last - group.first < .9 || group.text.length < 12)) { previous.last = group.last; previous.text = cleanDisplay(`${previous.text} ${group.text}`); }
    else merged.push({ ...group });
  }
  // The title card needs a beat to land before the first cut.
  while (merged.length > 1 && merged[0].last - merged[0].first < 1.5) merged.splice(0, 2, { first: merged[0].first, last: merged[1].last, text: cleanDisplay(`${merged[0].text} ${merged[1].text}`) });
  const scenes: Scene[] = []; let cursor = 0;
  for (let index = 0; index < merged.length; index++) {
    const group = merged[index]; const next = merged[index + 1];
    const start = index === 0 ? 0 : cursor;
    const end = next ? Math.max(next.first, group.last) : duration;
    cursor = end;
    if (end - start < .35) continue;
    const stat = statToken(group.text); const quote = quoted(group.text);
    const kind: SceneKind = index === 0 ? 'opening' : quote && !stat ? 'quote' : stat?.year ? 'timeline' : stat ? 'stat' : 'phrase';
    const headline = index === 0 ? input.title.trim() : kind === 'timeline' || kind === 'stat' ? stat!.value : headlineFor(group.text, stat, quote);
    // The headline already repeats the stat or the quote, so the support line drops it instead of duplicating it.
    const strip = (needle: string) => cleanDisplay(group.text.replace(needle, ' ').replace(/[“”"]/g, '')).replace(/^[\s,;:.!?…—–-]+/u, '');
    const after = (needle: string) => { const at = group.text.indexOf(needle); return at < 0 ? '' : cleanDisplay(group.text.slice(at + needle.length)).replace(/^[\s,;:.!?…—–-]+/u, ''); };
    const supportText = index === 0 ? group.text
      : kind === 'quote' ? strip(quote!) || group.text
      : kind === 'timeline' ? (after(stat!.value).length >= 14 ? after(stat!.value) : strip(stat!.value) || group.text)
      : group.text;
    const support = truncateWords(supportText, kind === 'phrase' ? 130 : 150);
    scenes.push({ start, end, kind, headline: headline || input.title.trim() || 'Storyman', support: support || group.text, emphasis: emphasisFor(headline, supportText), stat: stat?.value, background: index % 6 });
  }
  if (!scenes.length) throw new Error('Aligned words could not be grouped into scenes.');
  scenes[scenes.length - 1].end = duration;
  const sources = (input.sources || []).map(validSource).filter((source): source is SceneSource => Boolean(source)).filter((source, index, all) => all.findIndex(item => item.url === source.url) === index).slice(0, 3);
  if (sources.length && scenes.length >= 3) {
    const targets = [...new Set([Math.floor(scenes.length * .34), Math.floor(scenes.length * .66)])];
    targets.forEach((target, index) => { const scene = scenes[Math.min(scenes.length - 2, Math.max(1, target))]; if (!scene.source) scene.source = sources[index % sources.length]; });
  }
  if (duration >= 10 && scenes.length >= 2) scenes[scenes.length - 1].cta = true;
  const kicker = (input.genre || 'Documentary').trim().toUpperCase().slice(0, 26);
  return {
    version: 2, renderer: 'pillow-documentary-shorts-v2',
    format: { width: 1080, height: 1920, fps: 30, motionFps: Math.max(4, Math.min(15, Math.round(input.motionFps || motionFpsFor(duration)))) },
    duration, title: input.title.trim() || 'Untitled story', topic: input.title.trim() || 'Untitled story', kicker,
    handle: (input.handle || process.env.BRAND_HANDLE || '@storyman').slice(0, 40),
    brandMark: (input.brandMark || process.env.BRAND_MARK || 'S').slice(0, 2).toUpperCase(),
    cta: { title: 'Follow for more', subtitle: 'Stories that stay with you', action: 'FOLLOW' },
    design: { palette }, scenes, sources,
    cues: scenes.map(scene => ({ start: scene.start, end: scene.end, text: scene.support })),
  };
}
