// Import necessary packages using require()
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

// Initialize the express application
const app = express();
// Define the port the server will run on. Use the environment's port or default to 3000.
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- API Endpoint: /api/get-info ---
// This endpoint finds the link and sends it back as JSON.
app.post('/api/get-info', async (req, res) => {
    const { teraboxUrl } = req.body;

    const teraboxUrlPattern = /^https:\/\/(?:www\.)?terabox\.com\/s\/\w+/;
    if (!teraboxUrl || !teraboxUrlPattern.test(teraboxUrl)) {
        return res.status(400).json({ success: false, message: "Invalid or missing TeraBox URL." });
    }

    try {
        const { data: htmlContent } = await axios.get(teraboxUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            }
        });

        const $ = cheerio.load(htmlContent);
        let directVideoUrl = '';
        let videoTitle = $('title').text().trim();

        $('script').each((index, element) => {
            const scriptContent = $(element).html();
            if (scriptContent && scriptContent.includes('dlink')) {
                const match = scriptContent.match(/"dlink":"(.*?)"/);
                if (match && match[1]) {
                    directVideoUrl = match[1];
                    return false;
                }
            }
        });
        
        if (directVideoUrl) {
            // Success! Send the information back to the website.
            res.json({
                success: true,
                directLink: directVideoUrl,
                title: videoTitle || "TeraBox Video"
            });
        } else {
            return res.status(404).json({ success: false, message: "Could not find a video file at the provided URL." });
        }

    } catch (error) {
        console.error("Error processing request:", error.message);
        return res.status(500).json({ success: false, message: "An internal server error occurred." });
    }
});

// --- Start the Server ---
app.listen(PORT, () => {
    console.log(`Server is running and listening on port ${PORT}`);
});

