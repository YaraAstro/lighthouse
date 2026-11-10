# Lighthouse site scan

A small Node.js script that runs a Lighthouse user flow against the Elandro Furniture website and saves an HTML report.

## Requirements

- Node.js with npm
- The project dependencies installed

## Run

```sh
npm install
node scan.js
```

The script launches Puppeteer, scans the homepage and `/about` page at `https://elandrofurntiture.netlify.app/`, and writes `elandro-report.html` in the project directory. Open that file in a browser to view the report.

## License

This project is licensed under the ISC License. See [LICENSE](./LICENSE).
