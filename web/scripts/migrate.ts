import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join } from 'path';

void (async () => {
  const sql = neon(process.env.DATABASE_URL!);
  const schema = readFileSync(join(__dirname, '../lib/schema.sql'), 'utf8');

  const statements = schema
    .split(';')
    .map(s =>
      s
        .split('\n')
        .filter(line => !line.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter(s => s.length > 0);

  for (const statement of statements) {
    await sql.query(statement);
  }

  console.log(`migration complete (${statements.length} statements)`);
})();
