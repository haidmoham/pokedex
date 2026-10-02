// Whole-inventory CPU pose rendering for public static/absent species. This is
// an evidence generator, never an admission or GPU-playback claim. It resumes
// completed identities and records failures rather than hiding them.
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { trimHomeIdle } from './trim-home-idle.js';

const run = promisify(execFile);
const requirePipeline = createRequire(new URL('./model-pipeline/package.json', import.meta.url));
const { NodeIO } = requirePipeline('@gltf-transform/core');
const { ALL_EXTENSIONS } = requirePipeline('@gltf-transform/extensions');
const { dequantize } = requirePipeline('@gltf-transform/functions');
const { MeshoptDecoder } = requirePipeline('meshoptimizer');
const draco = requirePipeline('draco3dgltf');
const root = new URL('../', import.meta.url);
const directory = new URL('data/atlas-review/', root);
await mkdir(directory, { recursive: true });
const catalog = JSON.parse(await readFile(new URL('content/models/atlas-source-catalog-2026-10-02.json', root), 'utf8'));
const candidates = catalog.records.filter(item => item.currentPublicRuntime !== 'native-idle');
if (candidates.length !== 478) throw Error('Current native-idle gap changed');
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder, 'draco3d.decoder': await draco.createDecoderModule(),
});
const reports = [];
let cursor = 0, finished = 0;
async function worker() {
  while (cursor < candidates.length) {
    const item = candidates[cursor++], id = item.id;
    const reportURL = new URL(`${id}.json`, directory);
    try {
      const existing = JSON.parse(await readFile(reportURL, 'utf8'));
      if (existing.derivativeSha256 === item.sourceOnlyTrim.sha256 &&
          ['three-cpu-poses-rendered', 'source-authored-stationary-native-wait'].includes(existing.status) &&
          (await Promise.all([1, 2, 3].map(index => stat(new URL(`${id}-soft-pose-${index}.png`, directory))))).every(file => file.size > 1000)) {
        reports.push(existing); finished++; continue;
      }
    } catch { /* Incomplete or absent review output is regenerated. */ }
    let report;
    try {
      const source = await readFile(new URL(`data/atlas-git/${item.atlas.path}`, root));
      if (createHash('sha256').update(source).digest('hex') !== item.atlas.sha256) throw Error('source identity changed');
      const derivative = trimHomeIdle(source);
      if (createHash('sha256').update(derivative.bytes).digest('hex') !== item.sourceOnlyTrim.sha256) throw Error('derivative identity changed');
      const document = await io.readBinary(derivative.bytes);
      for (const extension of document.getRoot().listExtensionsUsed()) {
        if (/meshopt|draco/.test(extension.extensionName)) extension.dispose();
      }
      await document.transform(dequantize());
      const decoded = new URL(`${id}-decoded.glb`, directory);
      await io.write(decoded.pathname, document);
      const destination = new URL(`${id}-soft`, directory);
      const args = ['-b', '-t', '2', '--python', new URL('scripts/model-pipeline/render-idle-poses.py', root).pathname,
        '--', decoded.pathname, destination.pathname, String(derivative.duration), 'soft-light'];
      const { stdout, stderr } = await run('blender', args, { timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
      const poses = JSON.parse(await readFile(new URL(`${id}-soft-poses.json`, directory), 'utf8'));
      const distinctPoses = new Set(poses.map(pose => pose.worldVertexSha256)).size;
      if (poses.length !== 3 || (distinctPoses < 2 && id !== 597) ||
          !(await Promise.all([1, 2, 3].map(index => stat(new URL(`${id}-soft-pose-${index}.png`, directory))))).every(file => file.size > 1000)) {
        throw Error('rendered poses absent or not moving');
      }
      report = { id, status: distinctPoses < 2 ? 'source-authored-stationary-native-wait' : 'three-cpu-poses-rendered',
        admitted: false, derivativeSha256: item.sourceOnlyTrim.sha256,
        appearanceReviewed: false, gpuPlaybackVerified: false,
        poses, sourceGeometryOnly: true, softLight: true, renderLogTail: `${stdout}\n${stderr}`.slice(-500) };
    } catch (error) {
      report = { id, status: 'render-failed', admitted: false, derivativeSha256: item.sourceOnlyTrim.sha256,
        appearanceReviewed: false, gpuPlaybackVerified: false, error: String(error.message) };
    }
    await writeFile(reportURL, JSON.stringify(report, null, 2) + '\n');
    reports.push(report); finished++;
    if (finished % 25 === 0 || finished === candidates.length) console.log(`Rendered ${finished}/${candidates.length}; failures ${reports.filter(item => item.status === 'render-failed').length}`);
  }
}
await Promise.all(Array.from({ length: 3 }, worker));
reports.sort((a, b) => a.id - b.id);
const summary = { checkedAt: '2026-10-02', scope: 'Whole-gap three-pose CPU rendering only; appearance and GPU playback still need review',
  candidates: candidates.length, rendered: reports.filter(item => item.status === 'three-cpu-poses-rendered').length,
  sourceAuthoredStationary: reports.filter(item => item.status === 'source-authored-stationary-native-wait').length,
  failed: reports.filter(item => item.status === 'render-failed').length, results: reports };
await writeFile(new URL('data/atlas-review/summary.json', root), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ candidates: summary.candidates, rendered: summary.rendered, failed: summary.failed }));
if (summary.failed) process.exitCode = 1;
