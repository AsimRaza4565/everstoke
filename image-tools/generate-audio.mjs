import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const audioDir = path.resolve('image-tools/audio');
if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

const MOODS = [
  { name: 'stoic-meditation', filter: 'aevalsrc=sin(216*2*PI*t)*0.3+sin(432*2*PI*t)*0.2+sin(108*2*PI*t)*0.4:d=60,lowpass=f=600,flanger,aecho=0.8:0.88:1000:0.4' },
  { name: 'alpha-waves', filter: 'aevalsrc=sin(100*2*PI*t)*0.35+sin(110*2*PI*t)*0.35+sin(55*2*PI*t)*0.3:d=60,aecho=0.8:0.88:800:0.5' },
  { name: 'celestial-choir', filter: 'aevalsrc=sin(528*2*PI*t)*0.2+sin(660*2*PI*t)*0.2+sin(792*2*PI*t)*0.15+sin(264*2*PI*t)*0.3:d=60,chorus=0.7:0.9:55:0.4:0.25:2,aecho=0.8:0.9:1200:0.5' },
  { name: 'midnight-lofi', filter: 'aevalsrc=sin(146.8*2*PI*t)*0.25+sin(220*2*PI*t)*0.25+sin(293.6*2*PI*t)*0.2+sin(73.4*2*PI*t)*0.3:d=60,lowpass=f=450,aecho=0.8:0.88:500:0.3' },
  { name: 'cosmic-drift', filter: 'aevalsrc=sin(174*2*PI*t)*0.2+sin(285*2*PI*t)*0.2+sin(396*2*PI*t)*0.2+sin(87*2*PI*t)*0.3:d=60,flanger,aecho=0.8:0.9:1500:0.6' },
  { name: 'hyper-focus', filter: 'aevalsrc=sin(120*2*PI*t)*0.4+sin(240*2*PI*t)*0.2+sin(60*2*PI*t)*0.4:d=60,aecho=0.8:0.88:400:0.4' },
  { name: 'golden-hour', filter: 'aevalsrc=sin(330*2*PI*t)*0.25+sin(440*2*PI*t)*0.25+sin(554.3*2*PI*t)*0.2+sin(165*2*PI*t)*0.3:d=60,chorus=0.6:0.8:60:0.3:0.2:2,aecho=0.8:0.88:1000:0.4' },
  { name: 'cinematic-tension', filter: 'aevalsrc=sin(65.4*2*PI*t)*0.4+sin(77.78*2*PI*t)*0.3+sin(130.8*2*PI*t)*0.2:d=60,lowpass=f=350,aecho=0.8:0.88:700:0.5' },
  { name: 'sovereign-pulse', filter: 'aevalsrc=sin(130.8*2*PI*t)*0.3+sin(196*2*PI*t)*0.3+sin(261.6*2*PI*t)*0.2+sin(65.4*2*PI*t)*0.35:d=60,aecho=0.8:0.88:900:0.45' },
  { name: 'peaceful-dawn', filter: 'aevalsrc=sin(261.6*2*PI*t)*0.25+sin(329.6*2*PI*t)*0.25+sin(392*2*PI*t)*0.2+sin(130.8*2*PI*t)*0.3:d=60,chorus=0.7:0.9:50:0.4:0.25:2,aecho=0.8:0.88:1100:0.5' },
  { name: 'dark-psychology', filter: 'aevalsrc=sin(55*2*PI*t)*0.4+sin(82.4*2*PI*t)*0.3+sin(110*2*PI*t)*0.2:d=60,lowpass=f=280,aecho=0.8:0.88:1200:0.6' },
  { name: 'monk-bells', filter: 'aevalsrc=sin(432*2*PI*t)*0.3+sin(864*2*PI*t)*0.15+sin(216*2*PI*t)*0.35:d=60,flanger,aecho=0.85:0.92:2000:0.6' },
  { name: 'oceanic-calm', filter: 'aevalsrc=sin(90*2*PI*t)*0.3+sin(180*2*PI*t)*0.2+sin(45*2*PI*t)*0.4:d=60,lowpass=f=400,aecho=0.8:0.88:1500:0.5' },
  { name: 'deep-zenith', filter: 'aevalsrc=sin(150*2*PI*t)*0.3+sin(225*2*PI*t)*0.3+sin(300*2*PI*t)*0.2:d=60,chorus=0.6:0.8:45:0.4:0.2:2,aecho=0.8:0.88:850:0.4' },
  { name: 'shadow-protocol', filter: 'aevalsrc=sin(60*2*PI*t)*0.4+sin(90*2*PI*t)*0.3+sin(180*2*PI*t)*0.1:d=60,lowpass=f=300,aecho=0.8:0.88:1300:0.55' }
];

console.log('Synthesizing 15+ ambient soundscapes via Docker...');
for (const m of MOODS) {
  const p = path.join(audioDir, `${m.name}.mp3`);
  if (!fs.existsSync(p)) {
    const cmd = `docker run --rm -v "${audioDir}:/out" linuxserver/ffmpeg:latest -y -f lavfi -i "${m.filter}" -af "afade=t=in:st=0:d=2.0,afade=t=out:st=56:d=4.0" -c:a libmp3lame -b:a 192k -t 60 "/out/${m.name}.mp3"`;
    try {
      execSync(cmd, { stdio: 'pipe' });
      console.log(`✓ Synthesized preset: ${m.name}.mp3`);
    } catch (e) {
      // Fallback to yt-image-tools container
      const cmd2 = `docker exec yt-image-tools ffmpeg -y -f lavfi -i "${m.filter}" -af "afade=t=in:st=0:d=2.0,afade=t=out:st=56:d=4.0" -c:a libmp3lame -b:a 192k -t 60 "/app/audio/${m.name}.mp3"`;
      execSync(cmd2, { stdio: 'pipe' });
      console.log(`✓ Synthesized preset (in container): ${m.name}.mp3`);
    }
  }
}

console.log('Finished! Audio directory contents:', fs.readdirSync(audioDir));
