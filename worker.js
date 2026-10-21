/* Cloudflare Worker - 音乐 API + 音频/图片中转 + YouTube 跨域搜索
 * 用途：让公开版音乐播放器在封锁了 *.music.126.net / YouTube 的办公室内网也能顺畅使用，
 *       浏览器只跟本 Worker 通信，由 Worker 在服务端取回数据/音频并流式转发。
 * 部署：Cloudflare Dashboard -> Workers -> Create -> 粘贴本文件 -> Deploy
 * 费用：免费版每日 10 万次请求，个人用足够。
 */
const UPSTREAM_API = 'https://met.liiiu.cn/meting/api';
const YT_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

function cors(res) {
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', '*');
  return res;
}

/* 通用流式透传：把上游的 body 直接管道返回，不在 Worker 里缓冲 */
async function passthrough(req, src) {
  const headers = { 'User-Agent': 'Mozilla/5.0' };
  const range = req.headers.get('Range');
  if (range) headers['Range'] = range;
  const r = await fetch(src, { headers, redirect: 'follow' });
  return cors(new Response(r.body, { status: r.status, headers: r.headers }));
}

function needSrc(url) {
  const src = url.searchParams.get('src');
  return src && /^https?:\/\//.test(src) ? src : null;
}

export default {
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      return cors(new Response(null, { status: 204 }));
    }

    // 1) API 中转：优先尝试 GDStudio，失败或无数据时自然降级至 Meting 节点
    if (url.pathname === '/api') {
      const customUpstream = url.searchParams.get('upstream');
      const searchParams = new URLSearchParams(url.search);
      searchParams.delete('upstream');

      const tryEndpoints = [];
      if (customUpstream) {
        tryEndpoints.push(customUpstream.replace(/\/$/, ''));
      }
      // 默认瀑布降级链：GDStudio 优先 -> 失败或异常自然流转至 Meting 高速节点
      tryEndpoints.push('https://music.gdstudio.xyz');
      tryEndpoints.push('https://met.liiiu.cn/meting/api');

      let lastError = null;
      for (const base of tryEndpoints) {
        let target = '';
        const isMeting = /meting/i.test(base) || !/api\.php/i.test(base);
        if (isMeting) {
          const types = searchParams.get('types');
          if (types === 'search') {
            target = `${base}?server=${searchParams.get('source') || 'netease'}&type=search&id=${encodeURIComponent(searchParams.get('name') || '')}`;
          } else if (types === 'url') {
            target = `${base}?server=${searchParams.get('source') || 'netease'}&type=url&id=${searchParams.get('id') || ''}`;
          } else if (types === 'lyric') {
            target = `${base}?server=${searchParams.get('source') || 'netease'}&type=lrc&id=${searchParams.get('id') || ''}`;
          } else if (types === 'playlist') {
            target = `${base}?server=${searchParams.get('source') || 'netease'}&type=playlist&id=${searchParams.get('id') || ''}`;
          } else {
            target = base + (searchParams.toString() ? '?' + searchParams.toString() : '');
          }
        } else {
          target = base + (base.endsWith('api.php') ? '' : '/api.php') + (searchParams.toString() ? '?' + searchParams.toString() : '');
        }

        try {
          const r = await fetch(target, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': 'https://music.gdstudio.xyz/',
              'Origin': 'https://music.gdstudio.xyz',
              'Accept': 'application/json, text/javascript, */*; q=0.01'
            }
          });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const body = await r.text();
          if (body.trim().startsWith('<') || body.includes('Turnstile') || body.includes('Invalid request.') || body.includes('challenge-platform')) {
            throw new Error('Upstream challenge/invalid');
          }
          return cors(new Response(body, {
            status: r.status,
            headers: { 'Content-Type': r.headers.get('content-type') || 'application/json; charset=utf-8' },
          }));
        } catch (e) {
          lastError = e;
        }
      }
      return cors(new Response(JSON.stringify({ error: 'all upstreams failed: ' + (lastError?.message || '') }), { status: 502 }));
    }

    // 2) 音频流式中转：/audio?src=<直链> ，透传 Range 实现秒播 + 拖动
    if (url.pathname === '/audio') {
      const src = needSrc(url);
      if (!src) return cors(new Response('missing src', { status: 400 }));
      try {
        return await passthrough(req, src);
      } catch (e) {
        return cors(new Response('audio fetch failed', { status: 502 }));
      }
    }

    // 3) 图片中转：/img?src=<封面直链>（公司网络打不开 *.music.126.net 或 *.ytimg.com 时用）
    if (url.pathname === '/img') {
      const src = needSrc(url);
      if (!src) return cors(new Response('missing src', { status: 400 }));
      try {
        return await passthrough(req, src);
      } catch (e) {
        return cors(new Response('image fetch failed', { status: 502 }));
      }
    }

    // 4) 歌单解析：/parse-playlist?url=<歌单链接>
    //    支持 网易云 / Apple Music / Spotify / YouTube，返回 {name, tracks:[{title,artist}]}
    if (url.pathname === '/parse-playlist') {
      const plUrl = url.searchParams.get('url') || '';
      try {
        const data = await parsePlaylist(plUrl);
        return cors(new Response(JSON.stringify(data), {
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        }));
      } catch (e) {
        return cors(new Response(JSON.stringify({ error: String((e && e.message) || e).slice(0, 200) }), { status: 400 }));
      }
    }

    // 5) YouTube 歌曲与视频检索：/yt-search?q=<关键词>&count=25
    if (url.pathname === '/yt-search') {
      const q = url.searchParams.get('q') || '';
      if (!q) return cors(new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } }));
      try {
        const results = await searchYouTube(q);
        return cors(new Response(JSON.stringify(results), {
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        }));
      } catch (e) {
        return cors(new Response(JSON.stringify({ error: String((e && e.message) || e) }), { status: 500 }));
      }
    }

    // 6) YouTube 单曲信息提取：/yt-info?id=<vid> 或 ?url=<url>
    if (url.pathname === '/yt-info') {
      const qUrl = url.searchParams.get('url') || '';
      let vid = url.searchParams.get('id') || '';
      if (!vid && qUrl) {
        const m = qUrl.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
        if (m) vid = m[1];
      }
      if (!vid) return cors(new Response(JSON.stringify({ error: 'invalid video id' }), { status: 400 }));
      try {
        const info = await getYouTubeInfo(vid);
        return cors(new Response(JSON.stringify(info), {
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        }));
      } catch (e) {
        return cors(new Response(JSON.stringify({ error: String((e && e.message) || e) }), { status: 500 }));
      }
    }

    // 7) YouTube 原生高保真音频流与字幕歌词提取：/yt-player?id=<vid> 或 ?url=<url>
    if (url.pathname === '/yt-player') {
      const qUrl = url.searchParams.get('url') || '';
      let vid = url.searchParams.get('id') || '';
      if (!vid && qUrl) {
        const m = qUrl.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
        if (m) vid = m[1];
      }
      if (!vid) return cors(new Response(JSON.stringify({ error: 'invalid video id' }), { status: 400 }));
      try {
        const data = await getYouTubePlayer(vid);
        return cors(new Response(JSON.stringify(data), {
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        }));
      } catch (e) {
        return cors(new Response(JSON.stringify({ error: String((e && e.message) || e) }), { status: 500 }));
      }
    }

    return cors(new Response('music-proxy ok'));
  },
};

/* ---------- YouTube 搜索与信息提取 ---------- */
async function searchYouTube(query) {
  const r = await fetch(`https://www.youtube.com/youtubei/v1/search?key=${YT_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    body: JSON.stringify({
      context: { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00' } },
      query: query,
    }),
  });
  const d = await r.json();
  const list = [];
  try {
    const contents = d.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
    for (const it of contents) {
      const vr = it.videoRenderer;
      if (!vr) continue;
      const vid = vr.videoId;
      const title = vr.title?.runs?.[0]?.text || '';
      const artist = vr.ownerText?.runs?.[0]?.text || '';
      const durationStr = vr.lengthText?.simpleText || '0:00';
      const thumbs = vr.thumbnail?.thumbnails || [];
      const pic = thumbs[thumbs.length - 1]?.url || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
      
      const parts = durationStr.split(':').map(Number);
      let durSec = 0;
      if (parts.length === 2) durSec = parts[0] * 60 + parts[1];
      else if (parts.length === 3) durSec = parts[0] * 3600 + parts[1] * 60 + parts[2];

      if (vid && title) {
        list.push({
          id: `yt_${vid}`,
          ytId: vid,
          name: title,
          artist: [artist],
          album: 'YouTube Music',
          pic: pic,
          duration: durSec,
          source: 'youtube',
          _needMatch: true,
          _matchQuery: `${title} ${artist}`
        });
      }
      if (list.length >= 25) break;
    }
  } catch (e) {}
  return list;
}

async function getYouTubeInfo(vid) {
  const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(vid)}&format=json`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!r.ok) throw new Error('获取 YouTube 视频信息失败');
  const d = await r.json();
  return {
    id: `yt_${vid}`,
    ytId: vid,
    name: d.title || 'YouTube 视频',
    artist: [d.author_name || 'YouTube'],
    album: 'YouTube',
    pic: d.thumbnail_url || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
    duration: 0,
    source: 'youtube',
    _needMatch: true,
    _matchQuery: `${d.title || ''} ${d.author_name || ''}`
  };
}

/* ---------- 歌单解析 ---------- */
async function parsePlaylist(plUrl) {
  const u = (plUrl || '').trim();
  if (!u) throw new Error('请粘贴歌单链接');
  if (u.includes('youtube.com') || u.includes('youtu.be') || u.includes('music.youtube.com')) {
    return await parseYTPlaylist(u);
  }
  let m = u.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?playlist\/([A-Za-z0-9]+)/);
  if (m) return await parseSpotifyPlaylist(m[1]);
  m = u.match(/music\.163\.com.*[?&]id=(\d+)/);
  if (m) return await parseNeteasePlaylist(m[1]);
  if (u.includes('music.apple.com') && u.includes('/playlist/')) {
    return await parseApplePlaylist(u);
  }
  throw new Error('识别不了这个链接，目前支持 YouTube / Spotify / 网易云 / Apple Music 的歌单链接');
}

async function parseNeteasePlaylist(pid) {
  const r = await fetch(UPSTREAM_API + '/api.php?types=playlist&id=' + encodeURIComponent(pid), {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  const d = await r.json();
  const pl = d.playlist || {};
  const tracks = (pl.tracks || []).map((t) => ({
    title: t.name || '',
    artist: (t.ar || []).map((a) => a.name).join('/'),
    neteaseId: String(t.id || ''),
  }));
  if (!tracks.length) throw new Error('歌单是空的或解析失败');
  return { name: pl.name || '网易云歌单', tracks, platform: 'netease' };
}

async function parseApplePlaylist(pageUrl) {
  const r = await fetch(pageUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  const html = await r.text();
  const m = html.match(/<script type="application\/json" id="serialized-server-data">(.*?)<\/script>/s);
  if (!m) throw new Error('Apple Music 页面解析失败');
  const data = JSON.parse(m[1]).data[0].data;
  let name = 'Apple Music 歌单';
  const tracks = [];
  for (const sec of (data.sections || [])) {
    const items = sec.items || [];
    if (items.length === 1 && items[0].trackCount) {
      name = items[0].title || name;
    }
    if (items.length > 1 && 'trackNumber' in items[0]) {
      for (const it of items) {
        const subs = it.subtitleLinks || [];
        tracks.push({
          title: it.title || '',
          artist: subs.length ? (subs[0].title || '') : '',
        });
      }
    }
  }
  if (!tracks.length) throw new Error('没找到曲目');
  return { name, tracks, platform: 'apple' };
}

async function parseSpotifyPlaylist(pid) {
  const sHeaders = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
  await fetch('https://open.spotify.com/', { headers: sHeaders });
  const tr = await (await fetch(
    'https://open.spotify.com/get_access_token?reason=transport&productType=web_player',
    { headers: sHeaders })).json();
  const token = tr.accessToken || '';
  if (!token) throw new Error('连不上 Spotify，请用手动粘贴方式导入');
  const tracks = [];
  let name = 'Spotify 歌单', offset = 0;
  for (;;) {
    const ar = await (await fetch(
      `https://api.spotify.com/v1/playlists/${pid}/tracks?limit=100&offset=${offset}&fields=items(track(name,artists(name))),total,next`,
      { headers: { ...sHeaders, Authorization: 'Bearer ' + token } })).json();
    if (ar.error) throw new Error('Spotify API: ' + (ar.error.message || ''));
    if (offset === 0) {
      try {
        const pr = await (await fetch(
          `https://api.spotify.com/v1/playlists/${pid}?fields=name`,
          { headers: { ...sHeaders, Authorization: 'Bearer ' + token } })).json();
        if (pr.name) name = pr.name;
      } catch (e) {}
    }
    for (const it of (ar.items || [])) {
      const t = (it || {}).track || {};
      if (t.name) {
        tracks.push({
          title: t.name,
          artist: (t.artists || []).map((a) => a.name).join('/'),
        });
      }
    }
    if (!ar.next || offset >= 900) break;
    offset += 100;
  }
  if (!tracks.length) throw new Error('歌单是空的');
  return { name, tracks, platform: 'spotify' };
}

async function parseYTPlaylist(pageUrl) {
  const m = pageUrl.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  if (!m) throw new Error('链接里没有找到歌单 ID');
  const listId = m[1];
  const r = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${YT_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    body: JSON.stringify({
      context: { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00' } },
      browseId: 'VL' + listId,
    }),
  });
  const d = await r.json();
  let name = 'YouTube 歌单';
  try { name = d.metadata.playlistMetadataRenderer.title || name; } catch (e) {}
  const tracks = [];
  try {
    const tabs = d.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
    const sections = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
    for (const sec of sections) {
      const items = (sec?.itemSectionRenderer?.contents) || [];
      for (const it of items) {
        // 兼容 lockupViewModel (现代 YouTube 排版)
        if (it.lockupViewModel) {
          const vm = it.lockupViewModel;
          const vid = vm.contentId || '';
          const md = vm.metadata?.lockupMetadataViewModel;
          const title = md?.title?.content || '';
          
          let artist = '';
          const rows = md?.metadata?.contentMetadataViewModel?.metadataRows || [];
          for (const row of rows) {
            for (const part of (row.parts || [])) {
              const c = part.text?.content || '';
              if (c && !c.includes('views') && !c.includes('ago') && !c.includes('观看') && !c.includes('前')) {
                artist = c;
                break;
              }
            }
            if (artist) break;
          }
          if (!artist) {
            const parts = title.split(' - ');
            if (parts.length >= 2) artist = parts[0].trim();
          }

          let durSec = 0;
          const overlays = vm.contentImage?.thumbnailViewModel?.overlays || [];
          for (const ov of overlays) {
            const bList = ov.thumbnailBottomOverlayViewModel?.badges || [];
            for (const b of bList) {
              const txt = b.thumbnailBadgeViewModel?.text || '';
              if (txt && txt.includes(':')) {
                const parts = txt.split(':').map(Number);
                if (parts.length === 2) durSec = parts[0] * 60 + parts[1];
                else if (parts.length === 3) durSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
              }
            }
          }

          const pic = vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : '';
          if (title && vid) {
            tracks.push({
              title,
              artist: artist || 'YouTube',
              youtubeId: vid,
              pic,
              duration: durSec,
              source: 'youtube'
            });
          }
        }
        // 兼容 playlistVideoRenderer (经典 YouTube 排版)
        else if (it.playlistVideoRenderer) {
          const pvr = it.playlistVideoRenderer;
          const vid = pvr.videoId || '';
          const title = pvr.title?.runs?.[0]?.text || pvr.title?.simpleText || '';
          let artist = pvr.shortBylineText?.runs?.[0]?.text || '';
          if (!artist) {
            const parts = title.split(' - ');
            if (parts.length >= 2) artist = parts[0].trim();
          }
          const durSec = parseInt(pvr.lengthSeconds || '0', 10) || 0;
          const pic = vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : '';
          if (title && vid) {
            tracks.push({
              title,
              artist: artist || 'YouTube',
              youtubeId: vid,
              pic,
              duration: durSec,
              source: 'youtube'
            });
          }
        }
        if (tracks.length >= 200) break;
      }
      if (tracks.length >= 200) break;
    }
  } catch (e) {}
  if (!tracks.length) throw new Error('没找到曲目，可能是私密歌单或地区限制');
  return { name, tracks, platform: 'youtube' };
}

/* ---------- YouTube 原生音频与同步歌词解析器 ---------- */
async function getYouTubePlayer(vid) {
  const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${YT_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoId: vid,
      context: {
        client: {
          clientName: 'ANDROID_VR',
          clientVersion: '1.61.48'
        }
      }
    })
  });
  if (!res.ok) throw new Error('YouTube Player request failed: ' + res.status);
  const d = await res.json();
  const formats = d.streamingData?.adaptiveFormats || [];
  const audios = formats.filter(f => f.mimeType && f.mimeType.startsWith('audio/'));
  if (!audios.length) throw new Error('No audio formats found for video ' + vid);

  audios.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
  const selected = audios.find(a => a.mimeType.includes('audio/mp4')) || audios[0];

  let lyrics = '';
  const captions = d.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  if (captions.length) {
    const cUrl = captions.find(c => c.languageCode === 'zh' || c.languageCode === 'zh-Hans' || c.languageCode === 'zh-Hant') || captions[0];
    try {
      const capRes = await fetch(cUrl.baseUrl);
      const text = await capRes.text();
      const lrcLines = [];
      const regex = /<p t="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
      let m;
      while ((m = regex.exec(text)) !== null) {
        const ms = parseInt(m[1], 10);
        const clean = m[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
        if (clean) {
          const sec = Math.floor(ms / 1000);
          const cent = Math.floor((ms % 1000) / 10);
          const timeStr = '[' + String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0') + '.' + String(cent).padStart(2, '0') + ']';
          lrcLines.push(timeStr + clean);
        }
      }
      lyrics = lrcLines.join('\n');
    } catch (e) {}
  }

  return {
    audioUrl: selected.url,
    bitrate: selected.bitrate || 128000,
    mimeType: selected.mimeType,
    duration: parseInt(d.videoDetails?.lengthSeconds || '0', 10),
    title: d.videoDetails?.title || '',
    author: d.videoDetails?.author || '',
    lyrics
  };
}
