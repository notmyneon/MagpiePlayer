"""Build the public season datasets from the supplied player workbook.

Usage: python scripts/build_data.py path/to/Book1.xlsx
The workbook's 'season' is the starting year (2025 means 2025–26).
"""
import csv
import sys
from pathlib import Path

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[1]
FIELDS = [
    "season", "player", "team", "position", "gp", "avgtoi", "hits", "blocked",
    "takeaways", "minors", "goalsagainst", "shotsagainst", "goalsfor", "shotsfor",
    "individualgoals", "individualshotsattempts", "giveaways", "faceoffswon",
    "faceoffslost", "xgoalsfor", "xgoalsagainst", "attemptsfor", "attemptsagainst",
]


def main(source):
    sheet = load_workbook(source, read_only=True, data_only=True).active
    rows = sheet.iter_rows(values_only=True)
    headers = next(rows)
    full_path = ROOT / "data" / "player-stats.csv"
    main_path = ROOT / "data" / "player-data.csv"
    count = 0
    with full_path.open("w", newline="", encoding="utf-8") as raw_file, main_path.open(
        "w", newline="", encoding="utf-8"
    ) as site_file:
        raw_writer = csv.writer(raw_file, lineterminator="\n")
        site_writer = csv.DictWriter(site_file, fieldnames=FIELDS, lineterminator="\n")
        raw_writer.writerow(headers)
        site_writer.writeheader()
        for values in rows:
            data = dict(zip(headers, values))
            if not data.get("name") or not data.get("games_played"):
                continue
            gp = data["games_played"]
            # Natural Stat Trick icetime is seconds; the existing scoring formula
            # expects average minutes per game.
            avgtoi = data["icetime"] / 60 / gp
            site_writer.writerow({
                "season": data["season"], "player": data["name"],
                "team": data["team"], "position": data["position"],
                "gp": gp, "avgtoi": round(avgtoi, 7),
                "hits": data["I_F_hits"], "blocked": data["shotsBlockedByPlayer"],
                "takeaways": data["I_F_takeaways"], "minors": data["penalties"],
                "goalsagainst": data["OnIce_A_goals"],
                "shotsagainst": data["OnIce_A_shotsOnGoal"],
                "goalsfor": data["OnIce_F_goals"],
                "shotsfor": data["OnIce_F_shotsOnGoal"],
                "individualgoals": sum(data[f"I_F_{level}DangerGoals"] for level in ("low", "medium", "high")),
                "individualshotsattempts": data["I_F_unblockedShotAttempts"],
                "giveaways": data["I_F_giveaways"],
                "faceoffswon": data["faceoffsWon"],
                "faceoffslost": data["faceoffsLost"],
                "xgoalsfor": data["OnIce_F_xGoals"],
                "xgoalsagainst": data["OnIce_A_xGoals"],
                "attemptsfor": data["OnIce_F_shotAttempts"],
                "attemptsagainst": data["OnIce_A_shotAttempts"],
            })
            raw_writer.writerow(values)
            count += 1
    print(f"Wrote {count} rows to {main_path} and {full_path}")


if __name__ == "__main__":
    main(sys.argv[1])
