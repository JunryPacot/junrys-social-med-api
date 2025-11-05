const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Inline root route with embedded test UI (no static files needed)
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Test Social Media Downloader API</title>
        <style>
            body { font-family: Arial, sans-serif; padding: 20px; background: #f8f9fa; color: #333; }
            h1 { color: #007bff; }
            input[type="url"] { width: 80%; max-width: 400px; padding: 10px; border: 1px solid #ddd; border-radius: 5px; font-size: 16px; }
            button { padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; margin-left: 10px; }
            button:hover { background: #0056b3; }
            pre { background: #f4f4f4; padding: 15px; border-radius: 5px; white-space: pre-wrap; font-family: monospace; max-height: 300px; overflow-y: auto; margin-top: 20px; }
        </style>
    </head>
    <body>
        <h1>🎥 Social Media Downloader API Tester</h1>
        <p>Paste a URL from TikTok, Instagram, YouTube, etc., and click Test to see the JSON response.</p>
        <input type="url" id="urlInput" placeholder="e.g., https://www.tiktok.com/@user/video/123456789">
        <button onclick="testAPI()">Test API</button>
        <pre id="result">Results will appear here...</pre>
        <script>
            async function testAPI() {
                const input = document.getElementById('urlInput');
                const result = document.getElementById('result');
                if (!input.value.trim()) {
                    result.textContent = '❌ Please enter a valid URL first!';
                    return;
                }
                result.textContent = '⏳ Loading... (First request may take 30s to wake the service)';
                try {
                    const encodedUrl = encodeURIComponent(input.value);
                    const response = await fetch('/api/alldl?url=' + encodedUrl);
                    if (!response.ok) throw new Error('HTTP ' + response.status);
                    const data = await response.json();
                    result.textContent = JSON.stringify(data, null, 2);
                } catch (error) {
                    result.textContent = '❌ Error: ' + error.message + '\\n\\nCheck Render logs or try a different URL. Console (F12) for details.';
                    console.error('API Test Error:', error);
                }
            }
            // Auto-test example on load (optional)
            window.onload = () => {
                document.getElementById('urlInput').value = 'https://www.tiktok.com/@lana.k.social/video/7567406030359923990';
            };
        </script>
    </body>
    </html>
  `);
});

// Middleware (after root)
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));

// Your API endpoint (unchanged)
app.get('/api/alldl', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.json({ status: false, error: 'URL parameter required' });
  }

  try {
    const ytdlpPath = path.join(__dirname, 'bin/yt-dlp');
    if (!fs.existsSync(ytdlpPath)) {
      return res.json({ status: false, error: 'Tool not installed—redeploy service' });
    }

    const command = `${ytdlpPath} --dump-json --no-download "${url}"`;

    exec(command, (error, stdout, stderr) => {
      if (error || stderr || !stdout.trim()) {
        console.error('yt-dlp error:', stderr || error);
        return res.json({ status: false, error: 'API_REQUEST_FAILED' });
      }

      try {
        const videoInfo = JSON.parse(stdout.trim());
        const platform = detectPlatform(url);
        const videoUrl = videoInfo.url || videoInfo.webpage_url || videoInfo.formats?.[0]?.url;

        res.json({
          status: true,
          data: {
            videoUrl: videoUrl,
            platform: platform
          }
        });
      } catch (parseError) {
        res.json({ status: false, error: 'Invalid video data' });
      }
    });
  } catch (err) {
    console.error(err);
    res.json({ status: false, error: 'INTERNAL_ERROR' });
  }
});

function detectPlatform(url) {
  if (url.includes('tiktok.com')) return 'TikTok';
  if (url.includes('instagram.com')) return 'Instagram';
  if (url.includes('twitter.com') || url.includes('x.com')) return 'Twitter';
  if (url.includes('facebook.com')) return 'Facebook';
  if (url.includes('youtube.com')) return 'YouTube';
  return 'Unknown';
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
