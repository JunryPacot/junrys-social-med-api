const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;


app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});


app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));


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
