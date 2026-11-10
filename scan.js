import fs from 'fs';
import puppeteer from 'puppeteer';
import { startFlow } from 'lighthouse';

async function runScan() {
  const targetUrl = process.argv[2] || 'https://github.com';
  console.log(`Starting scan for: ${targetUrl}`);

  let browser;
  try {
    console.log('Launching headless browser...');
    browser = await puppeteer.launch({ 
      headless: true,
      pipe: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    const page = await browser.newPage();

    const flow = await startFlow(page, { name: `Scan for ${targetUrl}` });

    console.log(`Navigating to ${targetUrl}...`);
    await flow.navigate(targetUrl, { stepName: 'Page Load' });

    console.log('Generating Lighthouse report...');
    const htmlReport = await flow.generateReport();
    const outputFile = 'report.html';
    fs.writeFileSync(outputFile, htmlReport);

    console.log(`Done! Open ${outputFile} to view the results.`);
  } catch (error) {
    console.error('Scan failed:', error);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

runScan();