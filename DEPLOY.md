# Deploy to production

## GitHub repos

- Frontend: https://github.com/TaseenQamar/workflow-builder
- Backend: https://github.com/TaseenQamar/workflow-build-backend

## 1) Backend (Render — free Postgres + API)

1. Open Render Blueprint:  
   https://dashboard.render.com/select-repo?type=blueprint  
   Select repo **`TaseenQamar/workflow-build-backend`** (has `render.yaml`).
2. Set env vars:
   - `CORS_ORIGIN` = your frontend URL (e.g. `https://your-app.vercel.app`)
   - `OPENAI_API_KEY` or `GEMINI_API_KEY` (optional)
3. Deploy → copy the API URL, e.g. `https://workflow-builder-api.onrender.com`

Health check: `https://YOUR-API.onrender.com/health`

## 2) Frontend (Vercel)

1. https://vercel.com/new  
2. Import **`TaseenQamar/workflow-builder`**
3. Build command: `npm run build`  
   Output directory: `dist/workflow-builder/browser`
4. Before deploy, set production API in:

`src/environments/environment.production.ts`

```ts
apiUrl: 'https://YOUR-API.onrender.com/api',
```

Then commit & push, or set via Vercel env + rebuild.

## Local URLs (not production)

| Service | URL |
|---------|-----|
| Frontend | http://localhost:4200 |
| Backend | http://localhost:3000 |
| Prisma Studio | http://localhost:5555 |
