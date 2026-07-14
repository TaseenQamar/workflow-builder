# Free production (no paid Render)

Render free deploy card/pay maangta hai — **bina paise** yeh tareeqa use karo:

## Architecture (free)

```
Vercel (frontend)  →  Free Tunnel  →  Aapka Mac (NestJS :3000 + Postgres)
```

## Steps

### 1) Mac pe backend + Postgres chalu rakho

```bash
brew services start postgresql@16
brew services start redis
cd workflow-build-backend
npm run start:dev
```

Check: http://localhost:3000/health

### 2) Free public URL (tunnel)

Naya terminal:

```bash
cd workflow-build-backend
npx localtunnel --port 3000 --subdomain workflow-builder-taseen
```

URL milegi: `https://workflow-builder-taseen.loca.lt`

### 3) Vercel site → Settings

**Backend API URL** = `https://workflow-builder-taseen.loca.lt`  
→ **Save & Connect** → Online hona chahiye

Ya:

```
https://YOUR-VERCEL-APP.vercel.app/?api=https://workflow-builder-taseen.loca.lt
```

## Important

- Mac **on** aur backend **running** hona chahiye — band kiya to site Offline
- Ye demo / testing ke liye best free option hai
- Full 24/7 free hosting rare hai (paid card aksar chahiye)

## `.env` CORS

```
CORS_ORIGIN=*
```
