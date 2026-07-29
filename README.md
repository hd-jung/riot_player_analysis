# Rift Signal v1.1

Rift Signal is a FastAPI-based League of Legends performance dashboard prepared for a global audience. The public-facing landing page, player analysis, and metrics lab use English copy.

## Pages

- `/` — English product landing page
- `/analysis` — English Riot ID performance analysis
- `/metrics` — English recommendation benchmark dashboard
- `/docs` — FastAPI interactive API documentation

## Run with Conda

```cmd
conda activate game_py311
cd /d "D:\workspace\4. hong\game_v1.1"
python -m pip install -r requirements.txt
set RIOT_API_KEY=RGAPI-your-key
python -m uvicorn main:app --reload
```

Open `http://127.0.0.1:8000`.

The analysis page uses an existing CSV cache when possible. A Riot API key is required only for a new player or a forced refresh.

## Structure

```text
main.py                 FastAPI entry point and routes
app/
  analytics.py          Player and benchmark calculations
  config.py             Paths and environment configuration
  riot.py               Async Riot API client and CSV cache
templates/              Jinja2 page templates
public/css/             Responsive visual system
public/js/              Search and analysis interactions
data/reference/         Benchmark data
data/users/             Cached Riot ID match data
collector/              Standalone collection CLI
metrics/metrics_cli.py  Standalone metric evaluation CLI
```

## Deploy to Vercel

Vercel detects `server.py` as the FastAPI entrypoint and serves `public/` through
its static asset CDN.

```cmd
vercel
vercel env add RIOT_API_KEY production --sensitive
vercel --prod
```

The serverless filesystem is not persistent. Live results are cached in the
function's temporary directory when the project directory is read-only.

## API

```http
GET  /api/health
POST /api/analyze
```

Example request:

```json
{
  "riot_id": "Hide on bush#KR1",
  "match_count": 10,
  "refresh": false
}
```
