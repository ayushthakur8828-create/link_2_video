// Import necessary packages using require()
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Allows your website to talk to this server
app.use(express.json()); // Allows server to read JSON data from requests

// --- NEW: Status Endpoint ---
// This allows the website to check if the server is online.
app.get('/api/status', (req, res) => {
    res.status(200).json({ status: 'online', version: '1.1.0' });
});

// Main endpoint to get video info
app.post('/api/get-info', async (req, res) => {
    const { teraboxUrl } = req.body;

    // This pattern now accepts both terabox.com and 1024tera.com domains.
    const teraboxUrlPattern = /^https:\/\/(?:www\.)?(terabox\.com|1024tera\.com)\//;
    if (!teraboxUrl || !teraboxUrlPattern.test(teraboxUrl)) {
        return res.status(400).json({ success: false, message: "Invalid or unsupported TeraBox/1024Tera URL." });
    }

    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
            'Connection': 'keep-alive',
            'Host': new URL(teraboxUrl).hostname,
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
        };

        const response = await axios.get(teraboxUrl, { headers });
        const $ = cheerio.load(response.data);

        // --- UPDATED: New Scraping Logic ---
        // This is the "new map". It looks for the video link in the way the current TeraBox site is built.
        let directLink = '';
        let title = '';

        // Try finding the link in a common script tag location first.
        $('script').each((i, el) => {
            const scriptContent = $(el).html();
            if (scriptContent && scriptContent.includes('dlink')) {
                 const match = scriptContent.match(/"dlink":"(.*?)"/);
                 if(match && match[1]) {
                    directLink = match[1].replace(/\\/g, '');
                    return false; // exit the loop
                 }
            }
        });

        // If not found, try another common pattern.
        if (!directLink) {
             $('script').each((i, el) => {
                const scriptContent = $(el).html();
                if (scriptContent && scriptContent.includes('v.m3u8')) {
                    const match = scriptContent.match(/play_url":"(.*?)"/);
                    if(match && match[1]) {
                        directLink = match[1].replace(/\\/g, '');
                        return false;
                    }
                }
            });
        }
        
        // Find the title
        title = $('head > title').text().trim();

        if (directLink) {
            res.json({
                success: true,
                title: title || 'TeraBox Video',
                directLink: directLink
            });
        } else {
            // This error now triggers if the "new map" also fails.
            res.status(404).json({ success: false, message: "Could not find video link. TeraBox may have updated its site structure again." });
        }

    } catch (error) {
        console.error("Error fetching Terabox URL:", error.message);
        res.status(500).json({ success: false, message: "Failed to fetch content from the URL. The server may be blocked or the link is invalid." });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running and listening on port ${PORT}`);
});

