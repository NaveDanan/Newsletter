// One-time, idempotent backfill of the hidden plain-text read index. No source
// content, author fields, timestamps, or import checkpoints are changed.
import { DatabaseSync } from 'node:sqlite';
const database = new DatabaseSync(process.argv[2]);
database.exec('PRAGMA busy_timeout = 5000');
const rows = database.prepare('SELECT id, content FROM newsletters WHERE searchText = ? AND content != ?').all('', '');
const update = database.prepare('UPDATE newsletters SET searchText = ? WHERE id = ? AND content = ?');
database.exec('BEGIN');
try {
  for (const row of rows) {
    const text = row.content.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
    update.run(text, row.id, row.content);
  }
  database.exec('COMMIT');
} catch (error) { database.exec('ROLLBACK'); throw error; }
finally { database.close(); }
