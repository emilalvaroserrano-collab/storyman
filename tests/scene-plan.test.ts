import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScenePlan, motionFpsFor } from '../lib/scene-plan';
import type { ResearchSource } from '../lib/types';

const words = (text: string, startAt = 0, step = .38) => text.split(/\s+/).map((word, index) => ({ word, start: startAt + index * step, end: startAt + index * step + step * .85, confidence: .98 }));
const source = (title: string, url: string): ResearchSource => ({ title, url, excerpt: 'Synthetic unit excerpt.', accessedAt: '2026-01-01T00:00:00.000Z' });
const script = 'Isipin mo ito. Nagtayo ka ng maliit na negosyo. Pero isang araw nasunog ang lahat. Noong 1942, nagsimula sila sa Escolta. Kumita siya ng PHP 6,500 sa isang buwan. "Hindi kami sumuko," sabi niya. Kung ikaw ang nasa ganitong sitwasyon, susubok ka pa ba ulit?';
const plan = () => {
  const aligned = words(script);
  return buildScenePlan({ words: aligned, duration: aligned[aligned.length - 1].end + 1.2, title: 'The Bookstore That Survived Twice', genre: 'Rags to Riches', sources: [source('Socorro Ramos and National Book Store', 'https://example.com/a'), source('How National Book Store began', 'https://example.org/b')] });
};

test('scene plan covers the full narration with contiguous beats and a title card that can land', () => {
  const result = plan();
  assert.equal(result.version, 2);
  assert.equal(result.renderer, 'pillow-documentary-shorts-v2');
  assert.deepEqual(result.format, { width: 1080, height: 1920, fps: 30, motionFps: 12 });
  assert.equal(result.scenes[0].start, 0);
  assert.equal(result.scenes[0].kind, 'opening');
  assert.ok(result.scenes[0].end - result.scenes[0].start >= 1.5);
  for (let index = 1; index < result.scenes.length; index++) {
    assert.ok(Math.abs(result.scenes[index].start - result.scenes[index - 1].end) < 1e-9);
    assert.ok(result.scenes[index].end > result.scenes[index].start);
  }
  assert.equal(result.scenes[result.scenes.length - 1].end, result.duration);
  assert.ok(result.scenes.every(scene => scene.headline.trim().length > 0 && scene.support.trim().length > 0));
  assert.equal(result.scenes[result.scenes.length - 1].cta, true);
  assert.ok(result.scenes.slice(0, -1).every(scene => !scene.cta));
});

test('scene plan derives every number from the spoken words and never invents stats', () => {
  const result = plan();
  const spokenDigits = new Set(script.match(/\d+(?:[.,]\d+)*/g));
  for (const scene of result.scenes) {
    if (scene.stat) {
      assert.ok(spokenDigits.has(scene.stat), `stat ${scene.stat} must appear verbatim in the script`);
      assert.equal(scene.headline, scene.stat);
      if (scene.kind === 'timeline') assert.ok(!scene.support.includes(scene.stat), 'timeline support should not repeat the year');
      assert.ok(script.includes(scene.support.replace(/…$/, '')), 'support must quote spoken words verbatim');
    }
    for (const value of scene.headline.match(/\d+(?:[.,]\d+)*/g) || []) {
      if (scene !== result.scenes[0]) assert.ok(spokenDigits.has(value), `headline number ${value} must be spoken`);
    }
  }
  assert.deepEqual(result.scenes.filter(scene => scene.kind === 'timeline').map(scene => scene.headline), ['1942']);
  assert.ok(result.scenes.some(scene => scene.kind === 'stat' && scene.headline === '6,500'));
  const quote = result.scenes.find(scene => scene.kind === 'quote');
  assert.equal(quote?.headline, 'Hindi kami sumuko');
  assert.ok(quote?.support.length);
});

test('source cards use real http(s) sources only, deduplicated, and keep spoken text as support', () => {
  const aligned = words(script);
  const result = buildScenePlan({
    words: aligned, duration: aligned[aligned.length - 1].end + 1.2, title: 'The Bookstore That Survived Twice',
    sources: [source('Socorro Ramos and National Book Store', 'https://www.example.com/a'), source('Duplicate domain story', 'https://www.example.com/a'), source('How National Book Store began', 'https://example.org/b'), source('Unsafe source', 'javascript:alert(1)'), source('', 'https://example.net/c')],
  });
  assert.deepEqual(result.sources.map(item => item.domain), ['example.com', 'example.org']);
  assert.deepEqual(result.sources.map(item => item.title), ['Socorro Ramos and National Book Store', 'How National Book Store began']);
  const cards = result.scenes.filter(scene => scene.source);
  assert.ok(cards.length >= 1);
  for (const scene of result.scenes) if (scene.source) {
    assert.match(scene.source.url, /^https?:\/\//);
    assert.ok(result.sources.some(item => item.url === scene.source!.url));
  }
});

test('scene plan tolerates missing genre and sources but rejects unusable alignment', () => {
  const aligned = words('Isang maikling kuwento lamang ito.');
  const result = buildScenePlan({ words: aligned, duration: aligned[aligned.length - 1].end + .5, title: 'Maikling Kuwento' });
  assert.equal(result.kicker, 'DOCUMENTARY');
  assert.deepEqual(result.sources, []);
  assert.ok(result.scenes.every(scene => !scene.source));
  assert.throws(() => buildScenePlan({ words: [], duration: 10, title: 'Walang salita' }), /aligned words/);
  assert.throws(() => buildScenePlan({ words: aligned, duration: 0, title: 'Walang salita' }), /positive duration/);
  assert.throws(() => buildScenePlan({ words: [{ word: 'ito', start: 3, end: 2, confidence: .9 }], duration: 5, title: 'Baliktad' }), /aligned words/);
});

test('motion sampling scales with duration and respects an explicit override', () => {
  assert.equal(motionFpsFor(12), 12);
  assert.equal(motionFpsFor(45), 10);
  assert.equal(motionFpsFor(300), 8);
  const aligned = words(script);
  const duration = aligned[aligned.length - 1].end + 1.2;
  assert.equal(buildScenePlan({ words: aligned, duration, title: 'Override', motionFps: 14 }).format.motionFps, 14);
  assert.equal(buildScenePlan({ words: aligned, duration, title: 'Clamp high', motionFps: 90 }).format.motionFps, 15);
  assert.equal(buildScenePlan({ words: aligned, duration, title: 'Clamp low', motionFps: 1 }).format.motionFps, 4);
});
