import fs from 'fs';
import puppeteer from 'puppeteer';
import { startFlow } from 'lighthouse';

async function runScan() {
  const cliArgs = process.argv.slice(2);
  const targetUrls = cliArgs.length > 0 ? cliArgs : ['https://github.com'];
  console.log(`Starting multi-page scan for: ${targetUrls.join(', ')}`);

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

    const flow = await startFlow(page, { name: `Multi-Page Audit: ${targetUrls[0]}` });

    for (let i = 0; i < targetUrls.length; i++) {
      const url = targetUrls[i];
      console.log(`Scanning page (${i + 1}/${targetUrls.length}): ${url}...`);
      await flow.navigate(url, { stepName: `Page: ${new URL(url).pathname || url}` });
    }

    console.log('Generating unified multi-page Lighthouse report...');
    const htmlReport = await flow.generateReport();
    const outputFile = 'report.html';
    fs.writeFileSync(outputFile, htmlReport);

    console.log(`Done! Open ${outputFile} to view the multi-page results.`);
  } catch (error) {
    console.error('Scan failed:', error);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

runScan();