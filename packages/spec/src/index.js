import { z } from 'zod';

export function getMetaVersion() {
  return process.env.APP_VERSION || process.env.GIT_SHA || null;
}

export const ToolHttpSpec = z.object({
  name: z.string().min(1),
  kind: z.literal('http'),
  description: z.string().optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('POST'),
  url: z.string().url(),
  auth: z
    .object({
      kind: z.enum(['none', 'apiKeyRef']).default('none'),
      ref: z.string().optional(),
      in: z.enum(['header', 'query']).optional(),
      name: z.string().optional(),
    })
    .optional(),
  inputSchema: z.record(z.string(), z.any()).optional(),
  outputSchema: z.record(z.string(), z.any()).optional(),
});

export const AgentSpec = z.object({
  agentId: z.string().min(1),
  name: z.string().min(1),
  version: z.string().default('0.1.0'),
  providers: z
    .object({
      llm: z
        .object({
          kind: z.string().min(1),
          model: z.string().min(1).optional(),
          profileRef: z.string().optional(),
        })
        .optional(),
      tts: z
        .object({ kind: z.string().min(1), voice: z.string().optional(), profileRef: z.string().optional() })
        .optional(),
      stt: z
        .object({ kind: z.string().min(1), profileRef: z.string().optional() })
        .optional(),
    })
    .default({}),
  conversation: z
    .object({
      systemPrompt: z.string().default(''),
      modalities: z.array(z.enum(['text', 'audio'])).default(['text']),
    })
    .default({}),
  realtime: z
    .object({
      bargeIn: z
        .object({ enabled: z.boolean().default(false), mode: z.enum(['stop', 'duck']).default('stop') })
        .default({ enabled: false, mode: 'stop' }),
      vad: z.object({ enabled: z.boolean().default(true), sensitivity: z.number().min(0).max(1).default(0.6) }).default({
        enabled: true,
        sensitivity: 0.6,
      }),
    })
    .default({}),
  tools: z.array(ToolHttpSpec).default([]),
});

