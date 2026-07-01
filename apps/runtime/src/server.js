import Fastify from 'fastify';
import cors from '@fastify/cors';
import { getMetaVersion, AgentSpec } from '@desagi/spec';
import OpenAI from 'openai';
import websocket from '@fastify/websocket';

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await app.register(websocket);

app.register(async function (app) {
  // static files (very small MVP)
  app.get('/realtime', async (req, reply) => {
    reply.type('text/html');
    // served via filesystem read to avoid adding deps; fine for MVP.
    const fs = await import('node:fs/promises');
    const p = new URL('../public/realtime.html', import.meta.url);
    return fs.readFile(p, 'utf8');
  });
});

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

// Realtime (browser mic) — MVP skeleton
// Protocol (client -> server):
//  - { type: 'hello', sampleRate: 48000 }
//  - { type: 'audio', format: 'pcm16', sampleRate: 16000, dataB64: '...' }
// Protocol (server -> client):
//  - { type: 'info' | 'error' | 'assistant_text' | 'assistant_audio' }
app.get('/v1/realtime/ws', { websocket: true }, (conn, req) => {
  const ws = conn.socket;
  ws.send(JSON.stringify({ type: 'info', message: 'realtime ws connected (skeleton)' }));

  ws.on('message', async (buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString('utf8'));
    } catch {
      ws.send(JSON.stringify({ type: 'error', error: 'bad_json' }));
      return;
    }

    // For now, just ack audio frames and allow simple text messages.
    if (msg?.type === 'audio') {
      ws.send(JSON.stringify({ type: 'info', message: `audio frame received (${msg.format || 'unknown'})` }));
      return;
    }

    if (msg?.type === 'text') {
      // Use the same xAI text path as /v1/chat (until we wire true xAI realtime audio)
      try {
        const resp = await xai.chat.completions.create({
          model: DEFAULT_XAI_MODEL,
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: String(msg.text ?? '') },
          ],
          temperature: 0.3,
        });
        ws.send(JSON.stringify({
          type: 'assistant_text',
          text: resp.choices?.[0]?.message?.content ?? '',
        }));
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', error: 'xai_error', message: String(e?.message ?? e) }));
      }
      return;
    }
  });
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
