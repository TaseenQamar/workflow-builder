# n8n Automation Setup

Yeh guide aapke **workflow-builder** Angular app ko **n8n** se connect karne ke liye hai.

## Architecture

```
Angular UI (localhost:4200)
    │
    ├── Dashboard  →  Webhook trigger  →  n8n workflows
    ├── Executions →  n8n REST API       →  execution history
    └── Settings   →  n8n health check
                          │
                    n8n (localhost:5678)
                          │
              3 pre-built workflows
```

## Quick Start (3 steps)

### Step 1: n8n start karein

**Option A — npm (Docker ke bina):**
```bash
npm run n8n
```

**Option B — Docker (recommended for production):**
```bash
npm run n8n:docker
```

n8n UI: [http://localhost:5678](http://localhost:5678)

Pehli baar account banaein (email + password).

### Step 2: Workflows import karein

n8n UI mein **Settings → API** se API key banayein, phir:

```bash
N8N_API_KEY=your-api-key npm run n8n:import
```

Yeh 3 workflows import aur activate karega:

| Workflow | Webhook Path | Use Case |
|----------|-------------|----------|
| Customer Support - Ticket Router | `/webhook/support-ticket` | Ticket → AI Categorize → Department → Slack |
| E-commerce - Order Pipeline | `/webhook/new-order` | Order → Inventory → Invoice → Email |
| AI Content - Blog Pipeline | `/webhook/content-topic` | Topic → Generate → SEO → Approve → Publish |

### Step 3: Angular app chalayein

```bash
npm start
```

Dashboard pe **Run** button se workflows trigger karein.

---

## Pre-built Workflows

Workflow JSON files: `n8n/workflows/`

1. **Customer Support** — `customer-support.json`
2. **E-commerce** — `ecommerce-order.json`
3. **AI Content** — `ai-content-pipeline.json`

Abhi Code nodes use ho rahe hain (Slack/OpenAI credentials ke bina demo ke liye). Production mein in nodes ko real Slack, OpenAI, SendGrid nodes se replace karein.

---

## API Configuration

Development mein proxy use hota hai (`proxy.conf.json`):

| Angular Path | n8n Target |
|-------------|------------|
| `/n8n-api/*` | `http://localhost:5678/api/v1/*` |
| `/n8n-webhook/*` | `http://localhost:5678/webhook/*` |

API key set karna ho to `src/environments/environment.ts` mein:

```typescript
n8nApiKey: 'your-n8n-api-key',
```

---

## Manual Webhook Test (curl)

```bash
# Customer Support
curl -X POST http://localhost:5678/webhook/support-ticket \
  -H "Content-Type: application/json" \
  -d '{"subject":"Payment issue","body":"I need a refund"}'

# E-commerce
curl -X POST http://localhost:5678/webhook/new-order \
  -H "Content-Type: application/json" \
  -d '{"orderId":"ORD-1","email":"test@example.com","total":99}'

# AI Content
curl -X POST http://localhost:5678/webhook/content-topic \
  -H "Content-Type: application/json" \
  -d '{"topic":"n8n Automation Guide"}'
```

---

## Next Steps (NestJS Backend)

Jab backend add karein:

```
NestJS/
├── workflow/      → workflow CRUD
├── execution/     → run history
├── node/          → node definitions
├── trigger/       → webhook handlers
├── integration/   → Slack, OpenAI, etc.
└── scheduler/     → cron jobs (BullMQ)
```

NestJS n8n ke saath sync kar sakta hai — workflows n8n mein execute, metadata PostgreSQL mein store.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Dashboard "n8n Offline" | `npm run n8n` chalayein |
| Webhook 404 | `npm run n8n:import` se workflows import karein |
| CORS error | Dev server proxy use karein (`npm start`, not `ng serve --no-proxy`) |
| Import fails | n8n API key set karein: `N8N_API_KEY=... npm run n8n:import` |
