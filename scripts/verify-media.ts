/** Technical synthetic fixture only. This does not test story quality or speech alignment. */
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { artifactPath, artifactUrl, probeMedia, renderVideo, runCommand, saveNarration } from '../lib/media';

async function main() {
  const id = 'technical-render-verification';
  const filename = artifactPath(id, 'technical-tone.wav');
  await fs.mkdir(filename.slice(0, filename.lastIndexOf('/')), { recursive: true });
  await runCommand('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2.5', '-ar', '48000', '-c:a', 'pcm_s16le', filename]);
  const source = await fs.readFile(filename); const hash = createHash('sha256').update(source).digest('hex');
  const uploaded = await saveNarration(new File([source], 'technical-tone.wav', { type: 'audio/wav' }));
  if (uploaded.sha256 !== hash || uploaded.duration !== 2.5) throw new Error('Upload integrity or actual duration did not match.');
  const narration = { narrationId: id, filename: 'technical-tone.wav', path: filename, url: artifactUrl(id, 'technical-tone.wav'), duration: 2.5, sha256: hash, original: true, createdAt: new Date().toISOString() };
  const result = await renderVideo(id, { narration, title: 'Technical render verification', alignment: { words: [{ word: 'Synthetic technical fixture.', start: .1, end: 2.3, confidence: 1 }], transcript: 'Synthetic technical fixture.', confidence: 1, duration: 2.5, url: '' } });
  const metadata = await probeMedia(result.path);
  console.log(JSON.stringify({ fixtureOnly: true, speechAlignmentTested: false, uploadedAudioPreserved: uploaded.sha256 === hash, path: result.path, metadata }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
