import Fastify from 'fastify';
import cors from '@fastify/cors';
import { getMetaVersion, AgentSpec } from '@desagi/spec';
import OpenAI from 'openai';

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

const version = getMetaVersion();
const startedAt = Date.now();

// Provider defaults (config-over-code: AgentSpec can override model/provider later)
const DEFAULT_XAI_MODEL = process.env.XAI_MODEL || 'grok-3-mini-fast';
const xai = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: process.env.XAI_BASE_URL || 'https://api.x.ai/v1',
});

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
  const body = req.body ?? {};
  const message = String(body.message ?? '');
  const agentId = body.agentId ?? null;

  if (!process.env.XAI_API_KEY) {
    return {
      reply:
        'xAI is not configured. Set XAI_API_KEY in the runtime environment (designer does not store secrets).',
      agentId,
    };
  }

  const model = String(body.model ?? DEFAULT_XAI_MODEL);
  const systemPrompt = body.systemPrompt
    ? String(body.systemPrompt)
    : "You are a helpful assistant. Respond concisely.";

  const resp = await xai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message },
    ],
    temperature: 0.3,
  });

  return {
    agentId,
    model,
    reply: resp.choices?.[0]?.message?.content ?? '',
  };
});

const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: '0.0.0.0' });
