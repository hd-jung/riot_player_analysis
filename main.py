from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

from app.analytics import analyze_matches, historical_profile
from app.config import PUBLIC_DIR, TEMPLATES_DIR, riot_api_key
from app.db import configured as database_configured
from app.db import cohort_identity, load_cohort_matches, operations_summary, save_analysis, save_cohort_matches, save_completion
from app.riot import RiotAPIError, RiotClient, read_cache, split_riot_id


app = FastAPI(
    title="GameLevel PT",
    description="A high-rank benchmark and personal League of Legends training routine app.",
    version="1.6.1",
)

# Vercel serves files under public/ from its CDN. These mounts keep local
# uvicorn development working and remain safe if a deployment bundle omits
# static directories.
if (PUBLIC_DIR / "css").is_dir():
    app.mount("/css", StaticFiles(directory=PUBLIC_DIR / "css"), name="css")
if (PUBLIC_DIR / "js").is_dir():
    app.mount("/js", StaticFiles(directory=PUBLIC_DIR / "js"), name="js")

templates = Jinja2Templates(directory=TEMPLATES_DIR)


@app.get("/favicon.svg", include_in_schema=False)
async def favicon():
    return FileResponse(PUBLIC_DIR / "favicon.svg", media_type="image/svg+xml")


class AnalyzeRequest(BaseModel):
    riot_id: str = Field(min_length=3, max_length=40)
    match_count: int = Field(default=10, ge=3, le=20)
    routing: Literal["americas", "europe", "asia", "sea"] = "asia"
    consent_to_store: bool = False
    refresh: bool = False


class RoutineCompletionRequest(BaseModel):
    analysis_id: str
    routine_token: str = Field(min_length=20, max_length=200)
    day: int = Field(ge=1, le=7)
    task: str = Field(min_length=1, max_length=200)
    checked: bool


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={"page": "home"},
    )


@app.get("/analysis", response_class=HTMLResponse)
async def analysis_page(
    request: Request,
    riot_id: str = Query(default=""),
    count: int = Query(default=10, ge=3, le=20),
    region: Literal["americas", "europe", "asia", "sea"] = Query(default="asia"),
):
    return templates.TemplateResponse(
        request=request,
        name="analysis.html",
        context={"page": "analysis", "riot_id": riot_id, "count": count, "region": region},
    )


@app.get("/growth", response_class=HTMLResponse)
async def growth_page(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="growth.html",
        context={"page": "growth"},
    )


@app.get("/privacy", response_class=HTMLResponse)
async def privacy_page(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="privacy.html",
        context={"page": "privacy"},
    )


@app.get("/operations", response_class=HTMLResponse)
async def operations_page(request: Request):
    try:
        summary = operations_summary()
    except Exception:
        summary = {"database": "unavailable", "analyses": 0, "testers": 0, "matches": 0, "completions": 0, "cohort_count": 0, "cohort_verified": 0}
    return templates.TemplateResponse(
        request=request,
        name="operations.html",
        context={"page": "operations", "operations": summary},
    )


@app.get("/metrics", include_in_schema=False)
async def legacy_metrics_page():
    return RedirectResponse(url="/growth", status_code=307)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "version": app.version,
        "riot_api_configured": bool(riot_api_key()),
        "database_configured": database_configured(),
    }


@app.post("/api/analyze")
async def analyze(payload: AnalyzeRequest):
    try:
        game_name, tag_line = split_riot_id(payload.riot_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    rows = []
    source = "cache"
    cohort = cohort_identity(payload.riot_id, payload.routing)
    cohort_rows = load_cohort_matches(cohort["id"]) if cohort and cohort.get("status") == "verified" else []
    if cohort_rows and not payload.refresh:
        rows = cohort_rows
        source = "riot-history-import"
    if not payload.refresh:
        rows = rows or read_cache(game_name, tag_line)

    if not rows:
        key = riot_api_key()
        if not key:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Live Riot access is not configured and no cached matches exist "
                    "for this Riot ID."
                ),
            )
        try:
            history_start = int((datetime.now(timezone.utc) - timedelta(days=90)).timestamp()) if cohort else None
            request_count = 100 if cohort else payload.match_count
            rows = await RiotClient(key, payload.routing).collect(
                payload.riot_id, request_count, start_time=history_start
            )
            if cohort:
                save_cohort_matches(cohort["id"], rows)
                cohort_rows = load_cohort_matches(cohort["id"])
                rows = cohort_rows
                source = "riot-history-import"
            else:
                source = "live"
        except RiotAPIError as exc:
            cached = read_cache(game_name, tag_line)
            if cached:
                rows = cached
                source = "cache-fallback"
            else:
                raise HTTPException(status_code=502, detail=str(exc)) from exc

    try:
        result = analyze_matches(rows[: payload.match_count], payload.riot_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    result["source"] = source
    result["routing"] = payload.routing
    result["analyzed_at"] = datetime.now(timezone.utc).isoformat()
    if cohort_rows:
        result["historical_profile"] = historical_profile(cohort_rows)
    result["persistence"] = {"status": "not requested"}
    if payload.consent_to_store:
        try:
            saved = save_analysis(result, payload.routing, True)
            if saved:
                result["persistence"] = {"status": "saved", **saved}
        except Exception:
            result["persistence"] = {"status": "unavailable"}
    return result


@app.post("/api/routine-completion")
async def routine_completion(payload: RoutineCompletionRequest):
    if not database_configured():
        raise HTTPException(status_code=503, detail="Persistent storage is not configured.")
    try:
        save_completion(
            payload.analysis_id,
            payload.routine_token,
            payload.day,
            payload.task,
            payload.checked,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail="The completion could not be saved.") from exc
    return {"status": "saved"}
