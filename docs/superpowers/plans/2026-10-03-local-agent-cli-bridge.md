# Local Code Agent & Subscription CLI Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable Arunaki to connect directly to locally installed and authenticated AI Code Agents (such as Claude Code CLI with Claude Pro, Gemini CLI with Google AI Pro, and local gateways like 9Router) so users can harness their existing monthly flat subscriptions without paying per-token API bills.

**Architecture:**
1. **Industry-Standard Hybrid Pattern (Gateway + Process Runner):**
   - **Mode A (Zero-Config Gateway - 9Router / LiteLLM):** Connect via local OpenAI-compatible loopback daemon (`http://localhost:20128/v1` or `http://localhost:8080/v1`) using existing 9Router/OpenAI-compatible adapters.
   - **Mode B (Native CLI Runner - Claude Code & Gemini):** Auto-detect installed CLI binaries (`claude`, `gemini`), inspect login status (`claude auth status` / cache check), and execute headless JSON streaming subprocesses.
2. **Provider Catalog Registration:** Register a dedicated `local-agent` provider type in `@arunaki/engine` catalog that wraps the local CLI execution while enforcing Arunaki's strict project folder isolation and document sandbox boundaries.
3. **One-Click Web Settings UI:** Add a specialized "Local Code Agent" card in `apps/web` Settings that displays real-time connection status (`Connected (Claude Pro)`, `Not Logged In`, or `Not Installed`), eliminating manual API key entry.

**Tech Stack:** TypeScript, Effect-TS, Node.js `child_process` / `cross-spawn`, React 19, Tailwind/CSS variables, Vitest.

## Global Constraints
- **Document Boundary Rule (CRITICAL):** The local agent runner MUST enforce Arunaki's project folder isolation (`Session.location.directory`). The agent is only permitted to read and modify documents in the active project directory, never the whole filesystem.
- **Minimal Typing Rule:** The user should not have to manually configure paths or base URLs if standard defaults exist.
- **Strict React Rules of Hooks:** In `apps/web`, all hooks must remain at the top level with zero conditional invocations.
- **Clean English UI:** Badges and telemetry must use standard concise English (`Connected`, `Checking...`, `Ready`).

---

### Task 1: Local Agent CLI Detection & Status Service

**Files:**
- Create: `packages/engine/core/src/local-agent/detector.ts`
- Create: `packages/engine/core/src/local-agent/detector.test.ts`
- Modify: `packages/engine/core/src/local-agent.ts`

**Interfaces:**
- Consumes: Node.js `exec` / `which` / `where` via `cross-spawn`
- Produces: `detectLocalAgent(agentType: "claude-code" | "gemini-cli" | "9router"): Effect.Effect<LocalAgentStatus>`

```ts
export interface LocalAgentStatus {
  readonly installed: boolean;
  readonly authenticated: boolean;
  readonly binaryPath?: string;
  readonly version?: string;
  readonly accountEmail?: string;
  readonly tier?: string; // e.g. "Claude Pro", "Google AI Pro"
  readonly error?: string;
}
```

- [ ] **Step 1: Write the failing unit test**

Create `packages/engine/core/src/local-agent/detector.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseClaudeAuthStatus, parse9RouterStatus } from "./detector";

describe("Local Agent Detector", () => {
  it("correctly identifies active Claude Pro session from CLI status output", () => {
    const mockOutput = "Logged in as developer@company.com (Claude Pro)\nVersion: 1.0.12";
    const status = parseClaudeAuthStatus(mockOutput);
    expect(status.installed).toBe(true);
    expect(status.authenticated).toBe(true);
    expect(status.accountEmail).toBe("developer@company.com");
    expect(status.tier).toBe("Claude Pro");
  });

  it("handles unauthenticated state gracefully", () => {
    const mockOutput = "Not logged in. Run 'claude login' to get started.";
    const status = parseClaudeAuthStatus(mockOutput);
    expect(status.installed).toBe(true);
    expect(status.authenticated).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to confirm failure**
```bash
npx vitest run packages/engine/core/src/local-agent/detector.test.ts
```

- [ ] **Step 3: Implement `detector.ts`**
Implement binary lookup (`where.exe claude` on Windows, `which claude` on POSIX) and output parsing.

- [ ] **Step 4: Re-run tests and verify pass**
```bash
npx vitest run packages/engine/core/src/local-agent/detector.test.ts
```

---

### Task 2: Headless CLI Process Runner & Stream Parser

**Files:**
- Create: `packages/engine/core/src/local-agent/runner.ts`
- Create: `packages/engine/core/src/local-agent/runner.test.ts`
- Modify: `packages/engine/core/src/plugin/provider/local-agent.ts`

**Interfaces:**
- Consumes: `LocalAgentRequest` (prompt, system prompt, active directory)
- Produces: `Stream<Chunk, Error>` emitting tokens and structured tool calls in Arunaki's standard LLM schema format.

- [ ] **Step 1: Write unit test for headless stream parsing**
Create test ensuring JSON chunks or streaming text from `claude --output-format json` or PTY are parsed without dropping tokens.

- [ ] **Step 2: Implement `runner.ts`**
Implement the child process spawner with:
1. `cwd` locked strictly to `activeDirectory`.
2. Windows argument escaping for PowerShell / cmd.
3. Timeout and abort signal handling on cancellation.

- [ ] **Step 3: Run test to verify**
```bash
npx vitest run packages/engine/core/src/local-agent/runner.test.ts
```

---

### Task 3: Backend HTTP API Endpoint for Agent Status

**Files:**
- Modify: `packages/engine/server/src/handlers/provider.ts`
- Modify: `packages/engine/protocol/src/groups/provider.ts`

**Interfaces:**
- Endpoint: `GET /api/providers/local-agent/status`
- Response: List of available local agents (`claude-code`, `gemini-cli`, `9router`) with live installation and login status.

- [ ] **Step 1: Add route definition to protocol**
- [ ] **Step 2: Implement handler calling `detector.ts`**
- [ ] **Step 3: Test endpoint via unit/integration test**

---

### Task 4: Frontend UI in ModelProviderSettings

**Files:**
- Modify: `apps/web/src/components/settings/constants.ts`
- Modify: `apps/web/src/components/settings/ModelProviderSettings.tsx`
- Create: `apps/web/src/components/settings/LocalAgentCard.tsx`

**Features:**
1. Display a prominent **"Local Subscription / Code Agent"** section.
2. One-click check button: `Scan Local Agents`.
3. Auto-detected pills:
   - `Claude Code (Claude Pro) - Ready`
   - `9Router Local Gateway (localhost:20128) - Ready`
4. Clicking "Use as Active Model" immediately switches Arunaki's active provider to the detected agent without asking for an API key.

- [ ] **Step 1: Add `LocalAgentCard.tsx` with clean Antigravity-style badge telemetry**
- [ ] **Step 2: Connect to `GET /api/providers/local-agent/status`**
- [ ] **Step 3: Run frontend build verification**
```bash
npm run build -w apps/web
```

---

### Task 5: End-to-End Document Isolation Verification

- [ ] **Step 1: Test with a real task** (e.g., `"Rekap 3 baris ke summary.xlsx"`).
- [ ] **Step 2: Verify zero file access outside active folder.**
- [ ] **Step 3: Verify token cost shows $0.00 / Local Subscription.**
