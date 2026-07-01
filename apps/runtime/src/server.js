import Fastify from 'fastify';
import cors from '@fastify/cors';
import { getMetaVersion, AgentSpec } from '@desagi/spec';

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

const version = getMetaVersion();
const startedAt = Date.now();

app.get('/healthz', async (req, reply) => {
  reply.header('cache-control', 'no-store');
  const include = req.query?.include;
  if (include && include !== 'counts') {
    reply.code(400);
    return { error: 'bad_query_include' };
  }
  return {
    ok: true,
    version,
    ts: new Date().toISOString(),
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    ...(include === 'counts' ? { counts: { sessions: 0 } } : {}),
  };
});

// Placeholder: validate AgentSpec format early
app.post('/v1/spec/validate', async (req, reply) => {
  const parsed = AgentSpec.safeParse(req.body);
  if (!parsed.success) {
    reply.code(400);
    return { error: 'invalid_spec', issues: parsed.error.issues };
  }
  return { ok: true };
});

// Placeholder: text chat endpoint (no provider call yet)
app.post('/v1/chat', async (req) => {
  // MVP placeholder response.
  // Next: wire provider adapters (xAI default) and AgentBundle loading.
  return { reply: 'Runtime skeleton online. Provider adapters not wired yet.', echo: req.body ?? null };
});

const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: '0.0.0.0' });
