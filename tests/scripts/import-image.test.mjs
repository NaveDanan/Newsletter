import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { importImage } from '../../scripts/pocketbase/import-image.mjs';

const hasConverter = spawnSync('magick', ['-version'], { windowsHide: true }).status === 0;
if (process.env.REQUIRE_IMAGE_CONVERTER && !hasConverter) throw new Error('ImageMagick is required in the runtime image.');
const conversion = { skip: !hasConverter };

test('retains a GIF byte-for-byte under a generic filename', async () => {
  const bytes = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  assert.equal(await importImage(bytes, 'word/media/animation.image'), `data:image/gif;base64,${bytes.toString('base64')}`);
});

test('preserves every frame and timing of an animated GIF', conversion, async () => {
  const bytes = execFileSync('magick', ['-delay', '17', '-size', '2x2', 'xc:red', '-delay', '31', '-size', '2x2', 'xc:blue', '-loop', '0', 'gif:-']);
  const result = await importImage(bytes, 'animation.image');
  assert.equal(result, `data:image/gif;base64,${bytes.toString('base64')}`);
  const frames = execFileSync('magick', ['identify', '-format', '%T,', '-'], { input: bytes, encoding: 'utf8' });
  assert.equal(frames, '17,31,');
});

for (const format of ['BMP', 'TIFF', 'ICO', 'PSD', 'TGA', 'JP2', 'AVIF', 'HEIC', 'JXL']) {
  test(`converts ${format} bytes under a generic extension to PNG`, conversion, async () => {
    const bytes = execFileSync('magick', ['-size', '8x8', 'xc:red', `${format}:-`]);
    const result = await importImage(bytes, 'image.image');
    assert.match(result, /^data:image\/png;base64,/);
    const png = Buffer.from(result.split(',')[1], 'base64');
    assert.equal(execFileSync('magick', ['identify', '-format', '%wx%h', '-'], { input: png, encoding: 'utf8' }), '8x8');
  });
}

test('rasterizes self-contained SVG', conversion, async () => {
  const result = await importImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>'), 'image.image');
  assert.match(result, /^data:image\/png;base64,/);
});

test('rejects corrupt and missing images with their names', conversion, async () => {
  await assert.rejects(importImage(Buffer.from('not an image'), 'broken.image'), /broken.image could not be decoded/);
  await assert.rejects(importImage(Buffer.alloc(0), 'empty.image'), /empty.image is empty/);
});

test('rejects SVG external reads and entities', async () => {
  for (const svg of [
    '<svg><image href="file:///etc/passwd"/></svg>',
    '<svg><image href="https://example.com/image.png"/></svg>',
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg>&x;</svg>',
  ]) await assert.rejects(importImage(Buffer.from(svg), 'external.svg'), /external SVG resources/);
});
