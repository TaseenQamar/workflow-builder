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

Daily notifications: use **Schedule → Slack / LinkedIn / …** (or Schedule → Agent → tools), save the workflow so the scheduler can run it.

---

## 9b. Schedule — pura workflow (end-to-end)

Schedule **time pe workflow chalaata hai**. Chat zaroori nahi. Canvas pe jo **flow wires** hain, backend **usi order** mein nodes chalata hai. Beech mein HTTP / webhook node **nahi** lagta.

### Do shapes (dono valid)

**A) LLM / Agent (recommended — saari automation LLM se)**

```
Schedule  ──flow──►  AI Agent
                        ├─ config: Chat Model (Groq / OpenAI / …)   ← LLM yahan
                        ├─ config: Memory (optional)
                        └─ tools: Google Sheets + LinkedIn / Slack / …
```

- Schedule time pe Agent ko job deta hai (**Schedule Prompt**)
- **LLM** soch ke tools call karta hai: pehle Sheets, phir social
- ImagePrompt ho to LLM `imagePrompt` pass karta hai → handler image generate + post
- Chat pe bhi same Agent — “sheet se row lo LinkedIn pe image ke sath post karo”

Editor: empty canvas → **LLM automation** → Post to LinkedIn →  
**Build Schedule → Agent → Sheet + LinkedIn**

**B) Direct (no LLM)**

```
Schedule  ──flow──►  Google Sheets  ──flow──►  LinkedIn / Slack
```

- Agent skip — sirf handlers sequential
- Tab use karo jab LLM nahi chahiye

---

### Peeche backend pe kya chalta hai (LLM / Agent flow)

```
1) Workflow SAVE
   → Schedule cron DB mein sync + Workflow Active

2) NestJS cron (har minute)
   → time due? → runWorkflow (_scheduled=true)

3) ExecutionEngine:
   Schedule (pass-through)
        ↓ flow
   AI Agent
        ├─ Chat Model = LLM (Groq / OpenAI / …)
        └─ LLM tools call karta hai:
              google_sheets  →  Google Sheets API
              linkedin / send_slack / …  →  image gen + platform API
        ↓
   Post column → success | failed
   (Agent tools miss kare to auto-invoke sheets→social bhi ho sakta hai)

4) lastRunAt update
```

**Canvas wires (LLM flow):**
- `Schedule ──flow──► AI Agent`
- `Chat Model ──config──► Agent (chatModel)`
- `Sheets ──config──► Agent (tool)`
- `LinkedIn ──config──► Agent (tool)`

Sheets/LinkedIn **Agent se seedha flow wire nahi** — **Tool port** pe. LLM unhe call karta hai.

| Layer | Kaam |
|-------|------|
| Schedule | Clock / trigger |
| Nest cron | Asal alarm |
| **AI Agent + Chat Model** | **LLM brain — tools decide** |
| Sheets / Social (tools) | APIs + Post mark |
| Image gen | Social handler (Pollinations/OpenAI) — Groq text-only |

Webhook alag: `POST /api/webhooks/...`. Schedule us se nahi guzarta.

---

### Editor mein kaise banao (LLM — tumhara case)

1. Empty canvas → Properties → **LLM automation**  
2. Post to: **LinkedIn** (ya Slack / …)  
3. **Build Schedule → Agent → Sheet + LinkedIn**  
4. **Chat Model**: Groq/OpenAI select (Settings / model node)  
5. **Google Sheets** tool: credential + Document URL + `read_next_daily` + Dry Run `false`  
6. **LinkedIn** tool: token + Author URN + Caption/ImagePrompt columns + Dry Run `false`  
7. **AI Agent** → **Schedule Prompt** check/edit (LLM ki daily job)  
8. Schedule: daily time + timezone → Workflow **Active** → **Save**  
9. Test: **Run now** ya chat: *“sheet se next row lo aur LinkedIn pe image ke sath post karo”*  

---

### Sheet columns (daily queue)

| Column | Kaam |
|--------|------|
| **Message** (ya tumhara caption column) | Post caption |
| **ImagePrompt** (optional) | Is se AI image generate → social pe attach |
| **ImageUrl** (optional) | Ready HTTPS image — generate skip |
| **Post** | `success` / `failed` — next run pe `success` wali rows skip |

Flow: pehli row jahan `Post ≠ success` → post → `Post` update → agli schedule pe agli row.

**LinkedIn DUPLICATE_POST:** pehle se same text live ho to ab queue **success** maanti hai taake stuck na rahe. Retest ke liye naya caption / nayi row use karo, ya pehli row pe already `success` likh do.

---

### Schedule settings

| Field | Example |
|-------|---------|
| Interval | `daily` / `hourly` / `every_minute` |
| Hour / Minute | `9` / `0` → subah 9:00 |
| Timezone | `Asia/Karachi` |
| Cron | Auto sync on Save (`0 9 * * *`) |

Manual API (optional): `POST /api/schedules/:workflowId/run-now`

---

### Kab kaunsa flow

| Need | Use |
|------|-----|
| **Saari automation LLM se** (tumhara case) | **A) Agent** — Schedule → Agent → tools |
| Chat + schedule same brain | **A) Agent** |
| Bina LLM, sirf fixed sequence | **B) Direct** Schedule → Sheets → Social |
| Bahar se HTTP trigger | Webhook node |

---

### Checklist (schedule chal nahi raha?)

- [ ] Workflow **Saved** + **Active**  
- [ ] Schedule → Sheets → Social **flow** wires connected  
- [ ] Sheets `read_next_daily`, dryRun `false`  
- [ ] Sheet mein unposted row (`Post` empty / not success)  
- [ ] Social credentials + dryRun `false`  
- [ ] Backend running (Nest watch)  
- [ ] Executions / backend logs: Schedule → Sheets → Social  

---

### Schedule node structure (short)

```
Schedule (trigger) ──flow──► Slack
                     or
Schedule (trigger) ──flow──► Google Sheets (read_next_daily) ──flow──► Slack / LinkedIn / …
                     or
Schedule (trigger) ──flow──► AI Agent
                                ├─ Chat Model
                                └─ Tools (Sheets / Email / Slack / LinkedIn)
```

**Important — no chat needed:** After **Save**, the backend cron runs the flow at that time by itself. Use **Run now (no chat)** to test immediately.

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
