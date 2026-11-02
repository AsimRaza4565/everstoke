// ONE-OFF (Phase 2 E2E, issue #104): full capability-registry chain proof with ONE
// tiny real call. routing (Neon provider_routes) -> adapter -> Groq (priority 100)
// -> usage_events row -> visible on /usage dashboard.
// Usage: DATABASE_URL=<real neon> GROQ key in env/vault ... node .tmp-routing-proof.mjs
import postgres from 'postgres';
import { makeProviderRouting } from './lib/provider-routing.js';
import { applyChannelKeys } from '../lib/channel-keys.mjs';
import { routeAndCall } from '../lib/ai-adapter.mjs';

const sql = postgres(process.env.DATABASE_URL, { prepare: false });
const routing = makeProviderRouting(sql);
applyChannelKeys('money-rulebook', process.env); // per-channel vault keys into env

const result = await routeAndCall('script-gen', {
  slug: 'money-rulebook',
  jobId: 'e2e-routing-proof',
  prompt: 'Reply with ONLY this JSON object, unchanged: {"ok":true,"proof":"capability-registry routing works"}',
  injected: {
    routing,
    env: process.env,
    writer: {
      writeUsageEvent: async (ev) => {
        console.log('USAGE EVENT →', JSON.stringify(ev));
        await sql`INSERT INTO usage_events (job_id, channel_id, provider, model, capability, tokens, usage_source, ok, error_class)
          VALUES (${ev.job_id ?? 'e2e-routing-proof'}, ${ev.channel_id ?? 'money-rulebook'}, ${ev.provider}, ${ev.model}, ${ev.capability}, ${ev.tokens ?? 0}, ${ev.usage_source ?? 'estimated'}, ${ev.ok === true}, ${ev.error_class ?? null})`;
      },
      ensureUsageSchema: async () => {},
    },
  },
});

console.log('RESULT:', JSON.stringify({ ok: result.ok, provider: result.usage?.provider, model: result.usage?.model, tokens: result.usage?.tokens, usage_source: result.usage?.usage_source, error: result.error || null }, null, 1));
await sql.end();
