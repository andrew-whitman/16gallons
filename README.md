# 16gallons

A 2048-style puzzle game where you merge kitchen volume measurements. Combine matching tiles to double the amount — reach **16 gallons** to win.

**Play online:** [andrew-whitman.github.io/16gallons](https://andrew-whitman.github.io/16gallons/)

## How to play

- Slide tiles with **arrow keys**, **WASD**, or **swipe** on mobile
- When two tiles with the same volume touch, they merge into the next size up
- The water level rises as your highest tile grows
- Open the **Volume Guide** on the left to see the full conversion chart

## Features

- Kitchen volume theme (tbsp → pint → quart → gallon)
- Rising water fill animation
- Undo last move
- Dark / light theme
- Best score saved locally
- Works offline after first load (installable as a PWA)

## Development

No build step required — open `index.html` in a browser, or serve the folder locally:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Deploy

Hosted on GitHub Pages from the `main` branch. Push to `main` to publish.
