from pathlib import Path

import psycopg

from app.config import BASE_DIR, database_url


def main() -> None:
    url = database_url(direct=True)
    if not url:
        raise SystemExit("DATABASE_URL_UNPOOLED is not configured.")
    with psycopg.connect(url) as connection:
        for path in sorted((BASE_DIR / "migrations").glob("*.sql")):
            connection.execute(path.read_text(encoding="utf-8"))
    print("Database migration completed.")


if __name__ == "__main__":
    main()
