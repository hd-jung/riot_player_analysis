import hashlib
import json
import secrets
from datetime import datetime, timezone
from typing import Any

import psycopg
from psycopg.rows import dict_row

from .config import database_url


def configured() -> bool:
    return bool(database_url())


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def save_analysis(result: dict[str, Any], routing: str, consent: bool) -> dict[str, str] | None:
    if not consent or not configured():
        return None
    token = secrets.token_urlsafe(32)
    analyzed_at = result.get("analyzed_at") or datetime.now(timezone.utc).isoformat()
    with psycopg.connect(database_url()) as connection:
        profile = connection.execute(
            """
            INSERT INTO player_profiles (riot_id, routing, consent_confirmed_at, last_analyzed_at)
            VALUES (%s, %s, NOW(), %s)
            ON CONFLICT (riot_id_normalized, routing) DO UPDATE
            SET consent_confirmed_at = COALESCE(player_profiles.consent_confirmed_at, NOW()),
                last_analyzed_at = EXCLUDED.last_analyzed_at
            RETURNING id
            """,
            (result["riot_id"], routing, analyzed_at),
        ).fetchone()
        analysis = connection.execute(
            """
            INSERT INTO analyses
              (player_id, source, analyzed_at, match_count, summary, benchmark, training_plan, routine_token_hash)
            VALUES (%s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s)
            RETURNING id
            """,
            (
                profile[0], result["source"], analyzed_at, result["summary"]["games"],
                json.dumps(result["summary"]), json.dumps(result["benchmark"]),
                json.dumps(result["training_plan"]), _hash_token(token),
            ),
        ).fetchone()
        for index, match in enumerate(result.get("recent_matches", [])):
            connection.execute(
                """
                INSERT INTO match_snapshots
                  (analysis_id, match_id, played_at, champion, role, won, score, kda, cs, duration_minutes, coach_note)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (analysis_id, match_id) DO NOTHING
                """,
                (
                    analysis[0], match.get("match_id") or f"snapshot-{index}", match.get("played_at"),
                    match["champion"], match["role"], match["win"], match["score"],
                    match["kda"], match["cs"], match["duration"], match["coach_note"],
                ),
            )
    return {"analysis_id": str(analysis[0]), "routine_token": token}


def save_completion(analysis_id: str, token: str, day: int, task: str, checked: bool) -> None:
    with psycopg.connect(database_url()) as connection:
        valid = connection.execute(
            "SELECT 1 FROM analyses WHERE id = %s AND routine_token_hash = %s",
            (analysis_id, _hash_token(token)),
        ).fetchone()
        if not valid:
            raise PermissionError("Invalid routine access token.")
        if checked:
            connection.execute(
                """INSERT INTO routine_completions (analysis_id, day, task)
                   VALUES (%s, %s, %s)
                   ON CONFLICT (analysis_id, day) DO UPDATE
                   SET task = EXCLUDED.task, completed_at = NOW()""",
                (analysis_id, day, task),
            )
        else:
            connection.execute(
                "DELETE FROM routine_completions WHERE analysis_id = %s AND day = %s",
                (analysis_id, day),
            )


def operations_summary() -> dict[str, Any]:
    if not configured():
        return {"database": "not configured", "analyses": 0, "testers": 0, "matches": 0, "completions": 0, "cohort_count": 0, "cohort_verified": 0}
    with psycopg.connect(database_url(), row_factory=dict_row) as connection:
        counts = connection.execute(
            """SELECT
                (SELECT COUNT(*) FROM analyses) AS analyses,
                (SELECT COUNT(*) FROM player_profiles WHERE consent_confirmed_at IS NOT NULL) AS testers,
                (SELECT COUNT(*) FROM match_snapshots) AS matches,
                (SELECT COUNT(*) FROM routine_completions) AS completions,
                (SELECT COUNT(*) FROM public_cohort) AS cohort_count,
                (SELECT COUNT(*) FROM public_cohort WHERE status = 'verified') AS cohort_verified,
                (SELECT MAX(analyzed_at) FROM analyses) AS last_analysis"""
        ).fetchone()
    return {"database": "connected", **dict(counts)}


def cohort_identity(riot_id: str, routing: str) -> dict[str, Any] | None:
    if not configured():
        return None
    with psycopg.connect(database_url(), row_factory=dict_row) as connection:
        row = connection.execute(
            "SELECT id, riot_id, status, imported_at FROM public_cohort WHERE LOWER(riot_id) = LOWER(%s) AND routing = %s",
            (riot_id, routing),
        ).fetchone()
    return dict(row) if row else None


def save_cohort_matches(cohort_id: int, rows: list[dict[str, Any]]) -> int:
    saved = 0
    with psycopg.connect(database_url()) as connection:
        for row in rows:
            played_at = datetime.fromtimestamp(int(row.get("playedAt", 0)) / 1000, tz=timezone.utc)
            cursor = connection.execute(
                """INSERT INTO cohort_matches
                (cohort_id, match_id, played_at, champion, role, won, kills, deaths, assists, kda, cs, duration_seconds)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (cohort_id, match_id) DO NOTHING""",
                (cohort_id, str(row["gameId"]), played_at, row["champion"], row["teamPosition"], row["win"],
                 row["kills"], row["deaths"], row["assists"], row["kda"], row["cs"], row["timePlayed"]),
            )
            saved += cursor.rowcount
        connection.execute(
            "UPDATE public_cohort SET status='verified', last_verified_at=NOW(), imported_at=NOW() WHERE id=%s",
            (cohort_id,),
        )
    return saved


def load_cohort_matches(cohort_id: int) -> list[dict[str, Any]]:
    with psycopg.connect(database_url(), row_factory=dict_row) as connection:
        rows = connection.execute(
            """SELECT match_id AS "gameId", champion, kills, deaths, assists,
            role AS "teamPosition", won AS win, kda, cs, duration_seconds AS "timePlayed",
            (EXTRACT(EPOCH FROM played_at) * 1000)::bigint AS "playedAt"
            FROM cohort_matches WHERE cohort_id=%s ORDER BY played_at DESC""",
            (cohort_id,),
        ).fetchall()
    return [dict(row) for row in rows]
