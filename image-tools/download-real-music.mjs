import fs from 'node:fs';
import path from 'node:path';

const audioDir = path.resolve('image-tools/audio');
if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

const PAGES_TO_SCRAPE = [
  { id: 'white-petals', page: 'https://www.free-stock-music.com/keys-of-moon-white-petals.html' },
  { id: 'illusions', page: 'https://www.free-stock-music.com/keys-of-moon-illusions.html' },
  { id: 'cozy-place', page: 'https://www.free-stock-music.com/keys-of-moon-cozy-place.html' },
  { id: 'awakening-dew', page: 'https://www.free-stock-music.com/keys-of-moon-awakening-dew.html' },
  { id: 'le-calme', page: 'https://www.free-stock-music.com/keys-of-moon-le-calme.html' },
  { id: 'after-the-rain', page: 'https://www.free-stock-music.com/keys-of-moon-after-the-rain.html' },
  { id: 'sunset-drive', page: 'https://www.free-stock-music.com/tokyo-music-walker-sunset-drive.html' },
  { id: 'quiet-night', page: 'https://www.free-stock-music.com/tokyo-music-walker-quiet-night.html' },
  { id: 'slowly', page: 'https://www.free-stock-music.com/tokyo-music-walker-slowly.html' },
  { id: 'hope-for-tomorrow', page: 'https://www.free-stock-music.com/tokyo-music-walker-hope-for-tomorrow.html' },
  { id: 'your-little-wings', page: 'https://www.free-stock-music.com/tokyo-music-walker-your-little-wings.html' },
  { id: 'sweet-dreams', page: 'https://www.free-stock-music.com/batchbug-sweet-dreams.html' }
];

async function downloadRealMusic() {
  console.log('Downloading real studio-recorded CC-BY ambient & lo-fi MP3s...');
  
  for (const item of PAGES_TO_SCRAPE) {
    const dest = path.join(audioDir, `${item.id}.mp3`);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 500000) {
      console.log(`✓ Already exists: ${item.id}.mp3 (${Math.round(fs.statSync(dest).size / 1024)} KB)`);
      continue;
    }

    try {
      console.log(`Fetching page: ${item.page}`);
      const res = await fetch(item.page, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      const html = await res.text();
      
      // Look for relative or absolute MP3 path
      const directMatch = html.match(/href='(\/music\/[^']+\.mp3)'/i) || 
                          html.match(/src='(\/music\/[^']+\.mp3)'/i) ||
                          html.match(/https:\/\/[^'"]+\.mp3/i);

      if (directMatch) {
        let mp3Url = directMatch[1] || directMatch[0];
        if (mp3Url.startsWith('/')) mp3Url = 'https://www.free-stock-music.com' + mp3Url;
        console.log(`   Downloading direct MP3: ${mp3Url}`);
        const mp3Res = await fetch(mp3Url, {
          headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': item.page
          }
        });
        const buf = Buffer.from(await mp3Res.arrayBuffer());
        if (buf.length > 500000) {
          fs.writeFileSync(dest, buf);
          console.log(`   ✓ Saved ${item.id}.mp3 (${Math.round(buf.length / 1024)} KB)`);
        } else {
          console.warn(`   ✗ File too small (${buf.length} bytes)`);
        }
      } else {
        console.warn(`   ✗ No direct MP3 link found on page for ${item.id}`);
      }
    } catch (e) {
      console.error(`   ✗ Error downloading ${item.id}:`, e.message);
    }
  }

  console.log('\nAudio library update complete! Total audio files:', fs.readdirSync(audioDir));
}

downloadRealMusic().catch(console.error);
