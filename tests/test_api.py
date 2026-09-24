import unittest
from unittest.mock import patch

from main import AnalyzeRequest, analyze


class AnalyzeEndpointTests(unittest.IsolatedAsyncioTestCase):
    async def test_one_off_session_does_not_require_database(self):
        rows = [
            {
                "gameId": index,
                "champion": "Garen",
                "kills": 4,
                "deaths": 6,
                "assists": 3,
                "teamPosition": "TOP",
                "win": index % 2 == 0,
                "kda": 1.2,
                "cs": 130,
                "timePlayed": 1800,
                "playedAt": 1_750_000_000_000 + index,
            }
            for index in range(10)
        ]

        with (
            patch("main.database_configured", return_value=False),
            patch("main.cohort_identity") as cohort_identity,
            patch("main.read_cache", return_value=rows),
        ):
            result = await analyze(
                AnalyzeRequest(riot_id="RealPlayer#KR1", match_count=10)
            )

        cohort_identity.assert_not_called()
        self.assertEqual(result["source"], "cache")
        self.assertEqual(result["persistence"]["status"], "not requested")
        self.assertEqual(len(result["quick_session"]["steps"]), 3)


if __name__ == "__main__":
    unittest.main()
