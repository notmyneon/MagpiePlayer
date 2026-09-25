# Magpie Score

A static GitHub Pages site for player season timelines, side-by-side comparisons, full team cards, and an 18-skater roster builder. The site reads the committed data automatically. There is no browser upload or manual entry section.

## Data

- `data/player-data.csv`: season rows for the site, including Magpie inputs, on-ice goals for/against and shots for/against, individual goals, shot attempts, expected goals, faceoffs, and giveaways.
- `data/player-stats.csv`: all 117 columns from the supplied workbook. The Player page loads this file only when someone opens the advanced statistics explorer.
- Years are **season start years**: `2025` is the 2025–26 season.
- `icetime` in the original workbook is seconds. Average TOI in the site data is `icetime ÷ 60 ÷ games_played`.
- `I_F_*` columns represent individual events; `OnIce_F_*` and `OnIce_A_*` represent team events while the player was on the ice. The site labels those on-ice fields explicitly.
- Duplicate names at different positions are kept separate. A player's rows from multiple teams in one season are combined for the player view and roster builder; the team card uses only that team's stint.

To replace the season data with a newer workbook that has the same source columns:

```bash
python scripts/build_data.py path/to/updated-workbook.xlsx
```

Then commit the two generated CSV files. GitHub Pages will read them after deployment; visitors need only reload the page.

## Scoring and projection

Player score retains the previous site's formula:

```text
Magpie Score = 10 × (hits + blocked shots + takeaways)
                   ÷ (shots against ÷ average TOI + goals against + minor penalties)
```

It uses season totals and average TOI in minutes. A zero denominator yields zero.

The roster builder keeps the prior TOI bands: forwards at 18+, 15–18, 12–15, and 1–12 minutes; defenders at 22+, 17–22, and under 17. Assigned role minutes are 21/16.5/13.5/6.5 for forward lines and 25/19.5/8.5 for defence pairs. Selected roles are normalized to 300 skater minutes for a complete lineup. On-ice goals and shots are divided by five in the displayed team estimate and roster score. Players must meet the minimum GP threshold to remain selected or appear in autofill and dropdowns.

The team card's average player score is an arithmetic average of the listed players' scores, not the projected roster score. Added players are highlighted and counted in that average. A team's totals for on-ice events are not added on the team card because that would count the same goals or shots several times.

## Pages

The four sections share `index.html`: `#players`, `#compare`, `#teams`, and `#roster`. The previous `/roster-builder.html` URL redirects to `#roster`.

Serve the repository with a local HTTP server for development, for example `python -m http.server 8787`, and open `http://localhost:8787`. Direct `file://` access cannot fetch the data files.
