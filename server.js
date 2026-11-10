import express from 'express';
import puppeteer from 'puppeteer';
import { startFlow, desktopConfig } from 'lighthouse';

const app = express();
const PORT = 3000;

// Serve the static HTML file from the "public" folder
app.use(express.static('public'));

// Create the API endpoint that runs the scan
app.get('/scan', async (req, res) => {
  const targetUrl = req.query.url;
  const device = req.query.device === 'desktop' ? 'desktop' : 'mobile';
  const throttling = req.query.throttling || (device === 'desktop' ? 'fast4g' : 'mobile4g');
  const jsSampling = req.query.jsSampling === 'true';
  const agentic = req.query.agentic !== 'false';

  if (!targetUrl) {
    return res.status(400).send('URL is required');
  }

  console.log(`Starting scan for: ${targetUrl} [${device.toUpperCase()} | Throttling: ${throttling} | JS Sampling: ${jsSampling} | Agentic: ${agentic}]`);

  // Configure throttling profile
  let throttlingSettings;
  if (throttling === 'none') {
    throttlingSettings = {
      rttMs: 0,
      throughputKbps: 0,
      cpuSlowdownMultiplier: 1,
      requestLatencyMs: 0,
      downloadThroughputKbps: 0,
      uploadThroughputKbps: 0
    };
  } else if (throttling === 'fast4g') {
    throttlingSettings = {
      rttMs: 40,
      throughputKbps: 10240,
      cpuSlowdownMultiplier: 1,
      requestLatencyMs: 0,
      downloadThroughputKbps: 0,
      uploadThroughputKbps: 0
    };
  } else if (throttling === 'slow3g') {
    throttlingSettings = {
      rttMs: 400,
      throughputKbps: 400,
      cpuSlowdownMultiplier: 6,
      requestLatencyMs: 0,
      downloadThroughputKbps: 0,
      uploadThroughputKbps: 0
    };
  } else {
    // Default Mobile 4G
    throttlingSettings = {
      rttMs: 150,
      throughputKbps: 1638.4,
      cpuSlowdownMultiplier: 4,
      requestLatencyMs: 0,
      downloadThroughputKbps: 0,
      uploadThroughputKbps: 0
    };
  }

  const settingsOverrides = {
    formFactor: device,
    throttling: throttlingSettings
  };

  if (device === 'desktop') {
    settingsOverrides.screenEmulation = desktopConfig.settings.screenEmulation;
    settingsOverrides.emulatedUserAgent = desktopConfig.settings.emulatedUserAgent;
  }

  const chromeArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu'
  ];

  if (jsSampling) {
    chromeArgs.push('--js-flags=--sampling-interval=100');
  }

  let browser;
  try {
    browser = await puppeteer.launch({ 
      headless: true,
      pipe: true,
      args: chromeArgs
    });
    const page = await browser.newPage();
    
    const flowOptions = {
      name: `Audit for ${targetUrl}`,
      configContext: {
        settingsOverrides
      }
    };

    if (jsSampling) {
      flowOptions.flags = {
        additionalTraceCategories: 'disabled-by-default-v8.cpu_profiler'
      };
    }

    const flow = await startFlow(page, flowOptions);

    // Step 1: Initial Navigation & Page Load
    await flow.navigate(targetUrl, { stepName: 'Navigation & Initial Load' });

    // Step 2: Agentic Synthetic User Interaction (if enabled)
    if (agentic) {
      console.log(`Running Agentic interaction timespan for ${targetUrl}...`);
      await flow.startTimespan({ stepName: 'Agentic User Interaction & Scroll Telemetry' });
      await page.evaluate(() => window.scrollBy({ top: 800, behavior: 'smooth' }));
      await new Promise(resolve => setTimeout(resolve, 800));
      await page.evaluate(() => window.scrollBy({ top: -800, behavior: 'smooth' }));
      await new Promise(resolve => setTimeout(resolve, 400));
      await flow.endTimespan();
    }

    // Generate the report as an HTML string
    const htmlReport = await flow.generateReport();
    
    // Send the raw HTML directly to the browser
    res.setHeader('Content-Type', 'text/html');
    res.send(htmlReport);
    
    console.log(`Scan complete for: ${targetUrl}`);
  } catch (error) {
    console.error(error);
    res.status(500).send(`An error occurred while scanning the website: ${error.message || error}`);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
});

app.listen(PORT, () => {
  console.log(`Web server running! Open http://localhost:${PORT} in your browser.`);
});