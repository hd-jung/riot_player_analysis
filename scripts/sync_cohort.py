import argparse
import asyncio
import os
import time

from dotenv import load_dotenv

from app.config import BASE_DIR
from app.db import cohort_identity, save_cohort_matches
from app.riot import RiotAPIError, RiotClient


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--riot-id", action="append", default=[])
    parser.add_argument("--days", type=int, default=90)
    args = parser.parse_args()
    load_dotenv(BASE_DIR / ".env.production.local")
    load_dotenv(BASE_DIR / ".env")
    key = os.getenv("RIOT_API_KEY", "").strip()
    if not key:
        raise SystemExit("RIOT_API_KEY is not configured locally.")
    targets = args.riot_id
    if not targets:
        raise SystemExit("Pass one or more --riot-id values.")
    start_time = int(time.time()) - args.days * 86400
    client = RiotClient(key, "americas")
    for riot_id in targets:
        cohort = cohort_identity(riot_id, "americas")
        if not cohort:
            print(f"SKIP {riot_id}: not in public cohort")
            continue
        try:
            rows = await client.collect(riot_id, 100, start_time=start_time)
            saved = save_cohort_matches(cohort["id"], rows)
            print(f"OK {riot_id}: {saved} new matches, {len(rows)} found")
        except RiotAPIError as exc:
            print(f"ERROR {riot_id}: {exc}")


if __name__ == "__main__":
    asyncio.run(main())
