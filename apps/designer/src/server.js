import http from 'node:http';
import { AgentSpec } from '@desagi/spec';

const port = Number(process.env.PORT ?? 3000);
const runtimeBase = process.env.RUNTIME_BASE_URL ?? 'http://localhost:3001';

function send(res, code, obj, headers = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  if (!req.url) return send(res, 400, { error: 'bad_request' });
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`
      <h1>desagi designer (skeleton)</h1>
      <p>Runtime: <code>${runtimeBase}</code></p>
      <p>Try POST <code>/api/simulate</code> with an AgentSpec + message.</p>
    `);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/simulate') {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', async () => {
      try {
        const body = data ? JSON.parse(data) : {};
        const specParse = AgentSpec.safeParse(body.spec);
        if (!specParse.success) return send(res, 400, { error: 'invalid_spec', issues: specParse.error.issues });

        const msg = body.message ?? '';
        const r = await fetch(`${runtimeBase}/v1/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            message: msg,
            agentId: specParse.data.agentId,
            systemPrompt: specParse.data.conversation?.systemPrompt,
            model: specParse.data.providers?.llm?.model,
          }),
        });
        const out = await r.json();
        return send(res, 200, { ok: true, runtime: out });
      } catch (e) {
        return send(res, 500, { error: 'server_error', message: String(e?.message ?? e) });
      }
    });
    return;
  }

  send(res, 404, { error: 'not_found' });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`[designer] listening on :${port} (runtime=${runtimeBase})`);
});
