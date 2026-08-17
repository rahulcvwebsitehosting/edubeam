<p align="center">
  <a href="https://github.com/rahulcvwebsitehosting/edubeam">
    <img src="src/assets/logo.svg" alt="EduBeam logo" width="96" height="96">
  </a>
</p>

<h1 align="center">EduBeam</h1>

<p align="center">
  <strong>A clean, browser-based workspace for beam and 2D structural analysis.</strong><br>
  Build a model, apply loads, and inspect reactions, displacement, shear, and moment results in real time.
</p>

## About this project

This repository contains my streamlined version of EduBeam, redesigned around a faster and more approachable workflow. The default **Quick Beam** workspace keeps common beam calculations simple, while **Advanced Mode** preserves detailed finite-element modelling for beams, trusses, and frames.

The application runs entirely in the browser. Models stay on the user's device unless they are deliberately exported or shared.

## Highlights

- Guided Quick Beam setup for span, supports, material, section, and loading
- Instant reactions, displacement, shear-force, and bending-moment results
- Advanced 2D modelling for beams, trusses, and frames
- Point, distributed, thermal, settlement, and prescribed-displacement loads
- Deformed shapes and N-V-M result diagrams
- Shareable model URLs and JSON import/export
- Responsive, multilingual interface
- Installable Progressive Web App

## Technology

- Vue 3 and TypeScript
- Vite
- Vuetify
- Pinia
- Vitest
- VitePress documentation
- Client-side finite-element solver

## Run locally

Node.js 20.x is recommended.

```bash
git clone https://github.com/rahulcvwebsitehosting/edubeam.git
cd edubeam
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Create the production app in `dist/` |
| `npm run test:run` | Run the test suite once |
| `npm run lint` | Check and automatically fix lint issues |
| `npm run docs:dev` | Start the documentation site locally |
| `npm run docs:build` | Build the documentation site |

## Deploy to Vercel

The repository is ready for Vercel and includes [`vercel.json`](vercel.json). Import the GitHub repository into Vercel and use these settings:

| Setting | Value |
| --- | --- |
| Framework preset | Vite |
| Install command | `npm install` |
| Build command | `npm run build` |
| Output directory | `dist` |

The included rewrite rule supports direct navigation and browser refreshes in the single-page application.

## Project structure

```text
src/                 Application source
src/components/      Modelling and result UI
src/store/           Application state
src/tests/           Automated tests
docs/                VitePress documentation
public/              Static assets
vercel.json          Vercel deployment configuration
```

## Contributing

Bug reports and focused pull requests are welcome. Use the repository's [issue tracker](https://github.com/rahulcvwebsitehosting/edubeam/issues) for reproducible bugs and feature proposals.

## License

This project is distributed under the GPL-3.0 license. See [`LICENSE`](LICENSE) for the complete terms.
