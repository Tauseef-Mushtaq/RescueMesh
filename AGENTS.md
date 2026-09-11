# AGENTS.md — RescueMesh AI Development Contract

This file governs every future Claude session working on this project. Read this, `CURRENT_STATE.md`, `ARCHITECTURE.md`, and `PROJECT_RULES.md` before writing any code.

## Development

- Use Next.js + TypeScript.
- Use Node.js + npm only. Never introduce pnpm, yarn, or bun.
- Preserve existing working functionality — never remove a working capability to add a new one.
- Implement only the assigned module. Do not rewrite unrelated code.
- Prefer small, simple implementations over clever ones.
- Avoid unnecessary dependencies — use what's already installed before adding new packages.
- Avoid unnecessary refactoring of code outside the assigned module.
- Do not introduce paid APIs or services.
- Keep the application runnable after every module (build/lint/type-check must pass).

## AI vs. Application Responsibility

**AI is responsible for:**
- Language understanding (English, Urdu, Roman Urdu)
- Incident extraction
- Classification
- Summarization
- Semantic interpretation
- RAG reasoning
- Recommendation generation

**Application code is responsible for:**
- Schema validation of AI output
- Deterministic priority scoring
- Database operations
- Authentication/authorization
- Similarity thresholds
- Status management (NEW/VERIFIED/RESOLVED)
- UI state and error handling
- Rate limiting
- Safety constraints

**Rule:** AI output must never directly control critical application logic (e.g., priority score, persistence decisions, authorization). AI proposes; deterministic code decides.

## Security

Never expose to the browser:
- `GEMINI_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Keep all secrets server-side. Do not collect unnecessary personal information from reporters. Do not commit `.env` files or real credentials anywhere, including handoff ZIPs.

## Reliability

- Every AI-dependent feature must have a safe failure path (AI failure must never crash the app).
- Persist AI output so page refreshes don't trigger repeated generation.
- Handle AI and vector-search failures gracefully with clear UI fallback states.

## Safety / Responsible AI

RescueMesh is a decision-support prototype. It is **NOT**:
- An autonomous rescue-dispatch system
- A replacement for emergency services
- A medical diagnostic system

Rules:
- Never claim a rescue has been dispatched.
- Never provide medical diagnosis or treatment instructions.
- Always show confidence and evidence for AI-generated recommendations.
- When evidence is insufficient, explicitly communicate uncertainty.
- Never fabricate a source or citation.
- Humans remain responsible for all emergency decisions.

## Module Discipline

- Implement only the module you were assigned.
- Update `CURRENT_STATE.md` at the end of your module.
- Produce a `HANDOFF_MXX.md` file at the end of your module.
- Return only new/modified files in your output ZIP — never `node_modules/`, `.next/`, `.git/`, or real `.env` files.

## Priority Rule (Hard Rule)

Never sacrifice a working P0 capability to add a P1, P2, or P3 feature. If time runs short, stop at the latest completed checkpoint — that version must remain submittable.
