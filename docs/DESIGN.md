# desagi — Design Document (v0)

## 0) One-liner
**desagi** is a provider-agnostic, container-first platform for designing, deploying, and operating conversational agents (text + audio) via **config-over-code**, starting with an Owner.com-style restaurant agent as the first demo.

## 1) Goals / Non-goals

### Goals (Phase 1–2)
- **Interactive agent designer** (admin UI) that can:
  - create agent “profiles” (persona, tools, voice, memory, policies)
  - simulate conversations (text + audio)
  - export a deployable config bundle
- **Completely decoupled**:
  - designer can run without the runtime, and vice versa
  - agents are deployed as independent runtime services
- **Provider agnostic**:
  - pluggable LLM + TTS + STT providers
  - demos use **xAI realtime + voice credits**
- **Runs from a container** (local dev + cluster deploy)
- **API-key driven**: no provider secrets baked into images

### Non-goals (initial MVP)
- Multi-tenant billing
- Complex RBAC
- Full marketplace
- Perfect long-term memory system

## 2) Core Concepts

### 2.1 Agent Definition (Config)
An agent is defined by an **AgentSpec** (YAML/JSON):

```yaml
agentId: "restaurant-luigis"
name: "Luigi's Pizza Assistant"
version: "0.1.0"

providers:
  llm:
    kind: "xai"
    model: "grok-realtime"   # placeholder; configurable
  tts:
    kind: "xai"             # or elevenlabs/openai/etc.
    voice: "..."
  stt:
    kind: "xai"             # or whisper/deepgram/etc.

conversation:
  systemPrompt: |
    You are an AI restaurant answering service...
  modalities: ["text", "audio"]
  safety:
    pii: "minimize"
    escalation:
      enabled: true
      contact: "+1-XXX-XXX-XXXX"

memory:
  mode: "session"            # session | durable
  durableStore: "redis"       # later: postgres/vector

tools:
  - name: "menu.lookup"
    kind: "http"
    url: "http://menu-svc/menu"
  - name: "reservation.create"
    kind: "http"
    url: "http://res-svc/reservations"
```

**Config over code:** to change behavior, update spec (prompts/tools/flows), not runtime code.

### 2.1.1 Tool specs (JSON Schema, OpenAPI-ish)
Tools are defined with explicit input/output schemas so the runtime can:
- validate arguments
- render good admin UX
- generate stable tool-calling prompts across providers

Example tool (HTTP):

```yaml
tools:
  - name: "menu.lookup"
    kind: "http"
    description: "Lookup menu items and prices."
    method: "GET"
    url: "http://menu-svc/v1/menu"
    auth:
      kind: "apiKeyRef"
      ref: "profiles/owner-demo/menu-svc"
      in: "header"
      name: "Authorization"
    inputSchema:
      type: object
      properties:
        query:
          type: string
          description: "User search term like 'pepperoni'"
      required: [query]
      additionalProperties: false
    outputSchema:
      type: object
      properties:
        items:
          type: array
          items:
            type: object
            properties:
              name: { type: string }
              price: { type: number }
              description: { type: string }
            required: [name, price]
            additionalProperties: false
      required: [items]
      additionalProperties: false
```

### 2.2 Designer vs Runtime
- **Designer**: creates/edits AgentSpec + assets (voices, prompts, policies). Runs simulations.
- **Runtime**: loads AgentSpec, exposes conversation endpoints, connects to providers.

They are decoupled by:
- an **Agent Bundle** artifact (spec + assets)
- a **Deployment API** to publish bundles into a cluster

### 2.3 Deployment Model
- Each deployed agent is an **Agent Runtime** service (or a logical agent within a shared runtime pool).
- Cluster services can share info through:
  - shared state store (Redis/Postgres)
  - event bus (NATS/Kafka) later

## 3) High-level Architecture

### 3.1 Services
1) **Designer UI + API**
   - CRUD AgentSpecs
   - simulation (text/audio)
   - versioning
   - publishes Agent Bundles

2) **Agent Runtime**
   - loads one AgentSpec (or many)
   - conversation endpoints:
     - `POST /v1/chat`
     - `POST /v1/audio:input` (streaming later)
   - provider adapters (LLM/TTS/STT)
   - tool runner (HTTP tools initially)
   - memory/session state

3) **Control Plane (minimal initially)**
   - registry of deployed agents
   - rollout / restart
   - health + logs

### 3.2 Data Stores (phase plan)
- Phase 1: file-based bundles + in-memory sessions
- Phase 2: Postgres (specs, versions), Redis (sessions), object storage (assets)

## 4) Provider Abstraction

### 4.1 Interfaces
- `LLMAdapter`: `complete(messages, tools, ...) -> assistant_message`
- `RealtimeAdapter` (optional): websocket streaming for audio/text
- `TTSAdapter`: `speak(text, voice, format) -> audio`
- `STTAdapter`: `transcribe(audio) -> text`

### 4.2 xAI for demos
- Default demo adapters:
  - xAI text
  - xAI realtime audio (as available)
  - if gaps: fallback to local browser mic + server relay

## 5) Audio + Text Blending
MVP approach:
- Text chat endpoint works first.
- Add audio in two steps:
  1) **Push-to-talk**: client records audio → server STT → LLM → TTS → audio reply
  2) **Realtime**: upgrade to streaming websocket when stable

### 5.1 Live barge-in (configurable)
Barge-in should be a first-class runtime feature, controlled per-agent:

```yaml
realtime:
  bargeIn:
    enabled: true
    mode: "stop"   # stop | duck
  vad:
    enabled: true
    sensitivity: 0.6
```

Runtime behavior:
- When the assistant is speaking (audio out) and user speech is detected:
  - `stop`: cut TTS stream immediately; prioritize user audio
  - `duck`: reduce assistant gain while user is speaking

## 6) Generic Agent Lifecycle (domain-agnostic)
Every agent, regardless of domain, follows the same high-level loop:

1) **Session boot**
   - load AgentBundle (AgentSpec + assets)
   - initialize provider adapters (LLM/TTS/STT)
   - initialize tool registry + validators
   - initialize memory/session state

2) **Ingest user event**
   - text message OR audio frames
   - for audio: VAD + partial/final transcript events

3) **Policy pass**
   - apply PII/minimization rules
   - escalation triggers

4) **Plan & act**
   - produce assistant output and/or tool calls
   - run tools (HTTP initially), validate args/outputs
   - update structured state (optional)

5) **Respond**
   - stream text deltas
   - stream audio deltas (TTS)
   - respect barge-in behavior

6) **Observe**
   - event stream + metrics
   - transcript retention per config

## 7) “Interactive Help Agent Designer” UX

### 6.1 Admin UI screens (MVP)
- Agent list
- Agent editor:
  - system prompt
  - provider selection + model
  - voice selection
  - tools (HTTP endpoints) builder
  - memory mode
  - policies (PII, escalation)
- Simulator:
  - text chat
  - audio chat (push-to-talk)
- Deploy:
  - publish bundle
  - view deployment status

### 6.2 Iteration loop
- Change config → simulate → deploy → observe metrics → iterate

## 8) Multi-agent / Shared Info (End goal)
End-state:
- Many agents deployed for different customers.
- Shared knowledge patterns:
  - org-level shared FAQ (read-only)
  - per-agent memory (durable)
  - shared incident / escalation queue

## 9) First Use Case: Owner.com-style Restaurant Agent

### What we will demo
- A restaurant answering agent that:
  - answers menu questions
  - takes orders
  - handles reservations
  - escalates to human

### What we will NOT do in first demo
- Real POS integration
- Payment

## 9) Security / Secrets
- Provider API keys live in:
  - runtime env vars / secret manager
  - never in AgentSpec
- Designer stores references (e.g. `providerProfileId`) not raw keys.

## 10) Deployment & Containers
MVP container plan:
- `desagi-designer` image
- `desagi-runtime` image
Later: helm chart for k8s.

## 11) MVP Milestones

### Milestone A (1–2 days)
- Finalize AgentSpec schema
- Runtime skeleton (text only) + xAI adapter
- Designer skeleton: create/edit spec + simulate text

### Milestone B (2–4 days)
- Push-to-talk audio loop (STT+TTS)
- Bundle publish + runtime load

### Milestone C
- “Owner.com restaurant” demo pack
- basic observability (logs, health)

## 12) Open Questions

## 13) Runtime shapes: A now, easy B later
### A) Runtime-per-agent (MVP)
- each agent bundle deployed as its own runtime service
- simple isolation + simple mental model

### B) Shared runtime pool (later)
- one runtime hosts many bundles
- selection by `orgId/agentId/version` per request

Design constraint: keep the **core runtime engine** multi-tenant capable, but wire bundle selection at the edge.

- Exact xAI realtime API surface for audio (websocket vs http) in your account
- Preferred cluster target (k8s? nomad?)
- Where durable memory should live in v1 (Redis vs Postgres)
