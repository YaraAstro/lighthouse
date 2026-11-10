# Lighthouse Web Performance Scanner

An automated web performance and SEO audit suite powered by **Puppeteer** and **Google Lighthouse**, featuring an interactive web dashboard and CLI multi-page runner.

[![GitHub Repo](https://img.shields.io/badge/GitHub-YaraAstro%2Flighthouse-38bdf8?style=flat&logo=github)](https://github.com/YaraAstro/lighthouse)

## Features

- ⚡ **Interactive Web Dashboard**: Beautiful dark-mode interface with live scanning radar, 5-step progress checklist, real-time timer, and rotating Web Vitals tips.
- 📱 **Mobile & Desktop Emulation**: One-click device toggle with tailored viewport resolutions, user agents, and device scale factors.
- 🤖 **Agentic Browsing Telemetry**: Multi-step Lighthouse user flow executing autonomous synthetic scrolling and interaction timespans.
- ⏱️ **Advanced Throttling Profiles**: Customizable network & CPU throttling (Simulated 4G, Fast 4G / Cable, Direct LAN / No Throttling, Slow 3G).
- 🔬 **V8 JS Execution Sampling**: High-resolution 100µs V8 CPU profiler sampling for deep execution flamecharts.
- 📊 **Embedded Report Viewer**: Inspect reports inline with fullscreen toggle, new tab export, and one-click HTML download.
- 🎯 **Presets & History**: Quick-target presets and local storage scan history.
- 🛠️ **Server & CLI Modes**: Run as a local Express web server or as an automated CLI script.

## Getting Started

### 1. Install Dependencies

```sh
npm install
```

### 2. Start the Web Scanner UI

```sh
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Run the CLI Script (Multi-Page Scan)

```sh
npm run scan
```

The script launches Puppeteer, scans the target pages, and writes `elandro-report.html` to the project directory.

## Repository

- GitHub: [https://github.com/YaraAstro/lighthouse](https://github.com/YaraAstro/lighthouse)

## License

This project is licensed under the ISC License. See [LICENSE](./LICENSE).
