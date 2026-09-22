from pathlib import Path

import psycopg

from app.config import BASE_DIR, database_url


def main() -> None:
    url = database_url(direct=True)
    if not url:
        raise SystemExit("DATABASE_URL_UNPOOLED is not configured.")
    migration = (BASE_DIR / "migrations" / "001_initial.sql").read_text(encoding="utf-8")
    with psycopg.connect(url) as connection:
        connection.execute(migration)
    print("Database migration completed.")


if __name__ == "__main__":
    main()
