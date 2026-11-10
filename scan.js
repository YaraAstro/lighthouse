import fs from 'fs';
import puppeteer from 'puppeteer';
import { startFlow } from 'lighthouse';

async function runScan() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  const flow = await startFlow(page, { name: 'Elandro Furniture Multi-Page Scan' });

  console.log('Scanning Homepage...');
  await flow.navigate('https://elandrofurntiture.netlify.app/', {
    stepName: 'Homepage'
  });

  // Add any other specific pages you want to test here
  console.log('Scanning Shop/About Page...');
  await flow.navigate('https://elandrofurntiture.netlify.app/about', {
    stepName: 'About Page'
  });

  await browser.close();

  console.log('Generating report...');
  const htmlReport = await flow.createReport();
  fs.writeFileSync('elandro-report.html', htmlReport);

  console.log('Done! Open elandro-report.html to see your results.');
}

runScan();