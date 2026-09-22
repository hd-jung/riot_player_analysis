from typing import Any

import pandas as pd


ROLE_LABELS = {
    "TOP": "Top",
    "JUNGLE": "Jungle",
    "MIDDLE": "Mid",
    "MID": "Mid",
    "BOTTOM": "Bot",
    "BOT": "Bot",
    "UTILITY": "Support",
    "SUPPORT": "Support",
}


def _bool_series(series: pd.Series) -> pd.Series:
    if series.dtype == bool:
        return series
    return series.astype(str).str.lower().isin({"true", "1", "t", "yes", "y"})


def _records_frame(rows: list[dict[str, Any]]) -> pd.DataFrame:
    frame = pd.DataFrame(rows)
    if frame.empty:
        return frame
    for column in ("kills", "deaths", "assists", "kda", "cs", "timePlayed"):
        frame[column] = pd.to_numeric(frame[column], errors="coerce").fillna(0)
    frame["win"] = _bool_series(frame["win"])
    frame["champion"] = frame["champion"].fillna("Unknown").astype(str)
    frame["role"] = (
        frame["teamPosition"]
        .fillna("UNKNOWN")
        .astype(str)
        .str.upper()
        .map(ROLE_LABELS)
        .fillna("Flex")
    )
    frame["cs_per_min"] = frame["cs"] / (frame["timePlayed"].clip(lower=1) / 60)
    if "playedAt" in frame.columns:
        frame["played_at"] = pd.to_datetime(
            pd.to_numeric(frame["playedAt"], errors="coerce"),
            unit="ms",
            utc=True,
            errors="coerce",
        )
    else:
        frame["played_at"] = pd.NaT
    return frame


def _match_coach_note(row: Any) -> str:
    if bool(row.win) and float(row.kda) >= 3:
        return "Strong conversion: efficient fighting supported the win."
    if int(row.deaths) >= 7:
        return "Review the first two deaths and identify the safer exit route."
    if float(row.cs_per_min) < 6:
        return "Farm pace fell behind; protect the next two lane-wave timings."
    if not bool(row.win) and float(row.kda) >= 3:
        return "Solid individual output; review how the lead could convert into objectives."
    if bool(row.win):
        return "Win secured; keep the same objective setup and reduce avoidable risks."
    return "Close the feedback loop by reviewing one low-value fight from this match."


def analyze_matches(rows: list[dict[str, Any]], riot_id: str) -> dict[str, Any]:
    frame = _records_frame(rows)
    if frame.empty:
        raise ValueError("No match rows are available.")

    wins = int(frame["win"].sum())
    total = len(frame)
    favorite_role = frame["role"].mode().iloc[0] if not frame["role"].mode().empty else "Flex"

    champion_stats = (
        frame.groupby("champion", as_index=False)
        .agg(
            games=("champion", "size"),
            wins=("win", "sum"),
            win_rate=("win", "mean"),
            avg_kda=("kda", "mean"),
            avg_cs=("cs", "mean"),
        )
        .sort_values(["games", "win_rate", "avg_kda"], ascending=[False, False, False])
    )

    champions = [
        {
            "champion": row.champion,
            "games": int(row.games),
            "wins": int(row.wins),
            "win_rate": round(float(row.win_rate) * 100, 1),
            "avg_kda": round(float(row.avg_kda), 2),
            "avg_cs": round(float(row.avg_cs), 1),
        }
        for row in champion_stats.itertuples(index=False)
    ]

    role_stats = (
        frame.groupby("role", as_index=False)
        .agg(games=("role", "size"), win_rate=("win", "mean"), avg_kda=("kda", "mean"))
        .sort_values("games", ascending=False)
    )
    roles = [
        {
            "role": row.role,
            "games": int(row.games),
            "share": round(int(row.games) / total * 100, 1),
            "win_rate": round(float(row.win_rate) * 100, 1),
            "avg_kda": round(float(row.avg_kda), 2),
        }
        for row in role_stats.itertuples(index=False)
    ]

    recent = []
    for row in frame.head(10).itertuples(index=False):
        recent.append(
            {
                "champion": row.champion,
                "match_id": str(row.gameId),
                "role": row.role,
                "win": bool(row.win),
                "score": f"{int(row.kills)} / {int(row.deaths)} / {int(row.assists)}",
                "kda": round(float(row.kda), 2),
                "cs": int(row.cs),
                "duration": round(float(row.timePlayed) / 60),
                "played_at": (
                    row.played_at.isoformat()
                    if not pd.isna(row.played_at)
                    else None
                ),
                "coach_note": _match_coach_note(row),
            }
        )

    recommendations = []
    for item in sorted(
        champions,
        key=lambda value: (value["win_rate"], value["avg_kda"], value["games"]),
        reverse=True,
    )[:3]:
        recommendations.append(
            {
                **item,
                "signal": (
                    "High-conviction pick"
                    if item["win_rate"] >= 60
                    else "Strong comfort signal"
                    if item["avg_kda"] >= 3
                    else "Build more sample"
                ),
            }
        )

    benchmark = _player_benchmark(frame, favorite_role)
    training_plan = _training_plan(
        summary={
            "games": total,
            "wins": wins,
            "losses": total - wins,
            "win_rate": round(wins / total * 100, 1),
            "avg_kda": round(float(frame["kda"].mean()), 2),
            "avg_cs": round(float(frame["cs"].mean()), 1),
            "avg_cs_min": round(float(frame["cs_per_min"].mean()), 1),
            "avg_deaths": round(float(frame["deaths"].mean()), 1),
            "favorite_role": favorite_role,
            "champion_pool": int(frame["champion"].nunique()),
        },
        benchmark=benchmark,
        recommendations=recommendations,
    )

    return {
        "riot_id": riot_id,
        "summary": {
            "games": total,
            "wins": wins,
            "losses": total - wins,
            "win_rate": round(wins / total * 100, 1),
            "avg_kda": round(float(frame["kda"].mean()), 2),
            "avg_cs": round(float(frame["cs"].mean()), 1),
            "avg_cs_min": round(float(frame["cs_per_min"].mean()), 1),
            "avg_deaths": round(float(frame["deaths"].mean()), 1),
            "favorite_role": favorite_role,
            "champion_pool": int(frame["champion"].nunique()),
        },
        "champions": champions,
        "roles": roles,
        "recommendations": recommendations,
        "recent_matches": recent,
        "benchmark": benchmark,
        "training_plan": training_plan,
    }


def _player_benchmark(frame: pd.DataFrame, favorite_role: str) -> dict[str, Any]:
    """Compare the player with KR high-rank matches in the same primary role."""
    from .config import REFERENCE_DATA_DIR

    reference = _records_frame(
        pd.read_csv(REFERENCE_DATA_DIR / "highrank.csv").to_dict("records")
    )
    role_reference = reference[reference["role"] == favorite_role]
    if role_reference.empty:
        role_reference = reference

    targets = {
        "win_rate": round(float(role_reference["win"].mean()) * 100, 1),
        "avg_kda": round(float(role_reference["kda"].median()), 2),
        "avg_cs_min": round(float(role_reference["cs_per_min"].median()), 1),
        "avg_deaths": round(float(role_reference["deaths"].median()), 1),
    }
    actual = {
        "win_rate": round(float(frame["win"].mean()) * 100, 1),
        "avg_kda": round(float(frame["kda"].mean()), 2),
        "avg_cs_min": round(float(frame["cs_per_min"].mean()), 1),
        "avg_deaths": round(float(frame["deaths"].mean()), 1),
    }
    comparisons = []
    labels = {
        "win_rate": ("Win rate", "%", True),
        "avg_kda": ("Average KDA", "", True),
        "avg_cs_min": ("CS per minute", "", True),
        "avg_deaths": ("Deaths per game", "", False),
    }
    for key, (label, unit, higher_is_better) in labels.items():
        player_value = actual[key]
        target_value = targets[key]
        raw_gap = (target_value - player_value) if higher_is_better else (player_value - target_value)
        scale = max(abs(target_value), 1)
        comparisons.append(
            {
                "key": key,
                "label": label,
                "unit": unit,
                "player": player_value,
                "target": target_value,
                "gap": round(raw_gap, 2),
                "gap_score": round(raw_gap / scale * 100, 1),
                "status": "focus" if raw_gap > scale * 0.08 else "on-track",
            }
        )
    return {
        "cohort": f"KR high-rank {favorite_role}",
        "sample_games": int(len(role_reference)),
        "confidence": "high" if len(frame) >= 15 else "medium" if len(frame) >= 8 else "early",
        "comparisons": comparisons,
        "disclaimer": "Directional benchmark from KR Challenger, Grandmaster, and Master ranked matches; not professional-player data.",
    }


def _training_plan(
    summary: dict[str, Any],
    benchmark: dict[str, Any],
    recommendations: list[dict[str, Any]],
) -> dict[str, Any]:
    comparison = {item["key"]: item for item in benchmark["comparisons"]}
    focus = sorted(
        benchmark["comparisons"], key=lambda item: item["gap_score"], reverse=True
    )
    drills = {
        "avg_cs_min": {
            "title": "CS consistency",
            "goal": f"Reach {max(comparison['avg_cs_min']['target'], comparison['avg_cs_min']['player'])} CS/min in two games",
            "session": "10-minute last-hit drill, then one ranked game with CS checkpoints at 5 and 10 minutes.",
        },
        "avg_deaths": {
            "title": "Survival discipline",
            "goal": f"Keep deaths at or below {min(comparison['avg_deaths']['target'], comparison['avg_deaths']['player'])} per game",
            "session": "Review the first death from two losses. Write one preventable cause and one safer alternative for each.",
        },
        "avg_kda": {
            "title": "Fight selection",
            "goal": f"Reach {max(comparison['avg_kda']['target'], comparison['avg_kda']['player'])} KDA across the session",
            "session": "Before each fight, check ally numbers, key cooldowns, and the exit route. Review two low-value fights afterward.",
        },
        "win_rate": {
            "title": "Conversion routine",
            "goal": f"Maintain at least {max(comparison['win_rate']['target'], comparison['win_rate']['player'])}% across the practice block",
            "session": "After every recall, name the next objective and play the following 90 seconds around it.",
        },
    }
    selected = [item for item in focus if item["gap_score"] > 0][:3]
    if len(selected) < 3:
        selected = (selected + [item for item in focus if item not in selected])[:3]
    primary_pick = recommendations[0]["champion"] if recommendations else "your comfort pick"
    schedule = []
    day_names = ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"]
    for index, day in enumerate(day_names):
        if index == 0:
            task = "Baseline review"
            detail = f"Review three recent matches and record the first mistake in each. Lock {primary_pick} as the primary practice pick."
        elif index in {1, 3, 5}:
            drill = drills[selected[(index // 2) % len(selected)]["key"]]
            task, detail = drill["title"], drill["session"]
        elif index in {2, 4}:
            task = "Focused ranked block"
            detail = f"Play two ranked games on {primary_pick}. Track only today's target and stop after the block."
        elif index == 6:
            task = "Re-test and adjust"
            detail = "Analyze the newest matches again and compare the four benchmark gaps with Day 1."
        schedule.append({"day": index + 1, "label": day, "task": task, "detail": detail})
    return {
        "title": "7-day improvement routine",
        "primary_role": summary["favorite_role"],
        "primary_pick": primary_pick,
        "focus_areas": [
            {
                "key": item["key"],
                "title": drills[item["key"]]["title"],
                "goal": drills[item["key"]]["goal"],
                "priority": index + 1,
            }
            for index, item in enumerate(selected)
        ],
        "schedule": schedule,
        "completion_storage": "browser",
        "retest_after_days": 7,
    }


def benchmark_context(path: str) -> dict[str, Any]:
    frame = pd.read_csv(path)
    frame["win"] = _bool_series(frame["win"])
    frame["role"] = (
        frame["teamPosition"].fillna("UNKNOWN").astype(str).str.upper().map(ROLE_LABELS)
    )
    frame = frame.dropna(subset=["role", "champion"])

    role_rows = []
    hits = 0
    dcg = 0.0
    evaluated = 0
    top_picks: dict[str, list[dict[str, Any]]] = {}

    for role, group in frame.groupby("role"):
        table = (
            group.groupby("champion", as_index=False)
            .agg(games=("champion", "size"), win_rate=("win", "mean"))
            .sort_values(["win_rate", "games"], ascending=[False, False])
        )
        eligible = table[table["games"] >= 10]
        if eligible.empty:
            eligible = table
        top = eligible.head(10).reset_index(drop=True)
        recs = top["champion"].tolist()
        role_hits = 0
        role_dcg = 0.0
        for champion in group["champion"]:
            evaluated += 1
            if champion in recs:
                rank = recs.index(champion) + 1
                role_hits += 1
                hits += 1
                gain = 1.0 / __import__("math").log2(rank + 1)
                role_dcg += gain
                dcg += gain
        role_rows.append(
            {
                "role": role,
                "games": len(group),
                "hit_rate": round(role_hits / len(group) * 100, 1),
                "signal": "Leading" if role_hits / len(group) >= 0.3 else "Developing",
            }
        )
        top_picks[role] = [
            {
                "champion": item.champion,
                "games": int(item.games),
                "win_rate": round(float(item.win_rate) * 100, 1),
            }
            for item in top.head(5).itertuples(index=False)
        ]

    return {
        "rows": len(frame),
        "matches": int(frame["gameId"].nunique()),
        "champions": int(frame["champion"].nunique()),
        "hr10": round(hits / evaluated * 100, 1) if evaluated else 0,
        "ndcg10": round(dcg / evaluated * 100, 1) if evaluated else 0,
        "roles": sorted(role_rows, key=lambda row: row["hit_rate"], reverse=True),
        "top_picks": top_picks,
    }
