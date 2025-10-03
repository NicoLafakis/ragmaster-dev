# 🚀 Deployment Guide

Complete guide for deploying RAGMaster to production platforms.

---

## 🎯 Recommended Platform: Railway

Railway is the easiest and most reliable option for deploying this full-stack Node.js app.

### Why Railway?

✅ Free tier available  
✅ Automatic PORT assignment  
✅ Built-in build steps  
✅ Environment variable management  
✅ Zero-downtime deploys  
✅ Automatic HTTPS

---

## 🚄 Railway Deployment

### Prerequisites

- Railway account ([Sign up free](https://railway.app/))
- GitHub repository with your code
- OpenAI API key

### Step-by-Step

#### 1. **Prepare Your Repository**

Ensure these files are committed:

```
✅ backend/app.js
✅ frontend/src/App.jsx
✅ frontend/vite.config.js  (with proxy config)
✅ package.json (root)
✅ frontend/package.json
✅ .env.example (optional)
❌ .env (DO NOT COMMIT - contains secrets!)
```

Push to GitHub:

```powershell
git add .
git commit -m "Ready for deployment"
git push origin main
```

#### 2. **Create Railway Project**

1. Go to [railway.app](https://railway.app/)
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose your `ragmaster` repository
5. Railway will auto-detect Node.js

#### 3. **Configure Build & Start**

Railway usually auto-detects, but verify in **Settings → Deploy**:

**Build Command:**

```bash
npm install && npm run frontend:install && npm run build
```

**Start Command:**

```bash
npm start
```

**Root Directory:**

```
/
```

(Leave empty or set to root, NOT `/backend`)

#### 4. **Set Environment Variables**

In Railway dashboard → **Variables** tab:

```
OPENAI_API_KEY=sk-proj-your-actual-key-here
```

**DO NOT SET PORT** - Railway assigns this automatically.

#### 5. **Deploy**

Click **"Deploy"** or push to GitHub (auto-deploys if connected).

Watch the logs for:

```
🚀 RAGMaster - Queue-Based LLM Chunking Server
📍 http://localhost:xxxx
✅ Ready for uploads
```

#### 6. **Get Your URL**

Railway provides a public URL like:

```
https://ragmaster-production.up.railway.app
```

Test it:

```powershell
curl https://your-app.up.railway.app/api/queue
```

---

## 🔧 Troubleshooting Railway

### ❌ Build Fails

**Check logs for:**

```
npm ERR! code ENOENT
```

**Fix:** Ensure `frontend:install` and `frontend:build` scripts exist in root `package.json`.

### ❌ 404 on API Routes

**Symptom:** Frontend loads but `/api/upload` returns 404

**Causes:**

1. Frontend not built → Check build logs
2. Start command wrong → Should be `npm start` (not `cd backend && node app.js`)
3. Static files not serving → Check `frontend/dist` exists after build

**Fix:**

```javascript
// backend/app.js - Verify this exists
const distPath = path.join(__dirname, "..", "frontend", "dist");
app.use(express.static(distPath));
```

### ❌ OpenAI Errors

**Check:**

1. Environment variable set: `OPENAI_API_KEY`
2. Key format: Starts with `sk-proj-`
3. Key is valid (not expired/revoked)

**Test locally:**

```powershell
$env:OPENAI_API_KEY = "sk-proj-..."
npm start
```

### ❌ App Crashes on Startup

**Railway logs show:**

```
Error: OPENAI_API_KEY not found
```

**Fix:** Add environment variable in Railway dashboard.

---

## ☁️ Alternative Platforms

### Heroku

**Pros:** Well-documented, many add-ons  
**Cons:** No free tier, requires credit card

**Differences from Railway:**

- Uses `Procfile` instead of Start Command
- Requires `heroku-postbuild` script

**Setup:**

```json
// package.json
{
  "scripts": {
    "heroku-postbuild": "npm run frontend:install && npm run build",
    "start": "node backend/app.js"
  }
}
```

Create `Procfile`:

```
web: npm start
```

### Render

**Pros:** Free tier, similar to Railway  
**Cons:** Slower cold starts

**Build Command:**

```bash
npm install && npm run frontend:install && npm run build
```

**Start Command:**

```bash
npm start
```

---

## 🐳 Docker Deployment

For self-hosting or platforms requiring containers.

### Dockerfile

Create `Dockerfile` in project root:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN npm install
RUN npm run frontend:install

# Copy source code
COPY . .

# Build frontend
RUN npm run build

# Expose port
EXPOSE 3001

# Start server
CMD ["npm", "start"]
```

### Build & Run

```bash
# Build image
docker build -t ragmaster .

# Run container
docker run -p 3001:3001 \
  -e OPENAI_API_KEY=sk-proj-... \
  ragmaster
```

### Docker Compose

Create `docker-compose.yml`:

```yaml
version: "3.8"

services:
  ragmaster:
    build: .
    ports:
      - "3001:3001"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    restart: unless-stopped
```

Run:

```bash
docker-compose up -d
```

---

## 🔒 Production Checklist

Before going live, ensure:

### Security

- [ ] Environment variables set (not hardcoded)
- [ ] `.env` file NOT in repository
- [ ] Rate limiting added (express-rate-limit)
- [ ] CORS configured if needed
- [ ] Helmet.js added for security headers

### Performance

- [ ] Frontend built and minified (`npm run build`)
- [ ] Gzip compression enabled (Express compression middleware)
- [ ] Static assets cached (Cache-Control headers)
- [ ] Error logging configured (e.g., Sentry, LogRocket)

### Monitoring

- [ ] Health check endpoint added (`/health`)
- [ ] Logging configured (Winston, Pino)
- [ ] Uptime monitoring (UptimeRobot, Pingdom)
- [ ] Error alerts configured

### Scalability

- [ ] Queue size limits appropriate for load
- [ ] OpenAI rate limits understood
- [ ] Consider Redis for persistent queue (currently in-memory)
- [ ] Database for user accounts (if adding auth)

---

## 📊 Cost Estimation

### Hosting

- **Railway Free Tier:** $0/month (500 hours, sleeps after inactivity)
- **Railway Hobby:** $5/month (unlimited hours, no sleep)
- **Railway Pro:** $20/month (more resources)

### OpenAI API

- **GPT-5-mini:** ~$0.002 per 10,000 words processed
- **Example:** 1,000 documents (5,000 words each) = $1.00
- **Budget:** Set monthly limit in OpenAI dashboard

### Total

- **Small project:** $0-5/month (free tier + minimal API usage)
- **Production:** $25-50/month (hosting + moderate API usage)

---

## 🔄 CI/CD Pipeline

### GitHub Actions (Auto-deploy to Railway)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Railway

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install Railway CLI
        run: npm i -g @railway/cli

      - name: Deploy
        run: railway up
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

Get Railway token:

```bash
railway login
railway tokens
```

Add to GitHub Secrets: `RAILWAY_TOKEN`

---

## 🌐 Custom Domain

### Railway

1. **Settings → Networking**
2. Click **"Generate Domain"** for free `*.railway.app` subdomain
3. Or add custom domain:
   - Add CNAME record: `your-domain.com` → `your-app.railway.app`
   - Verify in Railway dashboard
   - Auto-SSL enabled

---

## 📈 Scaling

### When to Scale

Signs you need more resources:

- Response times > 2 seconds
- Memory errors in logs
- Queue processing falls behind

### Scaling Options

**Vertical Scaling** (More resources per instance)

- Railway: Upgrade plan for more RAM/CPU
- Suitable for: < 1000 files/day

**Horizontal Scaling** (More instances)

- Add Redis for shared queue
- Use worker processes
- Load balancer (Railway handles this)
- Suitable for: > 1000 files/day

---

## 🆘 Post-Deployment Support

### Health Check

Add this endpoint:

```javascript
// backend/app.js
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    queueSize: fileQueue.length,
  });
});
```

Monitor it with UptimeRobot (free, 5-minute checks).

### Logs

**Railway:** Built-in log viewer in dashboard  
**Heroku:** `heroku logs --tail`  
**Docker:** `docker logs -f <container-id>`

### Rollback

**Railway:**

- Go to **Deployments**
- Click previous working version
- Click **"Redeploy"**

**Git:**

```bash
git revert HEAD
git push origin main
```

---

## 🎓 Advanced Topics

### Database Integration

Add PostgreSQL for persistent storage:

```javascript
// Example: Store processed files
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

await pool.query(
  "INSERT INTO processed_files (filename, chunks, keywords) VALUES ($1, $2, $3)",
  [filename, JSON.stringify(chunks), JSON.stringify(keywords)]
);
```

### Redis Queue

Replace in-memory queue with Redis:

```javascript
const Redis = require("ioredis");
const redis = new Redis(process.env.REDIS_URL);

// Add to queue
await redis.lpush("fileQueue", JSON.stringify(queueItem));

// Process from queue
const item = await redis.brpop("fileQueue", 0);
```

---

**Deployment complete! 🎉**

Your RAGMaster app is now live and ready to chunk documents at scale.

For questions, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) or open an issue.
