import express from 'express';
import puppeteer from 'puppeteer';
import { startFlow, desktopConfig } from 'lighthouse';

const app = express();
const PORT = 3000;

// Safely close Puppeteer and terminate all Chrome pages & child processes on Windows
async function closeBrowserSafely(browser, timeoutMs = 2500) {
  if (!browser) return;
  try {
    const pages = await browser.pages().catch(() => []);
    for (const p of pages) {
      await p.close().catch(() => {});
    }
  } catch (e) {}

  let isClosed = false;
  const closePromise = browser.close().then(() => { isClosed = true; }).catch(() => {});
  const timeoutPromise = new Promise(resolve => setTimeout(resolve, timeoutMs));

  await Promise.race([closePromise, timeoutPromise]);

  if (!isClosed) {
    try {
      const proc = browser.process();
      if (proc && !proc.killed) {
        proc.kill('SIGKILL');
      }
    } catch (e) {}
  }
}

// Serve the static HTML file from the "public" folder
app.use(express.static('public'));

// Create the API endpoint that runs the scan
app.get('/scan', async (req, res) => {
  const targetUrl = req.query.url;
  const device = req.query.device === 'desktop' ? 'desktop' : 'mobile';
  const throttling = req.query.throttling || (device === 'desktop' ? 'fast4g' : 'mobile4g');
  const jsSampling = req.query.jsSampling === 'true';
  const agentic = req.query.agentic !== 'false';
  const multiPage = req.query.multiPage === 'true';
  const maxPages = Math.min(Math.max(parseInt(req.query.maxPages || '3', 10), 1), 10);

  if (!targetUrl) {
    return res.status(400).send('URL is required');
  }

  // Support comma-separated, semicolon-separated, or line-separated URLs
  const urlsToScan = targetUrl
    .split(/[\r\n,;]+/)
    .map(u => u.trim())
    .filter(u => Boolean(u))
    .map(u => (/^https?:\/\//i.test(u) ? u : 'https://' + u));

  const primaryUrl = urlsToScan[0];

  console.log(`Starting scan for: ${urlsToScan.join(', ')} [${device.toUpperCase()} | Throttling: ${throttling} | Multi-Page: ${multiPage || urlsToScan.length > 1} | Total URLs: ${urlsToScan.length}]`);

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
    await flow.navigate(primaryUrl, { stepName: `Initial Page: ${new URL(primaryUrl).pathname || '/'}` });

    // Step 2: Agentic Synthetic User Interaction (if enabled)
    if (agentic) {
      console.log(`Running Agentic interaction timespan for ${primaryUrl}...`);
      await flow.startTimespan({ stepName: 'Agentic User Interaction & Scroll Telemetry' });
      await page.evaluate(() => window.scrollBy({ top: 800, behavior: 'smooth' }));
      await new Promise(resolve => setTimeout(resolve, 800));
      await page.evaluate(() => window.scrollBy({ top: -800, behavior: 'smooth' }));
      await new Promise(resolve => setTimeout(resolve, 400));
      await flow.endTimespan();
    }

    // Step 3: Multi-Page Scan (explicit user URLs or auto-discovered sub-pages)
    if (urlsToScan.length > 1) {
      const limit = Math.min(urlsToScan.length, 25); // allow up to 25 custom URLs
      for (let i = 1; i < limit; i++) {
        const nextUrl = urlsToScan[i];
        console.log(`Scanning user URL (${i + 1}/${limit}): ${nextUrl}`);
        try {
          await flow.navigate(nextUrl, { stepName: `Page ${i + 1}: ${new URL(nextUrl).pathname || nextUrl}` });
        } catch (pageErr) {
          console.warn(`Failed to audit page ${nextUrl}:`, pageErr.message);
        }
      }
    } else if (multiPage) {
      console.log(`Discovering sub-pages for multi-page audit on ${primaryUrl} (limit: ${maxPages - 1})...`);
      const origin = new URL(primaryUrl).origin;
      const discoveredSubPages = await page.evaluate((orig, limit) => {
        const anchors = Array.from(document.querySelectorAll('a[href]'));
        const found = [];
        for (const a of anchors) {
          try {
            const parsed = new URL(a.href, window.location.origin);
            if (parsed.origin === orig && parsed.pathname !== '/' && parsed.pathname !== window.location.pathname) {
              if (!parsed.pathname.match(/\.(pdf|zip|png|jpe?g|svg|webp|mp4|gif|ico|woff2?|css|js)$/i) && !parsed.hash) {
                if (!found.includes(parsed.href)) {
                  found.push(parsed.href);
                }
              }
            }
          } catch(e) {}
        }
        return found.slice(0, limit);
      }, origin, maxPages - 1);

      let pageIndex = 2;
      for (const subUrl of discoveredSubPages) {
        console.log(`Scanning discovered sub-page (${pageIndex}): ${subUrl}`);
        try {
          await flow.navigate(subUrl, { stepName: `Sub-Page ${pageIndex}: ${new URL(subUrl).pathname}` });
          pageIndex++;
        } catch (subErr) {
          console.warn(`Failed to audit subpage ${subUrl}:`, subErr.message);
        }
      }
    }

    // Generate the report as an HTML string
    const htmlReport = await flow.generateReport();
    
    // Send the raw HTML directly to the browser
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(htmlReport);
    
    console.log(`Scan complete for: ${primaryUrl}`);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).send(`An error occurred while scanning the website: ${error.message || error}`);
    }
  } finally {
    if (browser) {
      // Clean up browser safely in background without blocking response flush or hanging the handler
      closeBrowserSafely(browser).catch(() => {});
    }
  }
});

app.listen(PORT, () => {
  console.log(`Web server running! Open http://localhost:${PORT} in your browser.`);
});