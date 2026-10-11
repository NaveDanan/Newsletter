import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const hooksDir = new URL('../../pb_hooks', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function loadHook(file, globals = {}) {
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    console,
    __hooks: hooksDir,
    require: (path) => loadHook(path.replace(hooksDir + '/', ''), globals),
    ...globals,
  };
  vm.runInNewContext(readFileSync(`${hooksDir}/${file}`, 'utf8'), context);
  return module.exports;
}

const png = (width, height) => {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
};

// SOI, an EXIF APP1 segment carrying `orientation`, padding, then SOF0.
const jpeg = (width, height, orientation = 1, paddingBytes = 0) => {
  const tiff = Buffer.alloc(26);
  tiff.write('II', 0, 'ascii');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x0112, 10);
  tiff.writeUInt16LE(3, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt16LE(orientation, 18);
  const exif = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, 0, 0]), exif]);
  app1.writeUInt16BE(exif.length + 2, 2);
  const padding = [];
  for (let left = paddingBytes; left > 0; left -= 65000) {
    const size = Math.min(left, 65000);
    const segment = Buffer.alloc(size + 4);
    segment.writeUInt16BE(0xffe2, 0);
    segment.writeUInt16BE(size + 2, 2);
    padding.push(segment);
  }
  const sof = Buffer.from([0xff, 0xc0, 0, 17, 8, 0, 0, 0, 0, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, ...padding, sof, Buffer.from([0xff, 0xd9])]);
};

const gif = (width, height) => {
  const bytes = Buffer.alloc(24);
  bytes.write('GIF89a', 0, 'ascii');
  bytes.writeUInt16LE(width, 6);
  bytes.writeUInt16LE(height, 8);
  return bytes;
};

const webpExtended = (width, height) => {
  const bytes = Buffer.alloc(30);
  bytes.write('RIFF', 0, 'ascii');
  bytes.write('WEBP', 8, 'ascii');
  bytes.write('VP8X', 12, 'ascii');
  bytes.writeUIntLE(width - 1, 24, 3);
  bytes.writeUIntLE(height - 1, 27, 3);
  return bytes;
};

const dataUrl = (type, bytes) => `data:image/${type};base64,${bytes.toString('base64')}`;
const attrs = (html) => ({
  width: Number(html.match(/ width="(\d+)"/)?.[1]),
  height: Number(html.match(/ height="(\d+)"/)?.[1]),
});

const emailImage = loadHook('lib/email-image.js');

test('reads the natural size of PNG, GIF, WebP and JPEG covers', () => {
  const read = (bytes) => JSON.parse(JSON.stringify(emailImage.readImageSize([...bytes])));
  assert.deepEqual(read(png(1600, 900)), { width: 1600, height: 900 });
  assert.deepEqual(read(gif(320, 480)), { width: 320, height: 480 });
  assert.deepEqual(read(webpExtended(1200, 628)), { width: 1200, height: 628 });
  assert.deepEqual(read(jpeg(1920, 1080)), { width: 1920, height: 1080 });
});

test('EXIF rotated JPEGs report the dimensions browsers display', () => {
  const size = emailImage.readImageSize([...jpeg(4032, 3024, 6)]);
  assert.equal(size.width, 3024);
  assert.equal(size.height, 4032);
});

test('every email image gets width and height attributes in the original ratio', () => {
  for (const [bytes, type, width, height] of [
    [png(1600, 900), 'png', 1600, 900],
    [jpeg(800, 1200), 'jpeg', 800, 1200],
    [gif(300, 100), 'gif', 300, 100],
  ]) {
    const html = emailImage.buildEmailImage({ src: dataUrl(type, bytes), alt: 'Cover', maxWidth: 656 });
    const size = attrs(html);
    assert.ok(size.width <= 656, html);
    assert.ok(Math.abs(size.width / size.height - width / height) < 0.01, `${type}: ${size.width}x${size.height}`);
    assert.match(html, /height:auto/);
  }
});

test('small images are not upscaled and keep their exact size', () => {
  const html = emailImage.buildEmailImage({ src: dataUrl('png', png(300, 100)), maxWidth: 656 });
  assert.deepEqual(attrs(html), { width: 300, height: 100 });
  assert.match(html, /max-width:300px/);
});

test('a JPEG frame header far past the first probe is still found', () => {
  const html = emailImage.buildEmailImage({ src: dataUrl('jpeg', jpeg(1000, 500, 1, 200000)), maxWidth: 420 });
  assert.deepEqual(attrs(html), { width: 420, height: 210 });
});

test('unknown dimensions never produce a lone width attribute', () => {
  const html = emailImage.buildEmailImage({ src: 'data:image/png;base64,AAAA', maxWidth: 656 });
  assert.doesNotMatch(html, / width="/);
  assert.doesNotMatch(html, / height="/);
  assert.match(html, /height:auto/);
});

test('data URLs are not altered and root-relative paths become absolute', () => {
  const src = dataUrl('png', png(10, 10));
  assert.ok(emailImage.buildEmailImage({ src, maxWidth: 656 }).includes(`src="${src}"`));
  assert.equal(emailImage.toAbsoluteUrl('/api/newsletters/a/cover', 'https://site.test'), 'https://site.test/api/newsletters/a/cover');
});

function createSubscriberApp(rows) {
  const saved = [];
  return {
    saved,
    rows,
    findFirstRecordByFilter(collection, filter, params) {
      const row = collection === 'newsletter_subscribers' && rows.find((item) => item.getString('email') === params.email);
      if (!row) throw new Error('not found');
      return row;
    },
    findCollectionByNameOrId: (name) => ({ name }),
    save(record) {
      saved.push(record);
      if (!rows.includes(record)) rows.push(record);
    },
  };
}

class FakeRecord {
  constructor(collection, values = {}) {
    this.collection = collection;
    this.values = { ...values };
  }
  set(key, value) { this.values[key] = value; }
  get(key) { return this.values[key]; }
  getString(key) { return this.values[key] == null ? '' : String(this.values[key]); }
}

const mail = loadHook('lib/newsletter-mail.js', { Record: FakeRecord, $os: { getenv: () => '' } });

test('the registered-user sync never re-activates a subscriber switched off by an admin', () => {
  const disabled = new FakeRecord('newsletter_subscribers', { email: 'off@example.com', isActive: false, locale: 'he', source: 'registered_account' });
  const app = createSubscriberApp([disabled]);
  const user = { getString: (key) => ({ email: 'off@example.com', locale: 'he' })[key] || '' };

  mail.upsertSubscriberForUser(app, user);
  mail.subscribeEmail(app, 'off@example.com', { locale: 'he', source: 'registered_account' });

  assert.equal(disabled.get('isActive'), false);
  assert.equal(app.saved.length, 0, 'an unchanged row is not saved again');
});

test('a new subscriber is created active', () => {
  const app = createSubscriberApp([]);
  const subscriber = mail.upsertSubscriber(app, 'new@example.com', { locale: 'en', source: 'sidebar' });
  assert.equal(subscriber.get('isActive'), true);
  assert.equal(app.rows.length, 1);
});

const emailTheme = loadHook('lib/email-theme.js');

test('emails follow the recipient theme and accent preference', () => {
  const fallback = emailTheme.buildTheme({});
  assert.equal(fallback.mode, 'light');
  assert.equal(fallback.accent, '#ff3b53');

  const dark = emailTheme.buildTheme({ themePreference: 'dark', accentPreset: 'purple' });
  assert.equal(dark.mode, 'dark');
  assert.equal(dark.accent, '#b066ff');
  assert.equal(dark.accentContrast, '#ffffff');

  const custom = emailTheme.buildTheme({ themePreference: 'system', accentPreset: 'custom', accentCustomHex: '#623238' });
  assert.equal(custom.mode, 'light');
  assert.equal(custom.accent, '#623238');
  assert.equal(emailTheme.buildTheme({ accentPreset: 'custom', accentCustomHex: 'nope' }).accent, '#ff3b53');
});

test('light accents stay readable as text on a white email', () => {
  const yellow = emailTheme.buildTheme({ accentPreset: 'yellow' });
  assert.equal(yellow.accent, '#ffe600', 'buttons and bars keep the exact accent');
  assert.equal(yellow.accentContrast, '#121214', 'button text is dark on a light accent');
  assert.notEqual(yellow.accentText, yellow.accent, 'links use a darker shade on white');
  assert.equal(emailTheme.buildTheme({ themePreference: 'dark', accentPreset: 'yellow' }).accentText, '#ffe600');
  for (const value of Object.values(emailTheme.buildTheme({ accentPreset: 'lime' }))) {
    assert.doesNotMatch(String(value), /rgba|var\(/, 'Outlook needs plain colours');
  }
});
