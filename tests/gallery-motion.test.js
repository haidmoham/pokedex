import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/gallery-motion.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { GalleryDrag, GalleryMotion, galleryIndex } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('fractional offsets and edge overscroll resolve only to real loaded artwork', () => {
  assert.equal(galleryIndex(159.9,320,3),0);
  assert.equal(galleryIndex(160.1,320,3),1);
  for (const width of [320,390,1470]) {
    assert.equal(galleryIndex(-width,width,3),0);
    assert.equal(galleryIndex(width*20,width,3),2);
  }
  for(const width of [0,NaN,Infinity]) assert.equal(galleryIndex(320,width,3),0);
});
test('programmatic restore, resize and interrupted panels cannot select an unseen artwork', () => {
  const session = new GalleryMotion();
  assert.equal(session.settle(320,320,4,0),null);
  session.input(); session.align();
  assert.equal(session.settle(640,320,4,0),null);
  session.input(); session.blocked=true;
  assert.equal(session.settle(640,320,4,0),null);
  session.blocked=false; session.input();
  assert.equal(session.settle(320,320,4,0),1);
});
test('native settled reversals and successive input have no time-based cooldown', () => {
  const session=new GalleryMotion();
  for(const [offset,selected,next] of [[390,0,1],[0,1,0],[780,0,2],[390,2,1]]) {
    session.input(); assert.equal(session.settle(offset,390,3,selected),next);
  }
});
test('duplicate settlement events cannot advance again before React commits selection', () => {
  const session=new GalleryMotion();session.input();
  assert.equal(session.settle(390,390,3,0),1);
  assert.equal(session.settle(390,390,3,0),null);
  session.align();session.settle(390,390,3,1);
  session.input();assert.equal(session.settle(0,390,3,1),0);
});
test('mouse/fallback touch tracks small owned displacement and uninterrupted reversals', () => {
  const drag=new GalleryDrag();drag.start(1,200,200,390);
  assert.equal(drag.read(1,197,200),null);
  assert.equal(drag.read(1,194,201),396);
  assert.equal(drag.read(1,180,205),410);
  assert.equal(drag.read(1,220,205),370);
  drag.cancel();assert.equal(drag.read(1,100,200),null);
});
test('diagonal ownership and pointer cancellation do not manufacture horizontal selection', () => {
  const drag=new GalleryDrag();
  for(const [x,y,horizontal] of [[80,20,true],[50,50,false],[20,80,false]]) {
    drag.start(1,100,100,320);
    assert.equal(drag.read(1,100-x,100-y)!==null,horizontal);
  }
  drag.start(1,100,100,320);
  assert.equal(drag.read(2,0,100),null);
  assert.equal(drag.read(1,80,100),340);
  drag.cancel();assert.equal(drag.owned,false);
  assert.equal(drag.read(1,0,100),null);
  drag.start(3,100,100,320);drag.read(3,98,50);
  assert.equal(drag.read(3,0,50),null); // Vertical ownership remains vertical.
});
