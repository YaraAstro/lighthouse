import express from 'express';
import puppeteer from 'puppeteer';
import { startFlow } from 'lighthouse';

const app = express();
const PORT = 3000;

// Serve the static HTML file from the "public" folder
app.use(express.static('public'));

// Create the API endpoint that runs the scan
app.get('/scan', async (req, res) => {
  const targetUrl = req.query.url;
  
  if (!targetUrl) {
    return res.status(400).send('URL is required');
  }

  console.log(`Starting scan for: ${targetUrl}`);

  try {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    const flow = await startFlow(page, { name: `Scan for ${targetUrl}` });

    await flow.navigate(targetUrl, { stepName: 'Page Load' });
    
    await browser.close();

    // Generate the report as an HTML string
    const htmlReport = await flow.createReport();
    
    // Send the raw HTML directly to the browser
    res.setHeader('Content-Type', 'text/html');
    res.send(htmlReport);
    
    console.log(`Scan complete for: ${targetUrl}`);
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while scanning the website.');
  }
});

app.listen(PORT, () => {
  console.log(`Web server running! Open http://localhost:${PORT} in your browser.`);
});