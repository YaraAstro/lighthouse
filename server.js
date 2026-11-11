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

// Helper to safely extract pathname from URL
function getSafePathname(urlStr) {
  try {
    return new URL(urlStr).pathname || '/';
  } catch (e) {
    return urlStr;
  }
}

// Helper to safely extract origin from URL
function getSafeOrigin(urlStr) {
  try {
    return new URL(urlStr).origin;
  } catch (e) {
    return null;
  }
}

// Executes the 3 core Lighthouse User Flow modes for a given page:
// 1. Mode 1: Navigation (Cold load, Core Web Vitals, category scoring)
// 2. Mode 2: Timespan (Interactive scroll & user journey telemetry)
// 3. Mode 3: Snapshot (Rendered DOM & accessibility state)
async function auditPageWithTripleModes(flow, page, url, pageLabel, isAgentic = true) {
  const cleanLabel = pageLabel || getSafePathname(url);

  // Mode 1: Navigation (Cold Load & CWV)
  console.log(`  [Mode 1/3: Navigation] Auditing page load for: ${url}`);
  await flow.navigate(url, { stepName: `🧭 Navigation: ${cleanLabel} (Cold Load & CWV)` });

  // Mode 2: Timespan (Interaction & Scroll Telemetry)
  console.log(`  [Mode 2/3: Timespan] Auditing interaction & scroll for: ${url}`);
  await flow.startTimespan({ stepName: `⏱️ Timespan: ${cleanLabel} (Interaction & Scroll Telemetry)` });
  try {
    await page.evaluate(() => {
      window.scrollBy({ top: Math.min(window.innerHeight, (document.body?.scrollHeight || 1000) / 2), behavior: 'smooth' });
    });
    await new Promise(resolve => setTimeout(resolve, 500));
    if (isAgentic) {
      await page.evaluate(() => {
        const interactive = document.querySelector('button, a[href], input, [role="button"]');
        if (interactive) interactive.focus();
      });
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    await page.evaluate(() => {
      window.scrollBy({ top: -Math.min(window.innerHeight, (document.body?.scrollHeight || 1000) / 2), behavior: 'smooth' });
    });
    await new Promise(resolve => setTimeout(resolve, 300));
  } catch (e) {
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  await flow.endTimespan();

  // Mode 3: Snapshot (Post-interaction DOM & Accessibility state)
  console.log(`  [Mode 3/3: Snapshot] Capturing rendered DOM & A11y snapshot for: ${url}`);
  await flow.snapshot({ stepName: `📸 Snapshot: ${cleanLabel} (DOM & A11y State)` });
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

  // Build explicit Lighthouse config for Desktop or Mobile
  const flowConfig = device === 'desktop' ? {
    extends: 'lighthouse:default',
    settings: {
      ...desktopConfig.settings,
      throttling: throttlingSettings
    }
  } : {
    extends: 'lighthouse:default',
    settings: {
      formFactor: 'mobile',
      throttling: throttlingSettings,
      screenEmulation: {
        mobile: true,
        width: 412,
        height: 823,
        deviceScaleFactor: 2.625,
        disabled: false
      }
    }
  };

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

    // Explicitly apply device viewport and user-agent to Puppeteer page
    if (device === 'desktop') {
      await page.setViewport({ width: 1350, height: 940, deviceScaleFactor: 1 });
      if (desktopConfig.settings?.emulatedUserAgent) {
        await page.setUserAgent(desktopConfig.settings.emulatedUserAgent);
      }
    } else {
      await page.setViewport({ width: 412, height: 823, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
    }
    
    const flowOptions = {
      name: `Audit for ${primaryUrl} (${device.toUpperCase()})`,
      config: flowConfig
    };

    if (jsSampling) {
      flowOptions.flags = {
        additionalTraceCategories: 'disabled-by-default-v8.cpu_profiler'
      };
    }

    const flow = await startFlow(page, flowOptions);

    // Audit Primary Page with all 3 modes: Navigation, Timespan, Snapshot
    console.log(`Auditing primary page with Triple Modes (Navigation + Timespan + Snapshot): ${primaryUrl}`);
    await auditPageWithTripleModes(flow, page, primaryUrl, `Initial Page (${getSafePathname(primaryUrl)})`, agentic);

    // Multi-Page Scan: Audit each additional URL with all 3 modes
    if (urlsToScan.length > 1) {
      const limit = Math.min(urlsToScan.length, 25); // allow up to 25 custom URLs
      for (let i = 1; i < limit; i++) {
        const nextUrl = urlsToScan[i];
        console.log(`Auditing user URL (${i + 1}/${limit}) with Triple Modes: ${nextUrl}`);
        try {
          await auditPageWithTripleModes(flow, page, nextUrl, `Page ${i + 1} (${getSafePathname(nextUrl)})`, agentic);
        } catch (pageErr) {
          console.warn(`Failed to audit page ${nextUrl}:`, pageErr.message);
        }
      }
    } else if (multiPage) {
      console.log(`Discovering sub-pages for multi-page audit on ${primaryUrl} (limit: ${maxPages - 1})...`);
      const origin = getSafeOrigin(primaryUrl);
      if (origin) {
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
          console.log(`Auditing discovered sub-page (${pageIndex}) with Triple Modes: ${subUrl}`);
          try {
            await auditPageWithTripleModes(flow, page, subUrl, `Sub-Page ${pageIndex} (${getSafePathname(subUrl)})`, agentic);
            pageIndex++;
          } catch (subErr) {
            console.warn(`Failed to audit subpage ${subUrl}:`, subErr.message);
          }
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