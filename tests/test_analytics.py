import unittest

from app.analytics import analyze_matches


class QuickSessionTests(unittest.TestCase):
    def test_analysis_includes_one_off_session(self):
        rows = [
            {
                "gameId": index,
                "champion": "Ahri",
                "kills": 3,
                "deaths": 8,
                "assists": 5,
                "teamPosition": "MIDDLE",
                "win": index % 3 == 0,
                "kda": 1.0,
                "cs": 120,
                "timePlayed": 1800,
                "playedAt": 1_750_000_000_000 + index,
            }
            for index in range(10)
        ]

        result = analyze_matches(rows, "RealPlayer#KR1")
        session = result["quick_session"]

        self.assertEqual(session["primary_role"], "Mid")
        self.assertEqual(session["primary_pick"], "Ahri")
        self.assertEqual(session["completion_storage"], "none")
        self.assertEqual(len(session["steps"]), 3)
        self.assertEqual(
            session["estimated_minutes"],
            sum(step["minutes"] for step in session["steps"]),
        )
        self.assertIn(
            session["focus_key"],
            {"win_rate", "avg_kda", "avg_cs_min", "avg_deaths"},
        )
        self.assertTrue(session["target"])


if __name__ == "__main__":
    unittest.main()
