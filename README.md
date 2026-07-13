# Workflow Builder

A visual automation tool for building workflows without code — similar to n8n, Zapier, and AI workflow automation platforms.

## Tech Stack

- **Angular 22** — Signals, standalone components, lazy-loaded routes
- **Tailwind CSS 4** — Utility-first styling
- **Angular CDK** — UI primitives for drag-and-drop canvas (ready to integrate)
- **RxJS** — Reactive data flows

## Requirements

- Node.js **v22.22.3+** (see `.nvmrc`)

```bash
nvm use
```

## Getting Started

```bash
npm install
npm start
```

Open [http://localhost:4200](http://localhost:4200).

## Project Structure

```
src/app/
├── layout/
│   └── shell/              # App shell with sidebar navigation
├── features/
│   ├── dashboard/          # Overview & metrics
│   ├── workflow-editor/    # Visual workflow canvas
│   ├── node-library/       # Triggers, actions, AI nodes
│   ├── executions/         # Run history & logs
│   └── settings/           # Integrations & preferences
├── app.routes.ts
└── app.ts
```

## Example Workflows

**Customer Support:** New Ticket → AI Categorize → Assign Department → Notify Slack

**E-commerce:** New Order → Check Inventory → Generate Invoice → Send Email

**AI Content:** Topic → AI Generate Blog → SEO Check → Approve → Publish

## n8n Integration

Automation n8n ke through chalti hai. Setup guide: **[N8N_SETUP.md](./N8N_SETUP.md)**

```bash
# Terminal 1 — n8n engine
npm run n8n

# Terminal 2 — import workflows (after creating API key in n8n)
N8N_API_KEY=your-key npm run n8n:import

# Terminal 3 — Angular UI
npm start
```

## Scripts

| Command           | Description                    |
|-------------------|--------------------------------|
| `npm start`       | Dev server (with n8n proxy)    |
| `npm run build`   | Production build               |
| `npm test`        | Unit tests                     |
| `npm run n8n`     | Start n8n locally              |
| `npm run n8n:import` | Import workflows to n8n     |
| `npm run n8n:docker` | n8n + PostgreSQL via Docker |
