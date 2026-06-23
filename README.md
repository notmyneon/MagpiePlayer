# Magpie Score Player Cards

A browser-based Magpie Score tool for NHL player cards, player comparisons, and team/player rankings.

## Features

- Upload player CSV data
- Calculate Magpie Score from:
  - hits
  - blocked shots
  - takeaways
  - minors
  - goals against
  - shots against
  - average TOI
- Generate single-season player cards
- Compare 1 or 2 players year by year
- Build team/year ranking cards
- Filter rankings by forwards, defence, or both
- Highlight up to 2 players
- Download cards as PNGs

## CSV Headers

Use these headers:

```csv
Year,player,team,position,gp,avgtoi,hits,blocked,takeaways,minors,goalsagainst,shotsagainst
```

## GitHub Pages

This site is designed to run as a single static `index.html` file.  
Upload the files to a GitHub repository and enable GitHub Pages from the repository settings.
