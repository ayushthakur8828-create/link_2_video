// server.js
const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Optional API key protection
const API_KEY = process.env.API_KEY || ''; // set this on Render for safety

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*' // change to your domain in production
}));
app.use(express.json());

app.get('/api/status', (req, res) => {
  res.status(200).json({ status: 'online', version: '1.4.0' });
});

app.post('/api/get-info', async (req, res) => {
  if (API_KEY) {
    const key = req.headers['x-api-key'] || req.query.api_key;
    if (!key || key !== API_KEY) {
      return res.status(401).json({ success: false, message: 'Missing or invalid API key' });
    }
  }

  const { teraboxUrl } = req.body;
  const teraboxUrlPattern = /^https:\/\/(?:www\.)?(terabox\.com|1024tera\.com|teraboxapp\.com)\//;
  if (!teraboxUrl || !teraboxUrlPattern.test(teraboxUrl)) {
    return res.status(400).json({ success: false, message: 'Invalid or unsupported TeraBox URL.' });
  }

  let browser = null;
  try {
    // Launch Puppeteer suitable for cloud containers
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ],
      defaultViewport: { width: 1280, height: 800 }
    });

    const page = await browser.newPage();

    // Reduce bot detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.terabox.com/'
    });

    await page.goto(teraboxUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    // optional quick wait for video tag
    try { await page.waitForSelector('video', { timeout: 7000 }); } catch (e) {}

    // extraction inside the page
    let videoData = await page.evaluate(() => {
      let directLink = '';
      let title = document.title || 'TeraBox Video';

      const v = document.querySelector('video');
      if (v && v.src) directLink = v.src;

      if (!directLink) {
        const scripts = Array.from(document.querySelectorAll('script'));
        for (const s of scripts) {
          const text = s.innerText || s.textContent || '';
          if (text.includes('dlink')) {
            const m = text.match(/"dlink"\s*:\s*"(.*?)"/);
            if (m && m[1]) { directLink = m[1].replace(/\\+/g, ''); break; }
          }
          if (!directLink && text.includes('play_url')) {
            const m2 = text.match(/"play_url"\s*:\s*"(.*?)"/);
            if (m2 && m2[1]) { directLink = m2[1].replace(/\\+/g, ''); break; }
          }
        }
      }

      if (!directLink) {
        const body = document.body.innerHTML || '';
        const mp4 = body.match(/https?:\/\/[^"'\\s>]+?\.mp4[^"'\\s>]*/);
        if (mp4 && mp4[0]) directLink = mp4[0];
      }

      return { directLink, title };
    });

    // fallback: do regex on the final HTML (node side)
    if (!videoData.directLink) {
      const html = await page.content();
      const match = html.match(/https?:\/\/[^"']+?\.mp4[^"']*/);
      if (match && match[0]) videoData.directLink = match[0];
    }

    // debug files if requested
    if (process.env.DEBUG_PUPPETEER === 'true') {
      const debugDir = path.resolve(__dirname, 'debug');
      if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir);
      await page.screenshot({ path: path.join(debugDir, `screenshot-${Date.now()}.png`), fullPage: true });
      fs.writeFileSync(path.join(debugDir, `page-${Date.now()}.html`), await page.content());
    }

    if (videoData.directLink) {
      res.json({ success: true, title: videoData.title, directLink: videoData.directLink });
    } else {
      res.status(404).json({ success: false, message: 'Could not find video link. TeraBox may have updated its site structure.' });
    }
  } catch (err) {
    console.error('Puppeteer error:', err && err.message ? err.message : err);
    res.status(500).json({ success: false, message: 'Failed to process the URL. See server logs for details.' });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
