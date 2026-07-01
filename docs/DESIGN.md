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

## 6) “Interactive Help Agent Designer” UX

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

## 7) Multi-agent / Shared Info (End goal)
End-state:
- Many agents deployed for different customers.
- Shared knowledge patterns:
  - org-level shared FAQ (read-only)
  - per-agent memory (durable)
  - shared incident / escalation queue

## 8) First Use Case: Owner.com-style Restaurant Agent

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
- Exact xAI realtime API surface for audio (websocket vs http) in your account
- Preferred cluster target (k8s? nomad?)
- Where durable memory should live in v1 (Redis vs Postgres)

