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

// --- Status Endpoint ---
app.get('/api/status', (req, res) => {
    res.status(200).json({ status: 'online', version: '1.4.0' }); // Updated version
});

// Main endpoint to get video info
app.post('/api/get-info', async (req, res) => {
    const { teraboxUrl } = req.body;

    const teraboxUrlPattern = /^https:\/\/(?:www\.)?(terabox\.com|1024tera\.com|teraboxapp\.com)\//;
    if (!teraboxUrl || !teraboxUrlPattern.test(teraboxUrl)) {
        return res.status(400).json({ success: false, message: "Invalid or unsupported TeraBox URL." });
    }

    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Connection': 'keep-alive',
            'Referer': 'https://www.terabox.com/', // Added Referer for better authenticity
        };

        const response = await axios.get(teraboxUrl, { headers });
        const $ = cheerio.load(response.data);

        let directLink = '';
        let title = '';

        // --- UPDATED: More Advanced Scraping Logic ---
        // This is the "new map". It tries multiple modern methods to find the video link.
        
        // Method 1: Look for JSON data within script tags (very common pattern)
        $('script').each((i, el) => {
            const scriptContent = $(el).html();
            if (scriptContent && scriptContent.includes('dlink')) {
                 // Try to find a direct link ("dlink")
                 const match = scriptContent.match(/"dlink":"(.*?)"/);
                 if (match && match[1]) {
                    directLink = match[1].replace(/\\/g, '');
                    return false; // exit the loop
                 }
            }
             if (scriptContent && scriptContent.includes('play_url')) {
                 // Fallback to "play_url" if dlink is not found
                const match = scriptContent.match(/"play_url":"(.*?)"/);
                if (match && match[1]) {
                    directLink = match[1].replace(/\\/g, '');
                    return false; // exit the loop
                }
            }
        });

        // Method 2: If the first method fails, search for a generic high-quality video URL.
        if (!directLink) {
            const pageContent = response.data;
            const videoUrlMatch = pageContent.match(/https?:\/\/[^"]+?\.mp4[^"]*/);
            if (videoUrlMatch && videoUrlMatch[0]) {
                directLink = videoUrlMatch[0];
            }
        }
        
        // Find the title from the <title> tag in the head
        title = $('head > title').text().trim();
        if (!title || title.toLowerCase().includes('terabox')) {
            // Fallback title if the head title is generic or not found
            title = 'TeraBox Video';
        }

        if (directLink) {
            res.json({
                success: true,
                title: title,
                directLink: directLink
            });
        } else {
            // This error now triggers if all new methods fail.
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

