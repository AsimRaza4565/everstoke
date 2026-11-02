// Quick MCP stdio handshake test for a yutu channel config.
// Usage: node yt-mcp/smoke-test.mjs <path-to-token.json>
// Spawns `yutu mcp` with YUTU_* env, does initialize + tools/list, prints tool count.
import { spawn } from 'node:child_process';
import path from 'node:path';

const tokenPath = path.resolve(process.argv[2] || 'channels/quotequarry/token.json');
const credPath = path.resolve(import.meta.dirname, 'client_secret.json');

const YUTU_EXE = 'C:\\Users\\Revnix\\AppData\\Roaming\\npm\\node_modules\\@eat-pray-ai\\yutu\\node_modules\\@eat-pray-ai\\yutu-win32-x64\\bin\\yutu.exe';
const child = spawn(YUTU_EXE, ['mcp'], {
  env: { ...process.env, YUTU_CREDENTIAL: credPath, YUTU_CACHE_TOKEN: tokenPath },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let buf = '';
const tools = [];
child.stdout.on('data', (d) => {
  buf += d.toString();
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id === 1 && msg.result?.tools) {
      tools.push(...msg.result.tools.map((t) => t.name));
      console.log(`✅ MCP server connected — ${tools.length} tools`);
      console.log('sample:', tools.filter((n) => /video|comment|playlist|thumb|channel/.test(n)).slice(0, 20).join(', '));
      child.kill();
      process.exit(0);
    }
    if (msg.id === 0 && msg.error) {
      console.error('initialize failed:', msg.error);
      child.kill();
      process.exit(1);
    }
  }
});
child.stderr.on('data', (d) => console.error('[yutu stderr]', d.toString().trim()));

child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke-test', version: '1.0' } } }) + '\n');
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) + '\n');

setTimeout(() => { console.error(`❌ timeout — got ${tools.length} tools`); child.kill(); process.exit(1); }, 45000);
