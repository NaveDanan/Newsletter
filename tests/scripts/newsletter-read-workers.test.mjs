import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

test('native cover cache preserves every byte of an embedded image', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'newsletter-cover-'));
  try {
    const bytes = Buffer.from(Array.from({ length: 4097 }, (_, i) => i % 256));
    const input = join(directory, 'cover.input'), output = join(directory, 'cover');
    await writeFile(input, bytes.toString('base64'));
    execFileSync(process.execPath, ['scripts/pocketbase/newsletter-cover.mjs', input, output]);
    assert.deepEqual(await readFile(output), bytes);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('search backfill is idempotent and preserves original content, images and timestamps', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'newsletter-search-'));
  const path = join(directory, 'data.db');
  const database = new DatabaseSync(path);
  try {
    database.exec('CREATE TABLE newsletters (id TEXT, content TEXT, coverImage TEXT, updated TEXT, searchText TEXT)');
    const body = '<p>Hello <strong>world</strong></p><img src="data:image/png;base64,' + 'x'.repeat(100_000) + '"><p>מחבר &nbsp; Author</p>';
    database.prepare('INSERT INTO newsletters VALUES (?, ?, ?, ?, ?)').run('article', body, 'original image', '2026-10-06', '');
    const before = database.prepare('SELECT id, content, coverImage, updated FROM newsletters').all();
    execFileSync(process.execPath, ['scripts/pocketbase/newsletter-search.mjs', path], { stdio: 'pipe' });
    assert.equal(database.prepare('SELECT searchText FROM newsletters').get().searchText, 'Hello world מחבר Author');
    assert.deepEqual(database.prepare('SELECT id, content, coverImage, updated FROM newsletters').all(), before);
    execFileSync(process.execPath, ['scripts/pocketbase/newsletter-search.mjs', path], { stdio: 'pipe' });
    assert.deepEqual(database.prepare('SELECT id, content, coverImage, updated FROM newsletters').all(), before);
  } finally { database.close(); await rm(directory, { recursive: true, force: true }); }
});
