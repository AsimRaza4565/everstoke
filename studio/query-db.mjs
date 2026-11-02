import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const ROOT = path.resolve(import.meta.dirname, '..');
const content = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const dbUrl = content.match(/^DATABASE_URL=(.*)$/m)[1].trim();

const sql = postgres(dbUrl);

async function run() {
  const attempts = await sql`SELECT * FROM login_attempts ORDER BY at DESC LIMIT 10`;
  console.log('Recent login attempts:');
  console.log(attempts);

  const sessions = await sql`SELECT id, email, role, name, user_agent, ip, created_at, expires_at, last_used, revoked FROM sessions ORDER BY created_at DESC LIMIT 5`;
  console.log('Recent sessions:');
  console.log(sessions);

  await sql.end();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
