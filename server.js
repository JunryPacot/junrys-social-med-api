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
            body { font-family: Arial, sans-serif; padding: 20px; background: #f8f9fa; color: #333; max-width: 800px; margin: 0 auto; }
            h1 { color: #007bff; text-align: center; }
            .input-group { display: flex; flex-direction: column; align-items: center; gap: 10px; margin-bottom: 20px; }
            input[type="url"] { width: 100%; max-width: 500px; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 16px; box-sizing: border-box; }
            button { padding: 12px 24px; background: #007bff; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; transition: background 0.3s; }
            button:hover { background: #0056b3; }
            pre { background: #f4f4f4; padding: 15px; border-radius: 8px; white-space: pre-wrap; font-family: monospace; max-height: 400px; overflow-y: auto; margin-top: 20px; text-align: left; }
            .status { text-align: center; font-weight: bold; margin: 10px 0; }
            .success { color: green; }
            .error { color: red; }
        </style>
    </head>
    <body>
        <h1>🎥 Universal Social Media Downloader API Tester</h1>
        <p style="text-align: center;">Paste any video URL (TikTok, Facebook, Instagram, Twitter, YouTube, or even unknown links) and test extraction.</p>
        <div class="input-group">
            <input type="url" id="urlInput" placeholder="e.g., https://www.tiktok.com/@user/video/123 or https://twitter.com/elonmusk/status/123456">
            <button onclick="testAPI()">Test API</button>
        </div>
        <div id="status" class="status"></div>
        <pre id="result">Results will appear here... (Supports all platforms universally!)</pre>
        <script>
            async function testAPI() {
                const input = document.getElementById('urlInput');
                const result = document.getElementById('result');
                const status = document.getElementById('status');
                if (!input.value.trim()) {
                    status.innerHTML = '<span class="error">❌ Please enter a valid URL first!</span>';
                    return;
                }
                status.innerHTML = '<span style="color: orange;">⏳ Loading... (May take 30-45s on first use)</span>';
                result.textContent = '';
                try {
                    const encodedUrl = encodeURIComponent(input.value);
                    const response = await fetch('/api/alldl?url=' + encodedUrl);
                    if (!response.ok) throw new Error('HTTP ' + response.status + ' - Check logs');
                    const data = await response.json();
                    const statusMsg = data.status ? '<span class="success">✅ Success!</span>' : '<span class="error">❌ Failed</span>';
                    status.innerHTML = statusMsg + \` (Platform: \${data.data?.platform || 'Unknown'})\`;
                    result.textContent = JSON.stringify(data, null, 2);
                } catch (error) {
                    status.innerHTML = '<span class="error">❌ Network/API Error</span>';
                    result.textContent = 'Error Details: ' + error.message + '\\n\\nOpen DevTools (F12 > Console) for more info.';
                    console.error('API Test Error:', error);
                }
            }
            // Pre-fill example on load
            window.onload = () => {
                document.getElementById('urlInput').value = 'https://www.tiktok.com/@duetwithai/video/7401234567890123456';
            };
            // Enter key support
            document.getElementById('urlInput').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') testAPI();
            });
        </script>
    </body>
    </html>
  `);
});

// Middleware (after root)
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));

// Universal API endpoint with TikTok Lite fix
app.get('/api/alldl', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.json({ status: false, error: 'URL parameter required' });
  }

  const platform = detectPlatform(url);

  try {
    const ytdlpPath = path.join(__dirname, 'bin/yt-dlp');
    if (!fs.existsSync(ytdlpPath)) {
      return res.json({ status: false, error: 'Tool not installed—redeploy service' });
    }

    // Universal base command
    let command = `${ytdlpPath} --dump-json --no-download --format "best[height<=720][ext=mp4]/best[ext=mp4]/best" --no-warnings --verbose `;

    // Light TikTok fix (Lite app URLs need HTTPS skip + guest mode)
    if (platform === 'TikTok' || url.includes('tiktok.com')) {
      command += `--extractor-args "tiktok:skip_https=true,guest=true" `;
    }

    command += `"${url}"`;

    console.log(`yt-dlp run for ${platform || 'Unknown'}: ${command}`);

    exec(command, { timeout: 45000 }, (error, stdout, stderr) => {
      if (error || stderr || !stdout.trim()) {
        console.error(`yt-dlp ${platform || 'Unknown'} error:`, stderr || error);
        return res.json({ status: false, error: 'API_REQUEST_FAILED' });
      }

      try {
        const videoInfo = JSON.parse(stdout.trim());
        let videoUrl = videoInfo.url;
        if (!videoUrl && videoInfo.formats && videoInfo.formats.length > 0) {
          const mp4Format = videoInfo.formats.find(f => 
            f.ext === 'mp4' && f.vcodec !== 'none' && (f.height <= 720 || !f.height)
          );
          videoUrl = mp4Format ? mp4Format.url : 
                     videoInfo.formats.find(f => f.ext === 'mp4')?.url || 
                     videoInfo.formats[0]?.url;
        }
        videoUrl = videoUrl || videoInfo.webpage_url || videoInfo.original_url;

        res.json({
          status: true,
          data: {
            videoUrl: videoUrl,
            platform: platform || 'Unknown'
          }
        });
      } catch (parseError) {
        console.error('Parse error:', parseError);
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
  return 'Unknown'; // For all others (Vimeo, Dailymotion, etc.)
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
