/* Cloudflare Worker - 音乐 API + 音频中转
 * 用途：让公开版音乐播放器在封锁了 *.music.126.net 的网络下也能用，
 *       浏览器只跟本 Worker 通信，由 Worker 在服务端取回数据/音频并流式转发。
 * 部署：Cloudflare Dashboard -> Workers -> Create -> 粘贴本文件 -> Deploy
 * 费用：免费版每日 10 万次请求，个人用足够。
 */
const UPSTREAM_API = 'https://music-api.gdstudio.xyz';

function cors(res) {
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
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

    // 1) API 中转：/api?types=search&...  ->  https://music-api.gdstudio.xyz/api.php?types=search&...
    if (url.pathname === '/api') {
      const target = UPSTREAM_API + '/api.php' + url.search;
      try {
        const r = await fetch(target, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const body = await r.text();
        return cors(new Response(body, {
          status: r.status,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        }));
      } catch (e) {
        return cors(new Response(JSON.stringify({ error: 'upstream failed' }), { status: 502 }));
      }
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

    // 3) 图片中转：/img?src=<封面直链>（公司网络打不开 *.music.126.net 时用）
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

    return cors(new Response('music-proxy ok'));
  },
};

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
  // 匿名 token（Cloudflare 出口 IP 可能可用）
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
      } catch (e) { /* 忽略 */ }
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
  // 抓取 YouTube 歌单页面的初始数据
  const r = await fetch(pageUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  const html = await r.text();
  let name = 'YouTube 歌单';
  const nm = html.match(/"title":"([^"]{1,120})","subtitle"/) || html.match(/<title>([^<]{1,120}) - YouTube<\/title>/);
  if (nm) name = nm[1].replace(/\\u([\da-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  // 提取 videoId + title
  const tracks = [];
  const seen = new Set();
  const re = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
  let mm;
  while ((mm = re.exec(html)) && tracks.length < 200) {
    const vid = mm[1];
    if (seen.has(vid)) continue;
    seen.add(vid);
    // 在附近找标题
    const ctx = html.slice(Math.max(0, mm.index - 200), mm.index + 600);
    const tm = ctx.match(/"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.){1,150})"/);
    let title = '';
    if (tm) {
      title = tm[1].replace(/\\u([\da-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\"/g, '"');
    }
    tracks.push({ title: title || vid, artist: '', youtubeId: vid });
  }
  if (!tracks.length) throw new Error('没找到曲目，可能是私密歌单');
  return { name, tracks, platform: 'youtube' };
}
