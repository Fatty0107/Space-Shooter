# Starfall — Space Shooter

A full-screen, single-player survival space shooter. Fly through the asteroid belt, blast hostile ships and bosses, collect hull repairs and temporary power-ups, and set a high score.

Choose one of four flight levels before launch:

- **Easy:** slower waves, lighter enemy fire, and more supplies
- **Medium:** balanced survival run
- **Difficult:** denser waves, faster fire, and tougher bosses
- **Impossible:** relentless enemies, scarce supplies, and the highest score multiplier

Your score multiplier increases with each level. The top five runs are saved locally with their level and date.

## Play

- **Move:** `W`, `A`, `S`, `D` or the arrow keys
- **Fire:** hold `Space`
- **Pause / resume:** `P` or `Escape`
- **Touch:** drag your ship and keep a finger down to fire

The ship can take five hits. Hearts repair hull damage; rapid-fire and shield pickups grant temporary boosts. Scores and the top five runs are saved in your browser.

## Run locally

```sh
npm install
npm run dev
```

## Build

```sh
npm run build
```

This project is configured for static Vercel deployment.
