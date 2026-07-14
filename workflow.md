# Workflow Builder — Complete Flow Guide

Yeh document explain karta hai ke **Angular frontend** aur **NestJS backend** milkar n8n-style workflow automation kaise chalate hain.

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Projects & URLs](#2-projects--urls)
3. [Frontend Pages](#3-frontend-pages)
4. [Workflow Editor (Core UI)](#4-workflow-editor-core-ui)
5. [Chat Flow — Step by Step](#5-chat-flow--step-by-step)
6. [Workflow JSON Format](#6-workflow-json-format)
7. [Backend API Endpoints](#7-backend-api-endpoints)
8. [Execution Engine](#8-execution-engine)
9. [Node Types & Handlers](#9-node-types--handlers)
10. [Settings — API Keys & Provider](#10-settings--api-keys--provider)
11. [Database (PostgreSQL)](#11-database-postgresql)
12. [Frontend vs Backend Split](#12-frontend-vs-backend-split)
13. [Proxy & How to Run](#13-proxy--how-to-run)
14. [Complete User Journey](#14-complete-user-journey)
15. [File Map](#15-file-map)

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER (Browser)                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  ANGULAR FRONTEND  (localhost:4206)                             │
│  • UI / Canvas / Chat / Settings                                │
│  • Workflow JSON banata hai (nodes + connections)               │
│  • API calls bhejta hai                                         │
└────────────────────────────┬────────────────────────────────────┘
                             │  /api/*  → proxy → :3000
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  NESTJS BACKEND  (localhost:3000)                               │
│  • Workflows save/load (PostgreSQL — optional)                  │
│  • Execution Engine — nodes ek ek karke chalata hai             │
│  • API keys store (file / DB / .env)                            │
│  • OpenAI / Gemini / Email / Slack calls                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
         PostgreSQL    OpenAI/Gemini    Slack/Email
         (optional)    APIs              (optional)
```

**Frontend ka kaam:** Design, display, API call  
**Backend ka kaam:** Save, execute, integrations, real AI/API calls

---

## 2. Projects & URLs

| Project | Path | URL |
|---------|------|-----|
| Frontend (Angular 22) | `workflow-builder` | http://localhost:4206 |
| Backend (NestJS 11) | `workflow-build-backend` | http://localhost:3000 |
| API Docs (Swagger) | — | http://localhost:3000/api/docs |
| n8n (optional) | — | http://localhost:5678 |

Frontend `environment.ts` mein `apiUrl: '/api'` hai — requests proxy se backend par jati hain.

---

## 3. Frontend Pages

| Page | Route | Frontend Kya Karta Hai | Backend Se Kya Leta Hai |
|------|-------|------------------------|-------------------------|
| **Dashboard** | `/dashboard` | Stats, backend/n8n status | `GET /api/executions/stats`, health |
| **Workflow Editor** | `/workflow-editor` | Nodes, wires, chat, run | `POST /api/workflows/execute`, save/load |
| **Node Library** | `/node-library` | Node catalog (read-only) | Kuch nahi — static list |
| **Executions** | `/executions` | Run history | `GET /api/executions` |
| **Settings** | `/settings` | Keys, OpenAI/Gemini select | `POST /api/integrations/keys`, `POST /api/integrations/ai-provider` |

Sidebar **Shell** component sab pages wrap karta hai (`app.routes.ts`).

---

## 4. Workflow Editor (Core UI)

Sab se important page. 4 main hisse:

```
┌──────────────┬────────────────────────────┬──────────────────┐
│ Node Palette │      Workflow Canvas       │ Properties Panel │
│   (left)     │        (center)            │     (right)      │
│              │                            │                  │
│ Triggers     │  [Chat] ──→ [AI Agent]     │ Node settings    │
│ Actions      │      ↓                     │ Chat prompt      │
│ AI nodes     │  [Model] [Memory]          │ (chat node par)  │
├──────────────┴────────────────────────────┴──────────────────┤
│         Chat Panel (bottom) — prompt + Chat button            │
└──────────────────────────────────────────────────────────────┘
```

### 4.1 Node Palette (Left)

- **Frontend only** — `src/app/core/constants/node-definitions.ts`
- User drag karke canvas par drop karta hai
- Types: `chat_trigger`, `webhook`, `schedule`, `ai_agent`, `http`, `email`, `slack`, `condition`, etc.

### 4.2 Workflow Canvas (Center)

- **Frontend only** — visual editor
- Nodes position, wires (connections), ports
- **Flow wires** (solid lines): left → right execution order
- **Config wires** (dashed purple): Chat Model / Memory / Tool → AI Agent ke neeche wale ports
- State: `WorkflowEditorStore` → `nodes[]` + `connections[]`

### 4.3 Properties Panel (Right)

- Selected node ki settings
- **Chat node** select → prompt textarea + **▶ Run Workflow**
- **AI Agent** → instructions, attach model + memory
- **Chat Model** → provider (`openai` / `gemini`), model name

### 4.4 Chat Panel (Bottom)

- User prompt likhta hai
- **Chat** button → workflow run
- Jawab chat bubbles mein dikhta hai

### 4.5 WorkflowEditorStore (Frontend State)

| Signal / Method | Kaam |
|-----------------|------|
| `nodes` | Canvas par saare nodes |
| `connections` | Wires between nodes |
| `chatInput` | User ka message |
| `chatMessages` | Chat history (UI) |
| `defaultAiProvider` | `openai` ya `gemini` |
| `workflowId` | Saved workflow ID |
| `toApiDefinition()` | Backend-friendly JSON (UI fields strip) |
| `ensureChatWorkflow()` | Template + connections ready karna |
| `validateWorkflowForRun()` | Trigger, agent, wires check |
| `attachAgentDefaults()` | Model + Memory auto attach |

### 4.6 WorkflowChatService

- `run()` — Chat button logic
- `POST /api/workflows/execute` call karta hai
- Response se `aiResponse` nikal kar `chatMessages` mein add karta hai

---

## 5. Chat Flow — Step by Step

Jab user **Chat** dabata hai:

```
User: Prompt likho + Chat
        ↓
Frontend: ensureChatWorkflow() + validateWorkflowForRun()
        ↓
Frontend: POST /api/workflows/execute
          { definition: JSON, triggerData: { message, body, name } }
        ↓
Backend: Execution Engine start
        ↓
Node 1: chat_trigger  → message pass
Node 2: ai_agent      → OpenAI/Gemini API (attached model se provider)
        ↓
Backend: { status: SUCCESS, output: { aiResponse: "..." } }
        ↓
Frontend: Chat bubble mein jawab dikhao
```

**Important:** Chat ke liye workflow **save ki zaroorat nahi** — `execute` direct JSON se chalta hai.

### Prompt kahan likhein?

1. **Bottom Chat Panel** — hamesha visible
2. **Properties Panel** — jab Chat node select ho
3. **Canvas popup** — Chat node select → node ke right side box

---

## 6. Workflow JSON Format

Frontend `toApiDefinition()` yeh structure bhejta hai:

```json
{
  "definition": {
    "nodes": [
      {
        "id": "uuid-1",
        "type": "chat_trigger",
        "label": "Chat Message Received",
        "position": { "x": 80, "y": 200 },
        "data": { "channel": "web" }
      },
      {
        "id": "uuid-2",
        "type": "ai_agent",
        "label": "AI Agent",
        "position": { "x": 300, "y": 180 },
        "data": {
          "instructions": "You are helpful. Answer: {{message}}",
          "outputKey": "aiResponse"
        }
      },
      {
        "id": "uuid-3",
        "type": "chat_model",
        "label": "Gemini Chat Model",
        "position": { "x": 340, "y": 340 },
        "data": { "provider": "gemini", "model": "gemini-2.0-flash" }
      },
      {
        "id": "uuid-4",
        "type": "memory",
        "label": "Window Buffer Memory",
        "position": { "x": 440, "y": 340 },
        "data": { "memoryType": "window_buffer", "windowSize": 10 }
      }
    ],
    "connections": [
      { "from": "uuid-1", "to": "uuid-2", "output": "main", "kind": "flow" },
      { "from": "uuid-3", "to": "uuid-2", "kind": "config", "targetPort": "chatModel" },
      { "from": "uuid-4", "to": "uuid-2", "kind": "config", "targetPort": "memory" }
    ]
  },
  "triggerData": {
    "message": "Mujhe refund chahiye",
    "body": "Mujhe refund chahiye",
    "name": "User",
    "sessionId": "chat-session"
  }
}
```

### Connection types

| `kind` | Matlab |
|--------|--------|
| `flow` (default) | Execution order — pehle → baad |
| `config` | AI Agent ko model/memory/tool attach — execution skip |

### Template variables

Prompts mein `{{message}}`, `{{body}}`, `{{name}}`, `{{aiResponse}}` use ho sakte hain — backend `interpolate.ts` se replace karta hai.

---

## 7. Backend API Endpoints

### Workflows

| Method | Endpoint | Kaam |
|--------|----------|------|
| GET | `/api/workflows` | List workflows |
| GET | `/api/workflows/:id` | Single workflow |
| POST | `/api/workflows` | Create (DB required) |
| PUT | `/api/workflows/:id` | Update |
| DELETE | `/api/workflows/:id` | Delete |
| POST | `/api/workflows/execute` | **Run without save** (Chat) |
| POST | `/api/workflows/:id/run` | Run saved workflow |
| POST | `/api/workflows/:id/sync-n8n` | Sync to n8n (optional) |

### Executions

| Method | Endpoint | Kaam |
|--------|----------|------|
| GET | `/api/executions` | History list |
| GET | `/api/executions/stats` | Dashboard stats |
| GET | `/api/executions/:id` | Detail + node logs |

### Integrations

| Method | Endpoint | Kaam |
|--------|----------|------|
| GET | `/api/integrations/status/ai` | Key status + default provider |
| POST | `/api/integrations/keys` | Save OpenAI/Gemini key |
| POST | `/api/integrations/ai-provider` | Set `openai` or `gemini` |

### Other

| Method | Endpoint | Kaam |
|--------|----------|------|
| GET | `/health` | Backend alive check |
| GET | `/api/n8n/health` | n8n online (optional) |
| GET | `/api/nodes/types` | Node type metadata |

---

## 8. Execution Engine

Location: `workflow-build-backend/src/node/engine/execution-engine.service.ts`

```
Start
  ↓
Find trigger node (chat_trigger | webhook | schedule)
  ↓
Loop while current node exists:
  • Config nodes (chat_model, memory, tool) → skip in flow
  • Get handler for node.type
  • handler.execute(node, context)
  • Merge output into context.data
  • Find next node via connections (or auto-chain left→right)
  ↓
Return final output
```

- Har node **pehle wale ke complete hone ke baad** chalta hai
- **Condition** node `true` / `false` branches support karta hai
- DB connected ho to `nodeExecutionLog` save hota hai — warna bina DB bhi chalta hai

---

## 9. Node Types & Handlers

Backend handlers: `workflow-build-backend/src/node/handlers/`

| Node Type | Category | Backend Kya Karta Hai |
|-----------|----------|------------------------|
| `chat_trigger` | Trigger | `triggerData.message` pass |
| `webhook` | Trigger | HTTP trigger data pass |
| `schedule` | Trigger | Cron trigger (scheduler) |
| `ai_agent` | AI | Model + memory read → OpenAI/Gemini call |
| `chat_model` | Config | Provider/model config (flow skip) |
| `memory` | Config | Conversation window (flow skip) |
| `tool` | Config | Agent tools list (flow skip) |
| `ai` | AI | Simple prompt → OpenAI/Gemini |
| `http` | Action | REST API call |
| `email` | Action | Send email |
| `slack` | Action | Post Slack message |
| `spreadsheet` | Action | Add/read rows |
| `condition` | Logic | if/else branch |
| `delay` | Logic | Wait N seconds |
| `code` | Logic | Custom JS snippet |
| `n8n` | Integration | Delegate to n8n webhook |

### Default Chat Template

Naya editor khulte hi (bina saved ID):

```
Chat Message Received → AI Agent
                          ↑ (config)
                    Chat Model + Memory
```

---

## 10. Settings — API Keys & Provider

### Default AI Provider

Settings top par do cards:

- **OpenAI** — `gpt-4o-mini`
- **Google Gemini** — `gemini-2.0-flash`

Jo **Active** ho, workflow ka `chat_model` node usi provider par set hota hai.

### API Key Storage (Backend priority)

1. `.env` — `OPENAI_API_KEY`, `GEMINI_API_KEY`
2. Local file — `workflow-build-backend/data/integration-keys.json`
3. PostgreSQL `Integration` table (agar DB connected)

### Default Provider Storage

- `workflow-build-backend/data/ai-preferences.json`
- Frontend backup: `localStorage` key `wb-default-ai-provider`

### Settings flow

```
User Gemini select → POST /api/integrations/ai-provider
User Gemini key save → POST /api/integrations/keys { type: "GEMINI" }
Workflow Editor load → chat_model provider = gemini
Chat run → AI Agent → Gemini API
```

**Note:** Save ke baad password input khali dikhega — key remove nahi hoti. Green badge `sk-••••` / `AIza••••` check karein.

---

## 11. Database (PostgreSQL)

Optional — app bina DB ke start ho sakta hai.

| Table | Kaam |
|-------|------|
| `Workflow` | Name, definition JSON, executionMode |
| `Execution` | Run status, duration, output, error |
| `NodeExecutionLog` | Per-node logs |
| `Integration` | API keys (DB mode) |

| Feature | DB Required? |
|---------|------------|
| Chat (execute inline) | ❌ No |
| Save workflow | ✅ Yes |
| Executions history page | ✅ Yes |
| API keys | ❌ No (local file works) |

Docker (agar available):

```bash
cd workflow-build-backend && npm run docker:up
```

---

## 12. Frontend vs Backend Split

| Cheez | Frontend | Backend |
|-------|----------|---------|
| Drag & drop UI | ✅ | ❌ |
| Workflow JSON design | ✅ | ❌ |
| Nodes execute | ❌ | ✅ |
| OpenAI/Gemini API call | ❌ | ✅ |
| API keys secure storage | Form only | ✅ |
| Chat UI / bubbles | ✅ | ❌ |
| Execution logs | Display | ✅ Save |
| Email / Slack send | ❌ | ✅ |
| Connection validation (basic) | ✅ | Runtime errors |
| n8n health display | ✅ | ✅ HTTP check |

---

## 13. Proxy & How to Run

### proxy.conf.json

```
Browser:  http://localhost:4206/api/workflows/execute
              ↓
Backend:  http://localhost:3000/api/workflows/execute
```

### Terminal 1 — Backend

```bash
cd workflow-build-backend
npm run start:dev
# Wait: API running http://localhost:3000
```

### Terminal 2 — Frontend

```bash
cd workflow-builder
npx ng serve --port 4206
# Proxy automatically from angular.json / proxy.conf.json
```

### Optional — n8n

```bash
cd workflow-builder
npm run n8n
# Chat + LOCAL engine ke liye zaroori NAHI
```

### Optional — API keys in .env

```env
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...
```

---

## 14. Complete User Journey

```
1. Settings
   → Gemini ya OpenAI select
   → API key save (green badge check)

2. Workflow Editor
   → Auto template: Chat → AI Agent + Model + Memory
   → (Optional) Slack / Email node add + wire

3. Prompt
   → Bottom chat panel / Properties / Canvas popup
   → Message likho

4. Chat button
   → Frontend: POST /api/workflows/execute
   → Backend: trigger → agent → (slack/email if connected)
   → Jawab chat mein

5. (Optional) Save
   → Header "Save" → PostgreSQL mein workflow

6. Executions page
   → Past runs dekhna (DB required)
```

---

## 15. File Map

### Frontend (`workflow-builder`)

```
src/app/
├── app.routes.ts                    # Routes
├── layout/shell/                    # Sidebar navigation
├── core/
│   ├── services/api.service.ts      # All HTTP calls
│   ├── constants/node-definitions.ts # Node catalog + ports
│   └── models/workflow.models.ts    # TypeScript types
└── features/
    ├── dashboard/                   # Stats overview
    ├── workflow-editor/
    │   ├── workflow-editor.ts       # Main editor page
    │   ├── workflow-editor.store.ts # Canvas state
    │   ├── workflow-chat.service.ts # Chat run logic
    │   └── components/
    │       ├── workflow-canvas.component.ts
    │       ├── node-palette.component.ts
    │       ├── properties-panel.component.ts
    │       └── chat-panel.component.ts
    ├── executions/                  # Run history
    └── settings/                    # Keys + provider
```

### Backend (`workflow-build-backend`)

```
src/
├── workflow/
│   ├── workflow.controller.ts       # CRUD + execute
│   └── workflow.service.ts
├── execution/
│   ├── execution.service.ts
│   └── execution.controller.ts
├── node/
│   ├── engine/execution-engine.service.ts  # Core runner
│   ├── node.registry.ts
│   └── handlers/                    # Per-node logic
├── integration/
│   ├── integration.service.ts
│   ├── integration.controller.ts
│   ├── local-keys.store.ts
│   └── ai-preferences.store.ts
└── prisma/                          # Optional DB
```

---

## Connection-based execution (n8n style)

Jo wires aap canvas par banate ho, **usi order** mein nodes chalte hain:

```
Chat Message Received  ──flow──►  HTTP Request  ──flow──►  AI Agent
                                                         ▲
                                              config wires (dashed)
                                                         │
                                              Chat Model + Memory
```

- Flow wires (`kind: flow`) = execution path  
- Config wires (`kind: config`) = AI Agent ke liye model/memory (execute skip)  
- Agar flow wires maujood hain to position-based auto-chain **nahi** chalti  
- HTTP response context mein aata hai: `httpData`, `httpStatus` — AI Agent use karta hai  

## PostgreSQL (local Homebrew)

Docker zaroori nahi. Is machine par:

```bash
brew services start postgresql@16
brew services start redis
cd workflow-build-backend && npm run db:setup
```

| Setting | Value |
|---------|-------|
| Host | localhost:5432 |
| DB | `workflow_db` |
| User | `workflow` |
| Password | `workflow_password` |
| URL | `.env` → `DATABASE_URL=...` |

Chat / Run par workflow + execution + node logs **PostgreSQL mein save** hote hain (`persisted: true`).

## Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| API 404 | Backend `:3000` chal raha hai? `ng serve` proxy ke sath? |
| Key save nahi hoti | Backend online? Green badge check karo (input khali normal hai) |
| Chat fail | AI Agent + Model connected? API key Settings mein? |
| n8n Offline | Optional — LOCAL chat ke liye ignore karo |
| Save / DB fail | `brew services start postgresql@16` phir `npm run db:setup` |
| Health `database: disconnected` | Backend restart karo after Postgres start |
| OpenAI quota error | Gemini select karo ya billing check karo |
| Galat node order | Canvas par wires check karo — engine sirf aapki connections follow karta hai |

---

*Last updated: Workflow Builder — Chat + AI Agent + Provider selection flow*
