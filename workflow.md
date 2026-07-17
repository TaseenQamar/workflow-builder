# Cluster Valley AI — Complete Flow Guide (English)

This document explains how the **Angular frontend** and **NestJS backend** work together as an n8n-style workflow automation product.

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Projects & URLs](#2-projects--urls)
3. [Frontend Pages](#3-frontend-pages)
4. [Workflow Editor](#4-workflow-editor)
5. [Standard Tools Agent Flow](#5-standard-tools-agent-flow)
6. [Chat Behavior](#6-chat-behavior)
7. [Google Sheets](#7-google-sheets)
8. [Outbound Email](#8-outbound-email)
9. [Slack](#9-slack)
10. [Settings](#10-settings)
11. [Backend API (overview)](#11-backend-api-overview)
12. [Execution Engine](#12-execution-engine)
13. [How to Run](#13-how-to-run)
14. [Complete User Journey](#14-complete-user-journey)
15. [File Map](#15-file-map)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. High-Level Architecture

```
User (Browser)
    → Angular frontend (canvas, chat, settings)
        → /api/* → NestJS backend (:3000)
            → PostgreSQL (workflows, executions, memory)
            → LLM providers (Groq / OpenAI / Gemini / …)
            → Google Sheets API
            → SendGrid / SMTP (email)
            → Slack API (chat.postMessage)
```

| Layer | Responsibility |
|-------|----------------|
| **Frontend** | Design workflows, chat UI, call APIs |
| **Backend** | Save workflows, execute nodes, call integrations |

---

## 2. Projects & URLs

| Project | Path | URL |
|---------|------|-----|
| Frontend (Angular) | `workflow-builder` | http://localhost:4206 |
| Backend (NestJS) | `workflow-build-backend` | http://localhost:3000 |
| Swagger | — | http://localhost:3000/api/docs |
| Production UI (example) | Vercel | `?api=` + Cloudflare tunnel URL |

For production demos: Mac runs backend + `npm run wake` (Cloudflare tunnel). Frontend uses `?api=https://….trycloudflare.com`.

---

## 3. Frontend Pages

| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/dashboard` | Stats, backend online status |
| Workflow Editor | `/workflow-editor` | Canvas, chat, run |
| Node Library | `/node-library` | Catalog |
| Executions | `/executions` | Run history |
| Settings | `/settings` | Backend URL, AI provider, Email, Slack |

---

## 4. Workflow Editor

```
┌────────────┬─────────────────────────┬─────────────────┐
│  Palette   │        Canvas           │  Properties     │
│  (left)    │  Chat → AI Agent        │  (right)        │
│            │  Model / Memory / Tools │  node settings  │
├────────────┴─────────────────────────┴─────────────────┤
│              Chat panel (bottom)                         │
└──────────────────────────────────────────────────────────┘
```

### Wire types

| Kind | Look | Meaning |
|------|------|---------|
| **flow** | Solid | Execution order (Chat → Agent) |
| **config** | Dashed | Attach Chat Model, Memory, or Tools to Agent |

Tools (Google Sheets, Email, Slack) attach to the Agent **Tool** port — they are not in the main linear chain. The agent decides when to call them.

---

## 5. Standard Tools Agent Flow

Typical production flow:

```
Chat Message Received  ──flow──►  AI Agent (Tools Agent)
                                      ▲
                    config (dashed)   │
          ┌───────────────────────────┼───────────────────┐
          │                           │                   │
   Groq Chat Model          Window Buffer Memory     Tools:
                                                     • Google Sheets
                                                     • Send Email
                                                     • Slack
```

### What happens on chat send

1. Frontend builds workflow JSON from the canvas.
2. `POST /api/workflows/execute` with `{ message, sessionId, workflowName, … }`.
3. Engine runs: Chat trigger → AI Agent.
4. Agent receives:
   - Product guide (Cluster Valley)
   - **Live workflow snapshot** (nodes, wires, sheet tab, email To, Slack channel)
   - Chat history (if Memory is attached)
5. Agent either replies only, or calls tools (`google_sheets`, `send_email`, `send_slack`).
6. After a successful sheet **write**, Email and/or Slack may auto-notify if those tools are attached.
7. Chat shows the assistant reply + tool status lines.

---

## 6. Chat Behavior

| User says | Agent should |
|-----------|----------------|
| `hi` / thanks / small talk | Reply only — **no tools** |
| How does this flow work? / guide questions | Explain from product guide + live canvas — **no tools** |
| Add / update / delete sheet row | Call `google_sheets` (then auto email/slack if attached) |
| Send email / Slack | Call the matching tool |
| `Slack pe bhejo: Hello team` | Post that text to Slack (if Message box is empty/auto) |

### Language

**Default is English.** Reply in English unless the user clearly writes in another language (Urdu, Roman Urdu, Hindi, etc.) — then match that language. Short greetings like `hi` / `hello` stay in English.

### Slack message priority

1. Fixed text in the Slack node **Message** box (if set)
2. Else clear text from chat (`Slack: …` or quotes)
3. Else auto sheet/email summary body

### Email message

- Platform From address: Settings → Outbound Email (SendGrid verified sender)
- Node only needs **To**
- Body can use `{{emailNotifyBody}}` (includes sheet name + open link)

---

## 7. Google Sheets

Configured **per workflow** on the Google Sheets node (right panel) — **not** in Settings.

1. Paste Service Account JSON → Save credential  
2. Share the Google Sheet with that service-account email as **Editor**  
3. Set Document URL/ID + Tab name  
4. Attach node to Agent **Tool** port  

Different workflows can use different spreadsheets.

---

## 8. Outbound Email

**Settings → Outbound Email** (one platform mailer for the whole app):

- SendGrid (recommended) or SMTP  
- From email must be verified in SendGrid (Single Sender)  
- Workflow Email node: set **To** only  

After sheet updates, email can include spreadsheet title + link.

---

## 9. Slack

**Settings → Slack**:

1. Create app at [api.slack.com/apps](https://api.slack.com/apps)  
2. Bot scopes: `chat:write` + `files:write` (for AI images)  
3. Install → copy Bot User OAuth Token (`xoxb-…`)  
4. Paste in Settings → **Save Slack** → **Send test**  
5. Invite bot to the channel: `/invite @YourBot`  

**Slack node** (right panel): channel + optional Message + optional **AI image** (generateImage + imagePrompt). Token is never on the node. **Groq cannot generate images** — OpenAI is used if quota exists, otherwise free Pollinations. Chat example: `Generate image of a sunset and post to Slack`.

Daily notifications: use **Schedule → Slack** (or Schedule → Agent → tools), save the workflow so the scheduler can run it.

### Schedule node structure

```
Schedule (trigger) ──flow──► Slack
                     or
Schedule (trigger) ──flow──► Google Sheets (read_next_daily) ──flow──► Slack
                     or
Schedule (trigger) ──flow──► AI Agent
                                ├─ Chat Model
                                └─ Tools (Sheets / Email / Slack)
```

**Daily Sheet → Slack (two options):**

1. **Direct:** `Schedule → Sheets → Slack` (no Agent)  
2. **Agent + Prompt (recommended if you want prompt control):**  
   `Schedule → AI Agent` with Sheets + Slack on **Tool** ports.  
   Edit **Schedule Prompt** on the Agent right panel — that prompt runs at cron time (no chat).

Sheet columns: `Message` | `ImagePrompt` (optional).

In the editor: select empty canvas Properties → **Schedule → Slack** / **Schedule → AI Agent**, or drop a Schedule node and use **Quick structure** buttons.

Settings on Schedule: Interval (daily / hourly / every minute), hour, minute, timezone, **Workflow Active**. Cron syncs automatically.

**Important — no chat needed:** After **Save**, the backend cron runs the flow at that time by itself (Slack / Email / tools). Use **Run now (no chat)** to test immediately. Chat prompt is not required for Schedule flows.

---

## 10. Settings

| Section | Purpose |
|---------|---------|
| Backend API URL | Local or tunnel URL |
| AI provider | Groq / OpenAI / Gemini / … |
| Outbound Email | Platform SendGrid/SMTP |
| Slack | Platform bot token + default channel |

Google Sheets credentials stay on the **Sheets node**, not in Settings.

---

## 11. Backend API (overview)

| Area | Examples |
|------|----------|
| Workflows | `POST /api/workflows/execute`, CRUD |
| Health | `GET /health` |
| AI | `GET /api/integrations/status/ai`, LLM endpoint save |
| Email | `GET/POST …/email/…` |
| Slack | `GET/POST …/slack/…` |
| Google Sheets | credentials, list sheets, headers |
| Executions | history + stats |
| Schedules | cron for daily runs |

---

## 12. Execution Engine

- Follows **flow** connections for order  
- **config** attachments (model/memory/tools) are resolved by the AI Agent handler  
- Inline chat execute can persist to PostgreSQL when DB is connected  
- Agent knowledge: `src/agent/project-knowledge.ts` + live canvas snapshot every run  

---

## 13. How to Run

### Backend

```bash
cd workflow-build-backend
brew services start postgresql@16   # if needed
brew services start redis           # if needed
npm run start:dev
# optional public URL:
npm run wake
```

### Frontend

```bash
cd workflow-builder
npx ng serve --port 4200
```

### Env (examples)

```env
DATABASE_URL=postgresql://workflow:workflow_password@localhost:5432/workflow_db?schema=public
# Email: use Settings UI or SENDGRID_API_KEY + EMAIL_FROM
# Slack: use Settings UI or SLACK_BOT_TOKEN + SLACK_DEFAULT_CHANNEL
```

---

## 14. Complete User Journey

```
1. Settings → AI provider + (optional) Email + Slack
2. Workflow Editor → Chat → AI Agent + Model + Memory
3. Add Google Sheets / Email / Slack → attach to Agent Tool port
4. Configure Sheets (SA JSON + document + tab) on the node
5. Chat: greetings = talk only; “add row” = sheet (+ notify)
6. Save workflow if you need history / schedules
7. Executions page for past runs
```

---

## 15. File Map

### Frontend (`workflow-builder`)

```
src/app/features/workflow-editor/   # canvas, chat, store
src/app/features/settings/          # AI, Email, Slack
src/app/core/services/api.service.ts
src/app/core/constants/node-definitions.ts
workflow.md                         # this guide
```

### Backend (`workflow-build-backend`)

```
src/node/handlers/ai-agent.handler.ts
src/node/handlers/google-sheets.handler.ts
src/node/handlers/email.handler.ts
src/node/handlers/slack.handler.ts
src/agent/project-knowledge.ts      # chat product guide
src/integration/                    # email/slack/sheets credentials + providers
scripts/wake.sh                     # Postgres/Redis + tunnel
```

---

## 16. Troubleshooting

| Problem | Fix |
|---------|-----|
| Backend offline on Vercel | Restart tunnel (`npm run wake`), open new `?api=` URL; fix Mac DNS (1.1.1.1) if needed |
| Sheets fail | Share sheet with SA email as Editor; set doc + tab on node |
| Email 403 Sender Identity | Verify From in SendGrid Single Sender |
| Slack DEMO | Settings → Slack → Save token |
| Slack `not_in_channel` | `/invite @Bot` in that channel |
| `hi` updates the sheet | Fixed: greetings must not call tools |
| Wrong Slack text | Use Message box fixed text, or chat `Slack: your text` |

---

*Last updated: Cluster Valley AI — Tools Agent + Sheets + Email + Slack + multilingual chat guide*
