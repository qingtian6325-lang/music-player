/* 音乐播放器 - 多源聚合版 (GDStudio 独立 API 优先 · 官方 Web 次选 · 支持 Meting/Qijieya 智能瀑布容灾降级) */
const GDSTUDIO_API_SOURCE = 'https://music-api.gdstudio.xyz/api.php';
const GDSTUDIO_WEB_SOURCE = 'https://music.gdstudio.xyz/api.php';
const DEFAULT_API_SOURCE = GDSTUDIO_API_SOURCE;
const FAILOVER_SOURCES = [
  'https://music-api.gdstudio.xyz/api.php',
  'https://music.gdstudio.xyz/api.php',
  'https://met.liiiu.cn/meting/api',
  'https://api.qijieya.cn/meting/',
  'https://api.injahow.cn/meting/'
];
const API_PRESETS = [
  { id: 'gdstudio-api', name: '⚡ GDStudio 专属独立 API 节点 (首选 · 高速稳定)', url: 'https://music-api.gdstudio.xyz/api.php' },
  { id: 'gdstudio-web', name: '🌟 GDStudio 官方 Web 节点 (次选备用)', url: 'https://music.gdstudio.xyz/api.php' },
  { id: 'liiiu', name: '🚀 Meting 全网高速节点 (快速稳定)', url: 'https://met.liiiu.cn/meting/api' },
  { id: 'qijieya', name: '🛡️ Qijieya 节点 (支持 VIP/黑胶解析)', url: 'https://api.qijieya.cn/meting/' },
  { id: 'injahow', name: '⚡ Injahow 节点 (备用 · 歌单/音频流)', url: 'https://api.injahow.cn/meting/' }
];
function currentApiSource() {
  const saved = (localStorage.getItem('mp_api_source') || '').trim();
  // 若用户此前保存的是旧的默认 Web 源，自动平滑升级为独立 API 源
  if (!saved || saved === GDSTUDIO_WEB_SOURCE) {
    return DEFAULT_API_SOURCE;
  }
  return saved;
}
function isMetingUrl(u) {
  return /meting/i.test(u) || !/api\.php/i.test(u);
}
/* GDStudio 专用的 URL 字符安全转义算法 (与 GDStudio ajax.js 官方实现完全一致) */
function gdUrlEncode(a) {
  if (a == null) return '';
  typeof a !== 'string' && (a = String(a));
  return encodeURIComponent(a).replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A').replace(/'/g, '%27').replace(/!/g, '%21');
}
const BR_FALLBACK = [999, 740, 320, 128];

const CHARTS = [
  { id: '19723756', name: '飙升榜', cover: 'https://p1.music.126.net/rIi7Qzy2i2Y_1QD7cd0MYA==/109951170048506929.jpg' },
  { id: '3779629', name: '新歌榜', cover: 'https://p1.music.126.net/5guhqPBTcIrrhLBotgaT6w==/109951170048511751.jpg' },
  { id: '3778678', name: '热歌榜', cover: 'https://p1.music.126.net/0SUEG8yDACfx0Bw2MYFv4Q==/109951170048519512.jpg' },
  { id: '71384707', name: '古典榜', cover: 'https://p1.music.126.net/urByD_AmfBDBrs7fA9-O8A==/109951167976973225.jpg' },
  { id: '1978921795', name: '电音榜', cover: 'https://p1.music.126.net/hXGObvXfsGtFjFvRhOYAkA==/109951170091888741.jpg' },
  { id: '71385702',   name: 'ACG榜', cover: 'https://p1.music.126.net/na1kEeCS1iZEkzOrs9r_9g==/109951167976973667.jpg' },
  { id: '2809513713', name: '欧美榜', cover: 'https://p1.music.126.net/70_EO_Dc7NT_hhfvsapzcQ==/109951167430862162.jpg' },
  { id: '5059644681', name: '日语榜', cover: 'https://p1.music.126.net/YFBFNI2F-4BveUpv6FKFuw==/109951167430864069.jpg' },
  { id: '745956260', name: '韩语榜', cover: 'https://p1.music.126.net/5oN9YaFznwNGXkmi8i2Ytw==/109951167430864741.jpg' },
];

const HOT_KEYWORDS = ['周杰伦', '陈奕迅', '林俊杰', '邓紫棋', 'Taylor Swift', '告白气球', '晴天', '起风了', '海阔天空', '枫'];

/* ---------- 设备与系统特性识别 ---------- */
const isIOS = typeof navigator !== 'undefined' && (
  /iPad|iPhone|iPod/.test(navigator.userAgent || '') ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
);

/* ---------- 工具 ---------- */
const $ = (id) => document.getElementById(id);
const fmtTime = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  s = Math.floor(s);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};
let toastTimer = null;
function toast(msg, ms = 2600) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), ms);
}
function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* 过滤 YouTube / B站标题中的 MV、官方、歌词等无关词，提高音源与歌词匹配成功率 */
function cleanSongTitle(title) {
  let s = String(title || '');
  const bookMatch = s.match(/《([^》]{1,30})》/);
  if (bookMatch && bookMatch[1].trim()) {
    return bookMatch[1].trim();
  }
  s = s.replace(/【[^】]*】/g, ' ');
  s = s.replace(/[【】\[\]\(\)「」『』《》｜|]/g, ' ');
  s = s.replace(/\b(?:Official\s*Music\s*Video|Official\s*Lyric\s*Video|Official\s*Audio|Official\s*Video|Music\s*Video|Lyric\s*Video|Full\s*Song|Full\s*Audio|4K|HD|1080P|MV|Official|Hi-Res|HIFI|FLAC|官方|歌词版|完整版|高音质|无损音质|无损|现场版|后台播放|精选合集|合集|Live|Performance)\b/gi, ' ');
  s = s.replace(/[-_\|\/]\s*$/g, '');
  s = s.replace(/^\s*[-_\|\/]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s || String(title || '').trim();
}

function matchYouTubeUrl(str) {
  const m = String(str || '').match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

/* ---------- API ---------- */
const DEFAULT_PROXY = 'https://disablecdnblock.qingtian6325.workers.dev';
function proxyBase() {
  return (localStorage.getItem('mp_proxy') || DEFAULT_PROXY).replace(/\/$/, '');
}
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('网络请求失败 ' + res.status);
  return res.json();
}

/* 智能多源瀑布降级调度引擎：
 * 优先使用主源（默认 GDStudio），一旦无数据或异常，自然逐级顺延至 Meting / Qijieya / Injahow 等备用源
 */
const GD_SUPPORTED_SOURCES = new Set([
  'netease', 'kuwo', 'joox', 'bilibili', 'apple',
  'tencent', 'migu', 'kugou', 'ytmusic', 'tidal', 'qobuz', 'deezer', 'spotify', 'ximalaya'
]);
const GD_CACHE_SOURCES = new Set([
  'ytmusic', 'ytmusic_album', 'deezer', 'deezer_album',
  'spotify', 'spotify_album', 'apple', 'apple_album'
]);

function signGd(str, offsetSec = 0) {
  if (typeof window !== 'undefined' && typeof window.crc32 === 'function') {
    try {
      if (offsetSec) {
        window.__gdTime = Math.floor(Date.now() / 1000) + offsetSec;
      } else {
        delete window.__gdTime;
      }
      const res = window.crc32(String(str));
      delete window.__gdTime;
      return res;
    } catch (e) {
      try { delete window.__gdTime; } catch (err) {}
    }
  }
  return '';
}

function resolveGdAssetUrl(ep, rawUrl) {
  if (!rawUrl || rawUrl === 'err') return '';
  const u = String(rawUrl).trim();
  if (!u || u === 'err') return '';
  if (u.startsWith('//')) return 'https:' + u;
  if (/^https?:\/\//i.test(u)) return u;
  const base = String(ep || GDSTUDIO_WEB_SOURCE).replace(/api\.php.*$/i, '');
  return (base.endsWith('/') ? base : base + '/') + u.replace(/^\/+/, '');
}

function fetchJsonp(baseUrl, qs, timeoutMs = 8500) {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('JSONP requires browser DOM'));
      return;
    }
    const cbName = '__gd_jsonp_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    const script = document.createElement('script');
    let timer = setTimeout(() => {
      cleanup();
      reject(new Error('JSONP timeout'));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[cbName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('JSONP script error'));
    };

    script.referrerPolicy = 'no-referrer';
    const sep = baseUrl.includes('?') ? '&' : '?';
    script.src = `${baseUrl}${sep}${qs}&callback=${cbName}`;
    (document.head || document.documentElement).appendChild(script);
  });
}

function normalizeArtistArray(raw) {
  if (Array.isArray(raw)) {
    const arr = raw.map(a => (typeof a === 'string' ? a.trim() : String((a && a.name) || '').trim())).filter(Boolean);
    return arr.length ? arr : ['未知歌手'];
  }
  if (typeof raw === 'string' && raw.trim()) {
    const arr = raw.split(/\s*[\/,、]\s*/).map(s => s.trim()).filter(Boolean);
    return arr.length ? arr : [raw.trim()];
  }
  return ['未知歌手'];
}

function normalizeSearchTrack(item, fallbackSource = 'netease', idx = 0) {
  if (!item || typeof item !== 'object') return null;
  const name = String(item.name || item.title || '').trim();
  if (!name) return null;

  const urlStr = String(item._directUrl || item.url || '').trim();
  const lrcStr = String(item.lrc || '').trim();
  const urlIdMatch = urlStr.match(/[?&]id=([^&]+)/);
  const lrcIdMatch = lrcStr.match(/[?&]id=([^&]+)/);

  const rawId = item.id != null && String(item.id) !== 'undefined' && String(item.id).trim() !== ''
    ? String(item.id).trim()
    : (item.url_id != null && String(item.url_id) !== 'undefined'
      ? String(item.url_id).trim()
      : (urlIdMatch ? decodeURIComponent(urlIdMatch[1]) : ''));
  if (!rawId) return null;

  const artist = normalizeArtistArray(item.artist != null ? item.artist : (item.author != null ? item.author : item.ar));
  const albumRaw = (item.al && item.al.name) || item.album || '';
  const album = typeof albumRaw === 'string' ? albumRaw : '';
  let pic = String((item.al && item.al.picUrl) || item.pic || '').trim();
  const picId = item.pic_id != null && String(item.pic_id) !== 'undefined' ? String(item.pic_id).trim() : '';
  if (!pic && picId && (picId.startsWith('//') || /^https?:\/\//i.test(picId))) {
    pic = picId.startsWith('//') ? 'https:' + picId : picId;
  } else if (pic.startsWith('//')) {
    pic = 'https:' + pic;
  }
  const lyricId = item.lyric_id != null && String(item.lyric_id) !== 'undefined'
    ? String(item.lyric_id).trim()
    : (lrcIdMatch ? decodeURIComponent(lrcIdMatch[1]) : rawId);
  const src = String(item.source || fallbackSource || 'netease').trim();
  const extra = (item.extra_data && typeof item.extra_data === 'object') ? item.extra_data : null;
  const duration = Number(item.duration) || Number(extra && extra.duration) || (item.dt ? Math.round(Number(item.dt) / 1000) : 0);
  const hasHires = Boolean(item.has_hires || (extra && extra.has_hires));
  const isrc = String(item.isrc || (extra && extra.isrc) || '').trim();

  const out = {
    id: rawId,
    name,
    artist,
    album,
    pic,
    pic_id: picId,
    lyric_id: lyricId,
    source: src,
    duration,
    has_hires: hasHires,
    isrc,
    _directUrl: urlStr
  };
  if (item.ytId) out.ytId = item.ytId;
  if (item._needMatch) out._needMatch = item._needMatch;
  if (item._matchQuery) out._matchQuery = item._matchQuery;
  return out;
}

function normalizeSearchList(list, fallbackSource = 'netease') {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const t = normalizeSearchTrack(list[i], fallbackSource, i);
    if (t) out.push(t);
  }
  return out;
}

async function api(params) {
  const primary = currentApiSource();
  const { types, source = 'netease', name = '', id = '', br = '320', count = '20', pages = '1' } = params;
  const server = (source === 'tencent' || source === 'qq') ? 'tencent' : 'netease';
  const gdSource = GD_SUPPORTED_SOURCES.has(source) ? source : (source === 'qq' ? 'tencent' : 'netease');

  // music-api.gdstudio.xyz 仅开放了 netease 单源；对于 kuwo / joox / bilibili / apple / autosource，优先调度支持全源的官方 Web 节点 (music.gdstudio.xyz)
  let baseCandidates = [primary, ...FAILOVER_SOURCES.filter(s => s !== primary)];
  if ((gdSource !== 'netease' || types === 'autosource') && primary === GDSTUDIO_API_SOURCE) {
    baseCandidates = [GDSTUDIO_WEB_SOURCE, ...baseCandidates.filter(s => s !== GDSTUDIO_WEB_SOURCE)];
  }

  for (const ep of baseCandidates) {
    const isMeting = isMetingUrl(ep);
    try {
      if (isMeting) {
        // Meting 仅支持 netease 与 tencent，跳过 kuwo / joox / bilibili / apple 等源以避免串源或生成无效 404 链接
        if (gdSource !== 'netease' && gdSource !== 'tencent') continue;
        if (types === 'autosource') continue;

        const metingBase = ep.includes('/api') ? ep : (ep.endsWith('/') ? ep : ep + '/');
        const sep = metingBase.includes('?') ? '&' : '?';
        const proxy = proxyBase();

        if (types === 'playlist') {
          const u = `${metingBase}${sep}server=${server}&type=playlist&id=${id}`;
          let list = null;
          try { list = await fetchJson(u); } catch (e) {}
          if ((!Array.isArray(list) || !list.length) && proxy) {
            try { list = await fetchJson(`${proxy}/api?upstream=${encodeURIComponent(ep)}&types=playlist&source=${server}&id=${id}`); } catch (e) {}
          }
          const tracks = normalizeSearchList(list, server);
          if (tracks.length > 0) {
            return { playlist: { name: '官方精选榜单', tracks } };
          }
        } else if (types === 'search') {
          const u = `${metingBase}${sep}server=${server}&type=search&id=${encodeURIComponent(name)}`;
          let list = null;
          try { list = await fetchJson(u); } catch (e) {}
          if ((!Array.isArray(list) || !list.length) && proxy) {
            try { list = await fetchJson(`${proxy}/api?upstream=${encodeURIComponent(ep)}&types=search&source=${server}&name=${encodeURIComponent(name)}`); } catch (e) {}
          }
          const normalized = normalizeSearchList(list, server);
          if (normalized.length > 0) return normalized;
        } else if (types === 'url') {
          const u = `${metingBase}${sep}server=${server}&type=url&id=${id}`;
          return { url: u, br: 320 };
        } else if (types === 'lyric') {
          const u = `${metingBase}${sep}server=${server}&type=lrc&id=${id}`;
          let text = '';
          try {
            const res = await fetch(u, { signal: AbortSignal.timeout(4000) });
            if (res.ok) text = await res.text();
          } catch (e) {}
          if (!text && proxy) {
            try {
              const res = await fetch(`${proxy}/api?upstream=${encodeURIComponent(ep)}&types=lyric&source=${server}&id=${id}`, { signal: AbortSignal.timeout(4000) });
              if (res.ok) text = await res.text();
            } catch (e) {}
          }
          if (text && text.includes('[')) {
            return { lyric: text, tlyric: '' };
          }
        } else if (types === 'pic') {
          return { url: `${metingBase}${sep}server=${server}&type=pic&id=${id}` };
        }
      } else {
        // music-api.gdstudio.xyz 仅开放了 netease 单源（及 joox 仅搜索），跳过其不支持的源以免无谓耗时
        if (ep === GDSTUDIO_API_SOURCE && (types === 'autosource' || (gdSource !== 'netease' && !(gdSource === 'joox' && types === 'search')))) {
          continue;
        }

        // GDStudio (api.php) - 严格遵循官方 ajax.js 签名协议 (使用 gdUrlEncode 后的字符串计算 crc32)
        const buildGdQs = (offsetSec = 0) => {
          if (types === 'search') {
            const encName = gdUrlEncode(name);
            const s = signGd(encName, offsetSec);
            return `types=search&count=${count || 20}&source=${gdSource}&pages=${pages || 1}&name=${encName}${s ? '&s=' + s : ''}`;
          }
          if (types === 'playlist' || types === 'userlist') {
            const encId = gdUrlEncode(String(id || ''));
            const s = signGd(encId, offsetSec);
            return `types=${types}&id=${encId}${s ? '&s=' + s : ''}`;
          }
          if (types === 'url') {
            const encId = gdUrlEncode(String(id || ''));
            const s = signGd(encId, offsetSec);
            return `types=url&id=${encId}&source=${gdSource}&br=${br || 320}${s ? '&s=' + s : ''}`;
          }
          if (types === 'lyric') {
            const encId = gdUrlEncode(String(params.lyric_id || id || ''));
            const s = signGd(encId, offsetSec);
            return `types=lyric&id=${encId}&source=${gdSource}${s ? '&s=' + s : ''}`;
          }
          if (types === 'pic') {
            const encId = gdUrlEncode(String(id || ''));
            const s = signGd(encId, offsetSec);
            return `types=pic&id=${encId}&source=${gdSource}&size=300${s ? '&s=' + s : ''}`;
          }
          if (types === 'autosource') {
            const encPayload = gdUrlEncode(name);
            const s = signGd(encPayload, offsetSec);
            return `types=autosource&source=${gdSource}&br=${br || 320}&name=${encPayload}${s ? '&s=' + s : ''}`;
          }
          return new URLSearchParams(params).toString();
        };

        let qs = buildGdQs(0);
        const u = `${ep}?${qs}`;
        let data = null;
        let directOk = false;
        const jsonpTimeout = (types === 'url' && GD_CACHE_SOURCES.has(gdSource)) || types === 'autosource' ? 12000 : 8000;
        const adjacentOffset = () => ((Date.now() % 10000) >= 5000 ? 5 : -5);

        if (ep === GDSTUDIO_WEB_SOURCE || /music\.gdstudio\.(xyz|org)/i.test(ep)) {
          // 官方 Web 节点 (music.gdstudio.xyz) 原生通过 JSONP 响应跨域请求，支持全部 5 大音源 (网易云/酷我/JOOX/B站/Apple)
          try {
            const jpData = await fetchJsonp(ep, qs, jsonpTimeout);
            if (jpData && !jpData.detail && !jpData.error) {
              data = jpData;
              directOk = true;
            }
          } catch (e) {}
          // 若恰好跨 10 秒时间戳边界导致签名 401，立即使用相邻时间窗口重试一次
          if (!directOk) {
            try {
              const retryQs = buildGdQs(adjacentOffset());
              const jpData = await fetchJsonp(ep, retryQs, jsonpTimeout);
              if (jpData && !jpData.detail && !jpData.error) {
                data = jpData;
                directOk = true;
              }
            } catch (e) {}
          }
        } else {
          // 1. 独立 API 节点 (music-api.gdstudio.xyz) 优先浏览器 CORS Simple Request 直连
          try {
            const res = await fetch(u, { signal: AbortSignal.timeout(4500) });
            if (res.ok) {
              const parsed = await res.json();
              if (parsed && !parsed.detail && !parsed.error) {
                data = parsed;
                directOk = true;
              }
            }
          } catch (e) {}

          if (!directOk) {
            try {
              const retryQs = buildGdQs(adjacentOffset());
              const res = await fetch(`${ep}?${retryQs}`, { signal: AbortSignal.timeout(4500) });
              if (res.ok) {
                const parsed = await res.json();
                if (parsed && !parsed.detail && !parsed.error) {
                  data = parsed;
                  directOk = true;
                }
              }
            } catch (e) {}
          }

          // 2. 若 CORS 受阻则尝试 JSONP
          if (!directOk) {
            try {
              const jpData = await fetchJsonp(ep, qs, jsonpTimeout);
              if (jpData && !jpData.detail && !jpData.error) {
                data = jpData;
                directOk = true;
              }
            } catch (e) {}
          }

          // 3. 若直连网络不通（例如受限内网拦截了 gdstudio.xyz），则通过 Worker 代理兜底
          const proxy = proxyBase();
          if (!directOk && proxy) {
            try {
              const pRes = await fetch(`${proxy}/api?upstream=${encodeURIComponent(ep)}&${qs}`, { signal: AbortSignal.timeout(4500) });
              if (pRes.ok) {
                const rawText = await pRes.text();
                if (types === 'lyric' && rawText.trim().startsWith('[')) {
                  return { lyric: rawText, tlyric: '' };
                }
                const parsed = JSON.parse(rawText);
                if (parsed && !parsed.error && !parsed.detail) {
                  data = parsed;
                }
              }
            } catch (e) {}
          }
        }

        if (!data || data.detail || data.error) throw new Error((data && (data.detail || data.error)) || 'GDStudio error');

        if (types === 'playlist') {
          if (data.playlist && Array.isArray(data.playlist.tracks) && data.playlist.tracks.length > 0) return data;
          if (Array.isArray(data) && data.length > 0) {
            const tracks = normalizeSearchList(data, gdSource);
            if (tracks.length > 0) return { playlist: { name: '官方精选榜单', tracks } };
          }
        }
        if (types === 'search' && Array.isArray(data)) {
          const normalized = normalizeSearchList(data, gdSource);
          if (normalized.length > 0) return normalized;
          if (directOk && ep === GDSTUDIO_WEB_SOURCE) return [];
        }
        if (types === 'url' || types === 'autosource') {
          if (data.url && data.url !== 'err') {
            data.url = resolveGdAssetUrl(ep, data.url);
            if (data.pic) data.pic = resolveGdAssetUrl(ep, data.pic);
            return data;
          }
          if (directOk && 'url' in data && (!data.url || data.url === 'err') && ep === GDSTUDIO_WEB_SOURCE) {
            return { url: '', _noUrl: true };
          }
        }
        if (types === 'lyric' && (data.lyric || data.tlyric)) return data;
        if (types === 'pic' && data.url && data.url !== 'err') {
          data.url = resolveGdAssetUrl(ep, data.url);
          return data;
        }
        throw new Error('GDStudio response empty');
      }
    } catch (err) {
      // 当前源请求异常或无数据，自然降级至列表中的下一个备用音源
    }
  }

  if (types === 'playlist') return { playlist: { tracks: [] } };
  if (types === 'search') return [];
  if (types === 'lyric') return { lyric: '', tlyric: '' };
  return null;
}
/* 音频地址：HTTPS 原生 CDN 直链（网易云/酷我/JOOX/B站/Apple）优先由浏览器直接播放（低延迟且避免 Worker 520 拦截），YouTube 或 HTTP 链接走 Worker 转发 */
function audioSrc(cdnUrl) {
  if (!cdnUrl) return '';
  const u = String(cdnUrl).trim();
  const proxy = proxyBase();
  if (/googlevideo\.com/i.test(u) || (u.startsWith('http://') && typeof location !== 'undefined' && location.protocol === 'https:')) {
    return proxy ? proxy + '/audio?src=' + encodeURIComponent(u) : u;
  }
  return u;
}
/* 封面地址：走 Worker /img 中转；GDStudio 自有缓存节点直连 */
function imgSrc(u) {
  if (!u) return '';
  let url = String(u).replace(/"/g, '').trim();
  if (url.startsWith('//')) url = 'https:' + url;
  if (url.includes('music.126.net') && !url.includes('param=')) {
    url += (url.includes('?') ? '&' : '?') + 'param=400y400';
  }
  if (/gdstudio\.(xyz|org)/i.test(url)) return url;
  const proxy = proxyBase();
  return proxy ? proxy + '/img?src=' + encodeURIComponent(url) : url;
}
const urlCache = new Map();   // source:id:pref -> {url, br, size}
const lyricCache = new Map(); // source:id -> {lines:[{t, text, trans}]}

function getPreferredQuality() {
  return localStorage.getItem('mp_preferred_quality') || '999';
}

function getBrFallbackList(preferred) {
  const p = parseInt(preferred, 10) || 999;
  if (p >= 900) return [999, 320];
  if (p >= 300) return [320, 128];
  return [128, 320];
}

const picCache = new Map();
async function resolvePic(track) {
  if (!track) return '';
  if (track.pic) return track.pic;
  const targetId = track.pic_id || track.id;
  if (!targetId || track.source === 'youtube') return '';
  const key = `${track.source || 'netease'}:${targetId}`;
  if (picCache.has(key)) {
    const cached = picCache.get(key);
    if (cached) {
      track.pic = cached;
      return cached;
    }
  }
  try {
    const d = await api({ types: 'pic', source: track.source || 'netease', id: String(targetId) });
    if (d && d.url) {
      track.pic = d.url;
      picCache.set(key, d.url);
      return d.url;
    }
  } catch (e) {}
  return '';
}

async function resolveUrl(source, id, preferredBr = null) {
  if (!id || String(id) === 'undefined') return null;
  const pref = preferredBr || getPreferredQuality();
  const key = `${source}:${id}:${pref}`;
  if (urlCache.has(key)) return urlCache.get(key);
  const isDynamicSource = (source === 'bilibili' || source === 'apple' || GD_CACHE_SOURCES.has(source));
  const brList = isDynamicSource ? [pref] : getBrFallbackList(pref);
  for (const br of brList) {
    try {
      const d = await api({ types: 'url', source, id, br: String(br) });
      if (d && d.url) {
        const r = { url: d.url, br: d.br || br, size: d.size || 0 };
        urlCache.set(key, r);
        return r;
      }
      if (d && d._noUrl) {
        return null;
      }
    } catch (e) { /* 换下一档 */ }
  }
  return null;
}

async function resolveAutosource(track) {
  if (!track || track.source === 'bilibili' || track.source === 'youtube') return null;
  const name = String(track.name || '').trim();
  const artist = Array.isArray(track.artist) && track.artist.length ? String(track.artist[0]).trim() : '';
  const album = String(track.album || '').trim();
  const isrc = String(track.isrc || '').trim();
  const duration = Number(track.duration) || 0;
  if (!name && !isrc) return null;
  try {
    const payload = JSON.stringify({ name, artist, album, isrc, duration });
    const d = await api({
      types: 'autosource',
      source: track.source || 'netease',
      br: String(getPreferredQuality()),
      name: payload
    });
    if (d && d.url && d.url !== 'err') {
      if (d.pic && !track.pic) track.pic = d.pic;
      if (d.lyric) track._rawLyric = d.lyric;
      if (d.tlyric) track._rawTlyric = d.tlyric;
      return { url: d.url, br: Number(d.br) || 320, size: Number(d.size) || 0 };
    }
  } catch (e) {}
  return null;
}

/* ---------- SVG 图标 ---------- */
const SVG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
const SVG_END = '</svg>';
const ICONS = {
  play: SVG_OPEN + '<polygon points="6 3 20 12 6 21 6 3" fill="currentColor" stroke="none"/>' + SVG_END,
  pause: SVG_OPEN + '<rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" fill="currentColor" stroke="none"/>' + SVG_END,
  prev: SVG_OPEN + '<polygon points="19 20 9 12 19 4 19 20" fill="currentColor" stroke="none"/><line x1="5" y1="19" x2="5" y2="5"/>' + SVG_END,
  next: SVG_OPEN + '<polygon points="5 4 15 12 5 20 5 4" fill="currentColor" stroke="none"/><line x1="19" y1="5" x2="19" y2="19"/>' + SVG_END,
  repeat: SVG_OPEN + '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>' + SVG_END,
  repeatOne: SVG_OPEN + '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><text x="12" y="17" text-anchor="middle" font-size="9" font-weight="bold" fill="currentColor" stroke="none">1</text>' + SVG_END,
  shuffle: SVG_OPEN + '<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>' + SVG_END,
  heart: SVG_OPEN + '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>' + SVG_END,
  heartFill: '<svg viewBox="0 0 24 24" fill="#f43f5e" stroke="#f43f5e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  lyrics: SVG_OPEN + '<rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" stroke-width="1.8" fill="none"/><text x="12" y="16.2" text-anchor="middle" font-size="11.5" font-weight="700" font-family="-apple-system, BlinkMacSystemFont, \'PingFang SC\', \'Microsoft YaHei\', sans-serif" fill="currentColor" stroke="none">词</text>' + SVG_END,
  mic: SVG_OPEN + '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>' + SVG_END,
  home: SVG_OPEN + '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>' + SVG_END,
  gear: SVG_OPEN + '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>' + SVG_END,
  sun: SVG_OPEN + '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>' + SVG_END,
  moon: SVG_OPEN + '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>' + SVG_END,
  music: SVG_OPEN + '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>' + SVG_END,
  volume: SVG_OPEN + '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>' + SVG_END,
  volLow: SVG_OPEN + '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>' + SVG_END,
  volMute: SVG_OPEN + '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>' + SVG_END,
  chevL: SVG_OPEN + '<polyline points="15 18 9 12 15 6"/>' + SVG_END,
  x: SVG_OPEN + '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' + SVG_END,
  expand: SVG_OPEN + '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>' + SVG_END,
  compress: SVG_OPEN + '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>' + SVG_END,
  list: SVG_OPEN + '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>' + SVG_END,
  clock: SVG_OPEN + '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' + SVG_END,
  sliders: SVG_OPEN + '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>' + SVG_END,
  pip: SVG_OPEN + '<rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12" y="10" width="8" height="6" rx="1"/>' + SVG_END,
  download: SVG_OPEN + '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>' + SVG_END,
  copy: SVG_OPEN + '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>' + SVG_END,
  more: SVG_OPEN + '<circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/><circle cx="5" cy="12" r="1.5"/>' + SVG_END,
  plus: SVG_OPEN + '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>' + SVG_END,
  search: SVG_OPEN + '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>' + SVG_END,
};
function setIcon(el, name) { if (el && ICONS[name]) el.innerHTML = ICONS[name]; }
function setPlayIcon(playing) {
  setIcon($('play-btn'), playing ? 'pause' : 'play');
  $('play-btn').classList.toggle('pausing', playing);
  const npb = $('np-play');
  if (npb) {
    setIcon(npb, playing ? 'pause' : 'play');
    npb.classList.toggle('pausing', playing);
  }
  const lpb = $('lyrics-play-ic');
  if (lpb) {
    setIcon(lpb, playing ? 'pause' : 'play');
    const lbtn = $('lyrics-play');
    if (lbtn) lbtn.classList.toggle('pausing', playing);
  }
}
function setBuffering(on) {
  $('buffer-hint').hidden = !on;
  if (on) {
    $('play-btn').innerHTML = '<span class="spinner"></span>';
    const npb = $('np-play');
    if (npb) npb.innerHTML = '<span class="spinner"></span>';
  } else {
    setPlayIcon(!audio.paused);
  }
}

/* ---------- 主题（深色/浅色一键切换） ---------- */
function applyTheme() {
  const light = localStorage.getItem('mp_theme') === 'light';
  document.body.classList.toggle('light', light);
  setIcon($('theme-ic'), light ? 'moon' : 'sun');
  $('theme-label').textContent = light ? '深色模式' : '浅色模式';
}

/* ---------- 歌词解析与渲染 ---------- */
function parseLrc(lrc, tlrc) {
  const trans = {};
  if (tlrc) {
    for (const m of tlrc.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]([^\n]*)/g)) {
      const t = (+m[1]) * 60 + (+m[2]);
      trans[t.toFixed(2)] = m[3].trim();
    }
  }
  const lines = [];
  if (lrc) {
    for (const m of lrc.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]([^\n]*)/g)) {
      const t = (+m[1]) * 60 + (+m[2]);
      const text = m[3].trim();
      if (!text) continue;
      lines.push({ t, text, trans: trans[t.toFixed(2)] || '' });
    }
  }
  lines.sort((a, b) => a.t - b.t);
  return lines;
}

async function loadLyric(track) {
  const key = track.source + ':' + track.id;
  if (lyricCache.has(key)) return lyricCache.get(key);
  let lines = [];
  try {
    // 1. YouTube 原生歌词：优先使用 YouTube 自带的同步时间轴字幕
    if (track.source === 'youtube' && track._rawLrc) {
      lines = parseLrc(track._rawLrc, '');
      if (lines.length) {
        lyricCache.set(key, lines);
        return lines;
      }
    }

    if (track._rawLyric) {
      lines = parseLrc(track._rawLyric, track._rawTlyric || '');
      if (lines.length) {
        lyricCache.set(key, lines);
        return lines;
      }
    }

    let lid = track.lyric_id;
    let lsrc = track._lyricSource || (track.source === 'youtube' ? 'netease' : track.source);

    if (lid && lsrc !== 'bilibili') {
      const d = await api({ types: 'lyric', source: lsrc, id: lid });
      if (d && (d.lyric || d.tlyric)) lines = parseLrc(d.lyric || '', d.tlyric || '');
    }

    // YouTube / B站歌曲或原平台无歌词歌曲：自动通过智能清洗后的歌名+歌手跨源检索同步歌词
    if (!lines.length) {
      const cleanName = cleanSongTitle(track.name);
      const artistStr = (track.artist || []).filter(a => a !== 'YouTube' && a !== '未知歌手').join(' ');
      let query = (lsrc === 'bilibili' ? cleanName : (cleanName + ' ' + artistStr)).trim();
      let d = await api({ types: 'search', source: 'netease', name: query, count: '3' });
      let list = Array.isArray(d) ? d : [];

      if (!list.length && cleanName.includes(' - ')) {
        const parts = cleanName.split(' - ');
        d = await api({ types: 'search', source: 'netease', name: `${parts[1]} ${parts[0]}`.trim(), count: '3' });
        list = Array.isArray(d) ? d : [];
      }
      if (!list.length && cleanName.includes(' - ')) {
        d = await api({ types: 'search', source: 'netease', name: cleanName.split(' - ')[1].trim(), count: '3' });
        list = Array.isArray(d) ? d : [];
      }

      if (list.length > 0) {
        const matchLid = String(list[0].lyric_id || list[0].id);
        const matchSrc = list[0].source || 'netease';
        const lrcRes = await api({ types: 'lyric', source: matchSrc, id: matchLid });
        if (lrcRes && (lrcRes.lyric || lrcRes.tlyric)) {
          lines = parseLrc(lrcRes.lyric || '', lrcRes.tlyric || '');
        }
      }
    }
  } catch (e) {
    console.warn('Lyric load error:', e);
  }
  lyricCache.set(key, lines);
  return lines;
}

let lyricFontSize = parseInt(localStorage.getItem('mp_lyric_size') || '16', 10) || 16;
document.documentElement.style.setProperty('--lyric-font-size', lyricFontSize + 'px');

function renderLyric(lines) {
  const body = $('lyrics-body');
  body.innerHTML = '';
  currentLyricIndex = -1;
  isUserScrollingLyrics = false;
  if (!lines.length) {
    body.innerHTML = '<div class="lyrics-empty">暂无歌词</div>';
    return;
  }
  lines.forEach((ln, i) => {
    const div = document.createElement('div');
    div.className = 'lyric-line';
    div.dataset.i = i;
    div.innerHTML = escapeHtml(ln.text) + (ln.trans ? `<span class="trans">${escapeHtml(ln.trans)}</span>` : '');
    div.onclick = () => {
      audio.currentTime = ln.t + 0.01;
      isUserScrollingLyrics = false;
      centerCurrentLyric();
    };
    body.appendChild(div);
  });
  setTimeout(centerCurrentLyric, 80);
}

let lyricLines = [];
let lyricDelayMs = parseInt(localStorage.getItem('mp_lyric_delay') || '520', 10) || 0;
let currentLyricIndex = -1;
let isUserScrollingLyrics = false;
let userLyricsScrollTimer = null;

function onLyricsUserScroll() {
  isUserScrollingLyrics = true;
  clearTimeout(userLyricsScrollTimer);
  userLyricsScrollTimer = setTimeout(() => {
    isUserScrollingLyrics = false;
    centerCurrentLyric();
  }, 2800);
}

function centerCurrentLyric(immediate = false) {
  const panel = $('lyrics-panel');
  if (!panel || panel.hidden) return;
  const body = $('lyrics-body');
  if (!body) return;
  const cur = body.children[currentLyricIndex];
  if (!cur || !cur.classList.contains('lyric-line')) return;

  const bodyRect = body.getBoundingClientRect();
  const curRect = cur.getBoundingClientRect();
  const curCenter = curRect.top + curRect.height / 2;
  const bodyCenter = bodyRect.top + bodyRect.height / 2;
  const diff = curCenter - bodyCenter;

  if (!immediate && Math.abs(diff) < 2) return;

  const targetTop = body.scrollTop + diff;
  body.scrollTo({
    top: Math.max(0, targetTop),
    behavior: immediate ? 'auto' : 'smooth'
  });
}

function syncLyricTime(timeSec) {
  if (!lyricLines.length) return;
  const t = timeSec + lyricDelayMs / 1000;
  let idx = 0;
  for (let i = 0; i < lyricLines.length; i++) {
    if (lyricLines[i].t <= t + 0.15) idx = i; else break;
  }

  if (currentLyricIndex !== idx) {
    currentLyricIndex = idx;
    if (!$('lyrics-panel').hidden) {
      const body = $('lyrics-body');
      const prev = body.querySelector('.lyric-line.active');
      const cur = body.children[idx];
      if (prev && prev !== cur) prev.classList.remove('active');
      if (cur) {
        cur.classList.add('active');
        if (!isUserScrollingLyrics) {
          centerCurrentLyric();
        }
      }
    }
  }

  // 同步绘制画中画悬浮歌词
  if (isPipActive) drawPipFrame();
}

function syncLyric() {
  syncLyricTime(audio.currentTime);
}

/* ---------- 复制歌词 ---------- */
function copyLyrics() {
  if (!lyricLines.length) { toast('当前没有可复制的歌词'); return; }
  const t = currentTrack();
  const header = t ? `${t.name} - ${t.artist.join('/')}\n\n` : '';
  const text = lyricLines.map(l => l.text + (l.trans ? ` (${l.trans})` : '')).join('\n');
  navigator.clipboard.writeText(header + text).then(() => {
    toast('歌词已复制到剪贴板 📋');
  }).catch(() => {
    toast('复制失败，请手动选取');
  });
}

/* ---------- 全屏环境光（仅电脑端） ---------- */
let ambientToken = 0;
let ambientSlide = 0;
async function setAmbient(picUrl, force) {
  const amb = $('ambient');
  if (!amb) return;
  if (!picUrl || (window.innerWidth <= 860 && !force)) { amb.classList.remove('on'); return; }
  const my = ++ambientToken;
  const url = imgSrc(picUrl);
  const pre = new Image();
  pre.src = url;
  await new Promise((res) => { pre.onload = res; pre.onerror = res; });
  if (my !== ambientToken) return;
  const cssUrl = `url("${url.replace(/"/g, '')}")`;
  const show = $('ambient-s' + (1 - ambientSlide));
  const hide = $('ambient-s' + ambientSlide);
  show.querySelector('.ambient-img').style.backgroundImage = cssUrl;
  show.querySelector('.ambient-glow').style.backgroundImage = cssUrl;
  show.classList.add('on');
  hide.classList.remove('on');
  ambientSlide = 1 - ambientSlide;
  amb.classList.add('on');
  amb.classList.toggle('paused', audio.paused);
}

/* ---------- 正在播放全屏 ---------- */
function syncNowPlaying(track) {
  const pic = track.pic ? imgSrc(track.pic) : '';
  const url = pic ? `url("${pic.replace(/"/g, '')}")` : '';
  $('np-bg').style.backgroundImage = url;
  $('np-cover').style.backgroundImage = url;
  $('np-glow').style.backgroundImage = url;
  $('np-cover-char').textContent = '';
  $('np-title').textContent = track.name;
  $('np-artist').textContent = track.artist.join(' / ');
  setIcon($('np-mode'), MODE_ICONS[playMode]);
  $('np-mode').title = MODE_TIP[playMode];
}
function openNowPlaying() {
  const t = currentTrack();
  if (!t) return;
  if (!t.pic && (t.pic_id || t.id) && t.source !== 'youtube') {
    resolvePic(t).then((picUrl) => {
      if (picUrl && currentTrack() === t) {
        syncNowPlaying(t);
        updatePlayerMeta(t, audio.paused);
      }
    });
  }
  syncNowPlaying(t);
  $('now-playing').hidden = false;
  $('now-playing').classList.toggle('paused', audio.paused);
  document.body.style.overflow = 'hidden';
  updateScreenWakeState();
}
function closeNowPlaying() {
  $('now-playing').hidden = true;
  document.body.style.overflow = '';
  updateScreenWakeState();
}

/* ---------- 播放器状态 ---------- */
const audio = $('audio');
if (audio) {
  audio.playsInline = true;
  audio.setAttribute('playsinline', '');
  audio.setAttribute('webkit-playsinline', '');
  audio.preload = 'auto';
}
let queue = [];        // 当前播放队列
let qIndex = -1;       // 当前下标
let playMode = 0;      // 0 顺序 1 随机 2 单曲循环
let favorites = [];
try { favorites = JSON.parse(localStorage.getItem('mp_fav') || '[]'); } catch (e) {}

// 自定义导入歌单与本地自建歌单
let customPlaylists = [];
try { customPlaylists = JSON.parse(localStorage.getItem('mp_playlists') || '[]'); } catch (e) {}
let localPlaylists = [];
try { localPlaylists = JSON.parse(localStorage.getItem('mp_local_playlists') || '[]'); } catch (e) {}

function savePlaylists() {
  try {
    localStorage.setItem('mp_playlists', JSON.stringify(customPlaylists));
    localStorage.setItem('mp_local_playlists', JSON.stringify(localPlaylists));
  } catch (e) {}
}

audio.volume = parseFloat(localStorage.getItem('mp_vol') || '0.8');
let prevVol = audio.volume || 0.8;
$('vol-slider').value = Math.round(audio.volume * 100);
updateVolIcon();

const MODE_ICONS = ['repeat', 'shuffle', 'repeatOne'];
const MODE_TIP = ['播放模式：顺序播放', '播放模式：随机播放', '播放模式：单曲循环'];

function currentTrack() { return queue[qIndex] || null; }

function setQueue(list, index = 0) {
  queue = [...list];
  qIndex = index;
  updateQueueUI();
}

function updateQueueUI() {
  const count = queue.length;
  $('queue-count-badge').textContent = `共 ${count} 首`;
  $('nav-queue-badge').textContent = count;
  $('pb-queue-badge').textContent = count;
  $('pb-queue-badge').hidden = count === 0;
  $('mnav-queue-badge').textContent = count;
  $('mnav-queue-badge').hidden = count === 0;
  renderQueueDrawer();
}

/* ---------- YouTube 歌曲原生音频与同步歌词解析器 (办公室内网穿透) ---------- */
async function resolveYouTubeAudioAndLyrics(track) {
  if (track._resolvedAudioUrl) {
    return { url: track._resolvedAudioUrl, br: track._resolvedBr || 320 };
  }
  const vid = track.youtubeId || track.ytId || (track.id || '').replace(/^yt_/, '');
  if (!vid) return null;

  const proxy = proxyBase();
  let info = null;

  // 1. 优先通过 Worker /yt-player 获取 YouTube 原生高保真音频流及字幕
  if (proxy) {
    try {
      info = await fetchJson(`${proxy}/yt-player?id=${encodeURIComponent(vid)}`);
    } catch (e) {}
  }

  // 2. 如果 Worker 未配置或未响应，尝试直接从 YouTube 接口获取
  if (!info || !info.audioUrl) {
    try {
      const YT_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
      const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${YT_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: vid,
          context: { client: { clientName: 'ANDROID_VR', clientVersion: '1.61.48' } }
        })
      });
      if (res.ok) {
        const d = await res.json();
        const formats = d.streamingData?.adaptiveFormats || [];
        const audios = formats.filter(f => f.mimeType && f.mimeType.startsWith('audio/'));
        if (audios.length) {
          audios.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
          const sel = audios.find(a => a.mimeType.includes('audio/mp4')) || audios[0];
          info = {
            audioUrl: sel.url,
            bitrate: sel.bitrate || 128000,
            duration: parseInt(d.videoDetails?.lengthSeconds || '0', 10),
            lyrics: ''
          };
        }
      }
    } catch (e) {}
  }

  if (info && info.audioUrl) {
    track._resolvedAudioUrl = info.audioUrl;
    track._resolvedBr = Math.round((info.bitrate || 128000) / 1000);
    if (info.lyrics) {
      track._rawLrc = info.lyrics;
    }
    return { url: info.audioUrl, br: track._resolvedBr };
  }

  return null;
}

let playSessionId = 0;
async function playTrack(index) {
  const track = queue[index];
  if (!track) return;
  const mySession = ++playSessionId;
  qIndex = index;
  markPlayingRow();

  const targetId = track.pic_id || track.id;
  const picKey = `${track.source || 'netease'}:${targetId}`;
  if (!track.pic && targetId && picCache.has(picKey)) {
    track.pic = picCache.get(picKey);
  }

  updatePlayerMeta(track, true);
  setBuffering(true);
  setAmbient(track.pic);
  if (!$('lyrics-panel').hidden && $('lyrics-panel').classList.contains('fullscreen')) syncLyricsAmbient();
  if (!$('now-playing').hidden) syncNowPlaying(track);
  updateQueueUI();

  // 异步补全封面（针对搜索结果默认仅含 pic_id 的歌曲）
  if (!track.pic && targetId && track.source !== 'youtube') {
    resolvePic(track).then((picUrl) => {
      if (picUrl && currentTrack() === track) {
        updatePlayerMeta(track, audio.paused);
        setAmbient(picUrl);
        if (!$('lyrics-panel').hidden && $('lyrics-panel').classList.contains('fullscreen')) syncLyricsAmbient();
        if (!$('now-playing').hidden) syncNowPlaying(track);
      }
    });
  }

  let r = null;

  // 1. YouTube 歌曲（无论自导歌单、YouTube 搜索还是单曲链接）
  // 针对公司网络屏蔽 YouTube，通过中转通道智能直通高保真音频流
  if (track.source === 'youtube') {
    r = await resolveYouTubeAudioAndLyrics(track);
    if (!r) {
      toast(`未能为《${track.name}》解析出音频流，已跳过`);
      setBuffering(false);
      nextTrack();
      return;
    }
    track._lastRes = r;
    updateQualityBadge(r, track);
  }
  // 2. 其他平台非 YouTube 歌曲
  else {
    if (track._needMatch && !track._matched) {
      const cleanName = cleanSongTitle(track.name);
      const query = (cleanName + ' ' + (track.artist || []).join(' ')).trim();
      const targetSource = (track.source && track.source !== 'all') ? track.source : 'netease';
      try {
        let d = await api({ types: 'search', source: targetSource, name: query, count: '5' });
        let list = Array.isArray(d) ? d : [];
        if (!list.length && targetSource !== 'netease') {
          d = await api({ types: 'search', source: 'netease', name: query, count: '5' });
          list = Array.isArray(d) ? d : [];
        }
        if (list.length) {
          const s = list[0];
          track.id = String(s.id);
          track.source = s.source || targetSource;
          track.pic_id = s.pic_id || '';
          track.lyric_id = s.lyric_id ? String(s.lyric_id) : String(s.id);
          if (!track.pic && s.pic) track.pic = s.pic;
          track._matched = true;
          const rows = document.querySelectorAll('.track-row');
          if (rows[index]) rows[index].dataset.key = trackKey(track);
        } else {
          toast(`未找到《${track.name}》对应音频，已跳过`);
          setBuffering(false);
          nextTrack();
          return;
        }
      } catch (e) {
        toast('音频匹配失败，已跳过');
        setBuffering(false);
        nextTrack();
        return;
      }
      if (mySession !== playSessionId || currentTrack() !== track) return;
      markPlayingRow();
    }

    // 优先调用 resolveUrl 获取最高品质（无损 Hi-Res / FLAC / 320K）
    r = await resolveUrl(track.source, track.id);
    if (mySession !== playSessionId || currentTrack() !== track) return;
    // 若主源受版权或地区限制无直链，优先调用 GDStudio 官方 autosource 自动换源引擎
    if (!r) {
      r = await resolveAutosource(track);
      if (mySession !== playSessionId || currentTrack() !== track) return;
    }
    if (!r) {
      try {
        const cleanName = cleanSongTitle(track.name);
        const query = (cleanName + ' ' + (track.artist || []).join(' ')).trim();
        const matched = await api({ types: 'search', source: 'netease', name: query, count: '5' });
        if (mySession !== playSessionId || currentTrack() !== track) return;
        const candidates = normalizeSearchList(matched, 'netease');
        for (const best of candidates) {
          if (String(best.id) === String(track.id) && track.source === 'netease') continue;
          const tryRes = (await resolveUrl('netease', best.id)) || (best._directUrl ? { url: best._directUrl, br: 320 } : null);
          if (mySession !== playSessionId || currentTrack() !== track) return;
          if (tryRes && tryRes.url) {
            track.id = String(best.id);
            track.source = 'netease';
            track.lyric_id = String(best.lyric_id || best.id);
            if (!track.pic && best.pic) track.pic = best.pic;
            if (!track.pic && best.pic_id) {
              track.pic_id = best.pic_id;
              resolvePic(track).then((picUrl) => {
                if (picUrl && currentTrack() === track) {
                  updatePlayerMeta(track, audio.paused);
                  setAmbient(picUrl);
                }
              });
            }
            const rows = document.querySelectorAll('.track-row');
            if (rows[index]) rows[index].dataset.key = trackKey(track);
            r = tryRes;
            break;
          }
        }
      } catch (e) {}
    }
    if (!r && track._directUrl) {
      r = { url: track._directUrl, br: 320 };
    }
    if (!r || !r.url) {
      try {
        const ytRes = await resolveYouTubeAudioAndLyrics(track);
        if (ytRes && ytRes.url) r = ytRes;
      } catch (e) {}
    }

    if (r) {
      track._lastRes = r;
      updateQualityBadge(r, track);
    }
  }

  if (mySession !== playSessionId || currentTrack() !== track) return;
  if (!r || !r.url) {
    toast('这首歌暂无可播放地址，已自动跳过');
    setBuffering(false);
    nextTrack();
    return;
  }

  // iOS Safari 下若带有 crossorigin 属性，在直连或重定向时极易触发 CORS 阻断导致后台断音
  if (!isIOS && isEqEnabled) {
    audio.crossOrigin = 'anonymous';
  } else {
    audio.removeAttribute('crossorigin');
  }
  audio.src = audioSrc(r.url);
  track._cdnUrl = r.url;
  track._lastRes = r;
  audioFallbackTried = false;
  updatePlayerMeta(track, false);
  try {
    await audio.play();
  } catch (e) {
    setBuffering(false);
    toast('浏览器拦截了自动播放，点一次播放键即可');
    return;
  }
  updateQualityBadge(r, track);

  lyricLines = await loadLyric(track);
  if (currentTrack() === track) renderLyric(lyricLines);
}

/* 实时音质信息解析：精准识别 Hi-Res 母带 (24bit)、FLAC 无损、320K 极高与 YouTube 原声 */
function formatQualityInfo(r, track) {
  if (!r) return { text: '320K', cls: 'quality-high', title: '极高音质 (320kbps)' };

  if (track && track.source === 'youtube') {
    const kbps = r.br ? Math.round(r.br > 1000 ? r.br / 1000 : r.br) : 160;
    return {
      text: `YouTube · ${kbps}K`,
      cls: 'quality-yt',
      title: `YouTube 官方原声音频流 (${kbps}kbps ${r.mimeType || 'Opus'})`
    };
  }
  if (track && track.source === 'bilibili') {
    const kbps = r.br && r.br > 0 ? Math.round(r.br) : 180;
    return {
      text: `B站 · ${kbps}K`,
      cls: 'quality-high',
      title: `Bilibili 原生动态码率音频流 (${kbps}kbps)`
    };
  }
  if (track && track.source === 'apple') {
    const kbps = r.br && r.br > 0 ? Math.round(r.br) : 256;
    return {
      text: `AAC · ${kbps}K`,
      cls: 'quality-high',
      title: `Apple Music 高品质 AAC 音频 (${kbps}kbps)`
    };
  }

  const url = String(r.url || '').toLowerCase();
  const isFlac = url.includes('.flac') || (r.mimeType && r.mimeType.includes('flac'));
  let br = Number(r.br) || 0;

  // 如果有文件大小和音频时长，但 br 为 0 或 999，计算真实瞬时码率
  if ((!br || br === 999) && r.size && audio.duration && isFinite(audio.duration) && audio.duration > 0) {
    br = Math.round((r.size * 8) / audio.duration / 1000);
  }

  if (isFlac || br >= 700) {
    const displayBr = br > 0 && br !== 999 ? `${br}K` : '无损';
    if (br >= 900 || br === 999) {
      return {
        text: `Hi-Res · ${displayBr}`,
        cls: 'quality-hires',
        title: `Hi-Res 高解析度无损母带 (${br > 0 && br !== 999 ? br + 'kbps FLAC' : 'FLAC'}) · 点击切换音质`
      };
    }
    return {
      text: `FLAC · ${displayBr}`,
      cls: 'quality-lossless',
      title: `SQ 无损音质 (${br > 0 ? br + 'kbps FLAC' : 'FLAC 16bit'}) · 点击切换音质`
    };
  }

  if (br >= 300) {
    return {
      text: '320K · 极高',
      cls: 'quality-high',
      title: '极高音质 (320kbps MP3) · 点击切换音质'
    };
  }

  if (br >= 180) {
    return {
      text: '192K · 高品',
      cls: 'quality-medium',
      title: '高品质 (192kbps MP3) · 点击切换音质'
    };
  }

  return {
    text: '128K · 标准',
    cls: 'quality-standard',
    title: '标准音质 (128kbps MP3) · 点击切换音质'
  };
}

function updateQualityBadge(r, track) {
  const badge = $('quality-badge');
  if (!badge) return;
  const info = formatQualityInfo(r, track);
  badge.textContent = info.text;
  badge.title = info.title;
  badge.className = `quality-badge ${info.cls}`;
  badge.hidden = false;
  syncQualityMenuState();
}

function syncQualityMenuState() {
  const pref = getPreferredQuality();
  document.querySelectorAll('.quality-opt').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.quality === String(pref));
  });
  const sel = $('pref-quality-select');
  if (sel) sel.value = String(pref);
}

/* 动态音质即时切换引擎：保持当前播放进度秒级无缝热切换 */
async function switchQuality(targetBr) {
  localStorage.setItem('mp_preferred_quality', String(targetBr));
  urlCache.clear();
  syncQualityMenuState();
  const track = currentTrack();
  if (!track) {
    toast(`已保存默认音质偏好：${targetBr === 999 ? 'Hi-Res 无损母带' : targetBr + 'K'}`);
    return;
  }
  if (track.source === 'youtube') {
    toast('YouTube 官方音源已自动输出最高可用码率');
    return;
  }

  toast(`正在切换至 ${targetBr === 999 ? 'Hi-Res / FLAC 无损' : targetBr + 'K'} 音质…`);
  const curTime = audio.currentTime;
  const wasPaused = audio.paused;
  try {
    const r = await resolveUrl(track.source, track.id, targetBr);
    if (r && r.url) {
      track._cdnUrl = r.url;
      track._lastRes = r;
      if (!isIOS && isEqEnabled) {
        audio.crossOrigin = 'anonymous';
      } else {
        audio.removeAttribute('crossorigin');
      }
      audio.src = audioSrc(r.url);
      audio.currentTime = curTime;
      if (!wasPaused) {
        audio.play().catch(() => {});
      }
      updateQualityBadge(r, track);
      const info = formatQualityInfo(r, track);
      toast(`✨ 音质已切换为：${info.text}`);
    } else {
      toast('当前歌曲无此档位音质，已保持原样播放');
    }
  } catch (e) {
    toast('音质切换失败，请稍后再试');
  }
}

function updatePlayerMeta(track, loading) {
  const pic = track.pic ? imgSrc(track.pic) : '';
  $('pb-tile').innerHTML = pic
    ? `<img src="${pic}" alt="" onerror="this.remove()">`
    : `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" opacity="0.4"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
  if ($('lyrics-panel') && !$('lyrics-panel').hidden) syncLyricsAmbient();
  const glow = $('pb-glow');
  if (pic) {
    glow.style.backgroundImage = `url("${pic.replace(/"/g, '')}")`;
    glow.classList.add('on');
  } else {
    glow.style.backgroundImage = '';
    glow.classList.remove('on');
  }
  $('pb-title').textContent = track.name;
  $('pb-artist').textContent = track.artist.join(' / ') + (loading ? '（加载中…）' : '');
  $('lyrics-title').textContent = track.name;
  $('lyrics-artist').textContent = track.artist.join(' / ');
  const lst = $('lyrics-side-title'); if (lst) lst.textContent = track.name;
  const lsa = $('lyrics-side-artist'); if (lsa) lsa.textContent = track.artist.join(' / ');
  const lc = $('lyrics-cover');
  if (lc) {
    if (pic) { lc.src = pic; lc.style.display = 'block'; }
    else { lc.removeAttribute('src'); lc.style.display = 'none'; }
  }
  const lhc = $('lyrics-head-cover');
  if (lhc) {
    if (pic) { lhc.src = pic; }
    else { lhc.removeAttribute('src'); }
  }
  const vc = $('vinyl-center-img');
  if (vc) {
    if (pic) { vc.src = pic; }
    else { vc.removeAttribute('src'); }
  }
  updateFavBtn();
  document.title = `${track.name} - ${track.artist.join('/')} | 音乐播放器`;

  updateMediaSessionMeta(track);
}

/* ---------- Media Session 控制与锁屏交互增强 (iOS / Android 锁屏与控制中心深度支持) ---------- */
function updateMediaSessionMeta(track) {
  if (!('mediaSession' in navigator) || !track) return;
  try {
    let fullArtUrl = '';
    const rawPic = track.pic ? imgSrc(track.pic) : '';
    if (rawPic) {
      try {
        fullArtUrl = new URL(rawPic, window.location.href).href;
      } catch (e) {
        fullArtUrl = rawPic;
      }
    }
    const artistStr = Array.isArray(track.artist) ? track.artist.join(' / ') : String(track.artist || '');
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.name || '音乐播放器',
      artist: artistStr || '未知歌手',
      album: track.album || '多源音乐',
      artwork: fullArtUrl ? [
        { src: fullArtUrl, sizes: '96x96', type: 'image/jpeg' },
        { src: fullArtUrl, sizes: '128x128', type: 'image/jpeg' },
        { src: fullArtUrl, sizes: '256x256', type: 'image/jpeg' },
        { src: fullArtUrl, sizes: '512x512', type: 'image/jpeg' }
      ] : []
    });

    navigator.mediaSession.setActionHandler('play', () => {
      audio.play().catch(() => {});
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      audio.pause();
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      prevTrack();
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      nextTrack(false);
    });
    try {
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime != null && isFinite(details.seekTime)) {
          audio.currentTime = details.seekTime;
          updateMediaSessionPosition(true);
        }
      });
    } catch (e) {}
    // 明确注销快进/快退 10 秒处理器，强制 iOS 锁屏与控制中心显示【上一首】与【下一首】切歌按键（非播客模式）
    try { navigator.mediaSession.setActionHandler('seekbackward', null); } catch (e) {}
    try { navigator.mediaSession.setActionHandler('seekforward', null); } catch (e) {}
  } catch (e) {
    console.warn('MediaSession metadata 注册异常:', e);
  }
}

function updateMediaSessionPlaybackState(isPlaying) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  } catch (e) {}
}

let lastPositionUpdateTime = 0;
function updateMediaSessionPosition(force = false) {
  if (!('mediaSession' in navigator) || !('setPositionState' in navigator.mediaSession)) return;
  const now = performance.now();
  if (!force && now - lastPositionUpdateTime < 1200) return;
  lastPositionUpdateTime = now;

  const dur = audio.duration;
  if (dur && isFinite(dur) && dur > 0) {
    try {
      const cur = Math.min(Math.max(0, audio.currentTime), dur);
      navigator.mediaSession.setPositionState({
        duration: dur,
        playbackRate: audio.playbackRate || 1,
        position: cur
      });
    } catch (e) {}
  }
}

function updateFavBtn() {
  const t = currentTrack();
  const loved = t && favorites.some((f) => f.id === t.id && f.source === t.source);
  setIcon($('fav-btn'), loved ? 'heartFill' : 'heart');
}

function togglePlay() {
  if (!currentTrack()) { toast('先搜一首歌或打开榜单吧'); return; }
  if (audio.paused) {
    audio.play();
    setPlayIcon(true);
  } else {
    audio.pause();
    setPlayIcon(false);
  }
}

function nextTrack(auto) {
  if (!queue.length) return;
  let i;
  if (playMode === 1 && queue.length > 1) {
    do { i = Math.floor(Math.random() * queue.length); } while (i === qIndex);
  } else if (playMode === 2 && auto) {
    i = qIndex;
  } else {
    i = (qIndex + 1) % queue.length;
  }
  playTrack(i);
}

function prevTrack() {
  if (!queue.length) return;
  playTrack((qIndex - 1 + queue.length) % queue.length);
}

/* ---------- 播放队列管理 ---------- */
function openQueue() {
  renderQueueDrawer();
  $('queue-drawer').hidden = false;
  $('queue-mask').hidden = false;
  const activeItem = $('queue-track-list').querySelector('.queue-item.active');
  if (activeItem) activeItem.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
function closeQueue() {
  $('queue-drawer').hidden = true;
  $('queue-mask').hidden = true;
}
function toggleQueue() {
  if ($('queue-drawer').hidden) openQueue(); else closeQueue();
}

function renderQueueDrawer() {
  const box = $('queue-track-list');
  box.innerHTML = '';
  $('queue-empty').hidden = queue.length > 0;
  queue.forEach((t, i) => {
    const item = document.createElement('div');
    item.className = 'queue-item' + (i === qIndex ? ' active' : '');
    item.innerHTML = `
      <span class="queue-idx">${i === qIndex ? '▶' : i + 1}</span>
      <div class="queue-main">
        <div class="queue-title">${escapeHtml(t.name)}</div>
        <div class="queue-artist">${escapeHtml(t.artist.join(' / '))}</div>
      </div>
      <span class="queue-dur">${t.duration ? fmtTime(t.duration) : ''}</span>
      <button class="queue-del" title="移出队列">&times;</button>
    `;
    item.onclick = (e) => {
      if (e.target.closest('.queue-del')) return;
      playTrack(i);
    };
    item.querySelector('.queue-del').onclick = (e) => {
      e.stopPropagation();
      removeFromQueue(i);
    };
    box.appendChild(item);
  });
}

function removeFromQueue(index) {
  if (index < 0 || index >= queue.length) return;
  queue.splice(index, 1);
  if (qIndex === index) {
    if (queue.length === 0) {
      audio.pause();
      audio.src = '';
      qIndex = -1;
      $('pb-title').textContent = '还没有播放歌曲';
      $('pb-artist').textContent = '搜一首歌或点开榜单开始吧';
      setPlayIcon(false);
    } else {
      qIndex = qIndex % queue.length;
      playTrack(qIndex);
    }
  } else if (qIndex > index) {
    qIndex--;
  }
  updateQueueUI();
  toast('已从队列移出');
}

function clearQueue() {
  if (!queue.length) return;
  queue = [];
  qIndex = -1;
  audio.pause();
  audio.src = '';
  updateQueueUI();
  $('pb-title').textContent = '还没有播放歌曲';
  $('pb-artist').textContent = '搜一首歌或点开榜单开始吧';
  setPlayIcon(false);
  toast('已清空播放队列');
}

function addToQueue(track, playNext = false) {
  if (playNext && qIndex >= 0) {
    queue.splice(qIndex + 1, 0, track);
    toast(`已添加为下一首播放：《${track.name}》`);
  } else {
    queue.push(track);
    toast(`已添加到队列末尾：《${track.name}》`);
  }
  updateQueueUI();
  if (queue.length === 1) playTrack(0);
}

/* ---------- 列表渲染 ---------- */
function trackKey(t) { return (t.source || 'music') + ':' + (t.id || t.ytId || t.name); }

let currentRenderedTracks = [];

function renderTrackList(tracks, title, subtitle = '') {
  currentRenderedTracks = tracks;
  $('view-home').hidden = true;
  $('view-list').hidden = false;
  $('list-title').textContent = title;
  $('list-subtitle').textContent = subtitle;
  const box = $('track-list');
  box.innerHTML = '';
  $('list-empty').hidden = tracks.length > 0;
  if (tracks.length > 0) {
    const head = document.createElement('div');
    head.className = 'track-head';
    head.innerHTML = '<span>#</span><span>标题</span><span class="th-album">专辑 / 来源</span><span class="th-dur">时长</span><span></span><span></span>';
    box.appendChild(head);
  }
  tracks.forEach((t, i) => {
    const row = document.createElement('div');
    row.className = 'track-row';
    row.dataset.key = trackKey(t);
    const loved = favorites.some((f) => f.id === t.id && f.source === t.source);
    const sourceLabelMap = { netease: '网易云', kuwo: '酷我音乐', joox: 'JOOX', bilibili: 'B站音乐', apple: '苹果 Apple', youtube: 'YouTube' };
    const albumDisplay = t.album || sourceLabelMap[t.source] || '—';
    row.innerHTML = `
      <span class="track-idx">${i + 1}</span>
      <div class="track-main">
        <div class="track-name">${escapeHtml(t.name)}</div>
        <div class="track-sub">${escapeHtml(t.artist.join(' / '))}</div>
      </div>
      <span class="track-album">${escapeHtml(albumDisplay)}</span>
      <span class="track-dur">${t.duration ? fmtTime(t.duration) : '—'}</span>
      <button class="row-fav${loved ? ' loved' : ''}" title="收藏">${loved ? ICONS.heartFill : ICONS.heart}</button>
      <button class="row-more" title="更多操作">${ICONS.more}</button>
    `;
    row.onclick = (e) => {
      if (e.target.closest('.row-fav') || e.target.closest('.row-more')) return;
      setQueue(tracks, i);
      playTrack(i);
    };
    const favBtn = row.querySelector('.row-fav');
    favBtn.onclick = (e) => {
      e.stopPropagation();
      toggleFav(t);
      const nowLoved = favorites.some((f) => f.id === t.id && f.source === t.source);
      setIcon(favBtn, nowLoved ? 'heartFill' : 'heart');
      favBtn.classList.toggle('loved', nowLoved);
    };
    const moreBtn = row.querySelector('.row-more');
    moreBtn.onclick = (e) => {
      e.stopPropagation();
      openTrackMenu(t, moreBtn);
    };
    box.appendChild(row);
  });
  markPlayingRow();
  window.scrollTo({ top: 0 });
}

function markPlayingRow() {
  document.querySelectorAll('.track-row').forEach((r) => r.classList.remove('playing'));
  const t = currentTrack();
  if (!t) return;
  const row = document.querySelector(`.track-row[data-key="${CSS.escape(trackKey(t))}"]`);
  if (row) row.classList.add('playing');
}

function toggleFav(t) {
  const i = favorites.findIndex((f) => f.id === t.id && f.source === t.source);
  if (i >= 0) {
    favorites.splice(i, 1);
    toast('已取消收藏');
  } else {
    favorites.unshift({ ...t });
    toast('已加入收藏');
  }
  localStorage.setItem('mp_fav', JSON.stringify(favorites.slice(0, 1000)));
  updateFavBtn();
}

/* ---------- 歌曲浮层操作菜单 ---------- */
let activeMenuTrack = null;
function openTrackMenu(track, triggerEl) {
  activeMenuTrack = track;
  const menu = $('track-menu');
  menu.hidden = false;
  const rect = triggerEl.getBoundingClientRect();
  const menuWidth = 175;
  let left = rect.left - menuWidth + 20;
  if (left < 10) left = 10;
  let top = rect.bottom + 4;
  if (top + 220 > window.innerHeight) top = rect.top - 210;
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
}
function closeTrackMenu() {
  $('track-menu').hidden = true;
  activeMenuTrack = null;
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('#track-menu') && !e.target.closest('.row-more') && !e.target.closest('#pb-more-btn')) {
    closeTrackMenu();
  }
});
$('track-menu').addEventListener('click', (e) => {
  const btn = e.target.closest('.track-menu-item');
  if (!btn || !activeMenuTrack) return;
  const action = btn.dataset.action;
  const t = activeMenuTrack;
  closeTrackMenu();

  if (action === 'play') {
    setQueue([t, ...queue.filter(x => trackKey(x) !== trackKey(t))], 0);
    playTrack(0);
  } else if (action === 'next') {
    addToQueue(t, true);
  } else if (action === 'add-queue') {
    addToQueue(t, false);
  } else if (action === 'add-playlist') {
    openAddToPlaylistModal(t);
  } else if (action === 'download') {
    downloadAudio(t);
  } else if (action === 'copy') {
    navigator.clipboard.writeText(`${t.name} - ${t.artist.join('/')}`).then(() => toast('歌曲信息已复制 📋'));
  }
});

/* ---------- 下载音频 ---------- */
async function downloadAudio(t) {
  toast(`正在准备下载《${t.name}》…`);
  try {
    let r = await resolveUrl(t.source, t.id);
    if (!r && t.source !== 'netease') {
      const cleanName = cleanSongTitle(t.name);
      const query = (cleanName + ' ' + (t.artist || []).join(' ')).trim();
      const matched = await api({ types: 'search', source: 'netease', name: query, count: '3' });
      if (Array.isArray(matched) && matched.length > 0) {
        r = await resolveUrl('netease', matched[0].id);
      }
    }
    if (!r || !r.url) throw new Error('未获取到有效音频地址');
    const proxy = proxyBase();
    const finalUrl = proxy ? proxy + '/audio?src=' + encodeURIComponent(r.url) : r.url;
    const a = document.createElement('a');
    a.href = finalUrl;
    a.download = `${t.name} - ${t.artist.join('、')}.mp3`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast(`已开始下载《${t.name}》`);
  } catch (e) {
    toast('下载失败：' + (e.message || '网络异常'));
  }
}

/* ---------- 首页自建歌单与官方榜单渲染 ---------- */
function renderCharts() {
  // 1. 自建歌单渲染
  const customGrid = $('custom-playlist-grid');
  customGrid.innerHTML = '';

  localPlaylists.forEach((pl, idx) => {
    const card = document.createElement('div');
    card.className = 'chart-card';
    card.innerHTML = `
      <div class="chart-tile" style="background:rgba(29, 185, 84, 0.15);color:var(--accent)"><span>🎵</span></div>
      <div class="chart-name">${escapeHtml(pl.name)}</div>
      <div class="chart-sub">${pl.tracks.length} 首 · 自建歌单</div>
    `;
    card.onclick = () => openLocalPlaylist(idx);
    card.oncontextmenu = (e) => { e.preventDefault(); delLocalPlaylist(idx); };
    customGrid.appendChild(card);
  });

  // 自定义外部导入的歌单
  customPlaylists.forEach((p, pi) => {
    const card = document.createElement('div');
    card.className = 'chart-card';
    const count = p.trackCount || p.tracks.length;
    card.innerHTML = `
      <div class="chart-tile" style="background:rgba(80, 120, 255, 0.14);color:#6f8dff"><span>📥</span></div>
      <div class="chart-name">${escapeHtml(p.name)}</div>
      <div class="chart-sub">${count}首 · 外部导入</div>
    `;
    card.onclick = () => openCustomPlaylist(pi);
    card.oncontextmenu = (e) => { e.preventDefault(); delPlaylist(pi); };
    customGrid.appendChild(card);
  });

  // + 导入与新建卡片
  const addPlCard = document.createElement('div');
  addPlCard.className = 'chart-card chart-add';
  addPlCard.innerHTML = `
    <div class="chart-tile chart-add-tile"><span style="font-size:36px">＋</span></div>
    <div class="chart-name">新建本地歌单</div>
    <div class="chart-sub">创建个人音乐集合</div>
  `;
  addPlCard.onclick = openCreatePlaylistModal;
  customGrid.appendChild(addPlCard);

  const importCard = document.createElement('div');
  importCard.className = 'chart-card chart-add';
  importCard.innerHTML = `
    <div class="chart-tile chart-add-tile"><span style="font-size:32px">📥</span></div>
    <div class="chart-name">导入外部歌单</div>
    <div class="chart-sub">网易/Spotify/YouTube</div>
  `;
  importCard.onclick = openImportModal;
  customGrid.appendChild(importCard);

  // 2. 官方榜单渲染
  const grid = $('chart-grid');
  grid.innerHTML = '';
  CHARTS.forEach((c) => {
    const card = document.createElement('div');
    card.className = 'chart-card';
    card.innerHTML = `
      <div class="chart-tile"><span>${escapeHtml(c.name.charAt(0))}</span>${c.cover ? `<img loading="lazy" src="${imgSrc(c.cover)}" alt="" onerror="this.remove()">` : ''}</div>
      <div class="chart-name">${c.name}</div>
      <div class="chart-sub">官方榜单 · 点击聆听</div>
    `;
    card.onclick = () => openChart(c);
    grid.appendChild(card);
  });

  // 3. 侧边栏歌单与榜单渲染
  const sidePl = $('side-custom-playlists');
  sidePl.innerHTML = '';
  localPlaylists.forEach((pl, idx) => {
    const b = document.createElement('button');
    b.className = 'side-chart-link';
    b.innerHTML = `<span>🎵 ${escapeHtml(pl.name)}</span><span>${pl.tracks.length}</span>`;
    b.onclick = () => openLocalPlaylist(idx);
    sidePl.appendChild(b);
  });
  customPlaylists.forEach((p, pi) => {
    const b = document.createElement('button');
    b.className = 'side-chart-link';
    b.innerHTML = `<span>📥 ${escapeHtml(p.name)}</span><span>›</span>`;
    b.onclick = () => openCustomPlaylist(pi);
    sidePl.appendChild(b);
  });

  const sideCharts = $('side-charts');
  sideCharts.innerHTML = '';
  CHARTS.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'side-chart-link';
    b.innerHTML = `<span>${c.name}</span><span>›</span>`;
    b.onclick = () => openChart(c);
    sideCharts.appendChild(b);
  });
}

/* ---------- 本地自建歌单操作 ---------- */
function openLocalPlaylist(idx) {
  const pl = localPlaylists[idx];
  if (!pl) return;
  $('load-more-wrap').hidden = true;
  renderTrackList(pl.tracks, pl.name, `自建歌单 · 共 ${pl.tracks.length} 首歌曲`);
}

function delLocalPlaylist(idx) {
  const pl = localPlaylists[idx];
  if (!pl) return;
  if (!confirm(`确定删除歌单「${pl.name}」吗？（不会影响已收藏的歌曲）`)) return;
  localPlaylists.splice(idx, 1);
  savePlaylists();
  renderCharts();
  toast('已删除歌单');
}

function openCreatePlaylistModal() {
  $('playlist-modal').hidden = false;
  $('pl-create-view').hidden = false;
  $('pl-select-view').hidden = true;
  $('pl-name-input').value = '';
  setTimeout(() => $('pl-name-input').focus(), 50);
}

function doCreatePlaylist() {
  const name = $('pl-name-input').value.trim();
  if (!name) { toast('请输入歌单名称'); return; }
  localPlaylists.push({
    id: 'pl_' + Date.now(),
    name,
    tracks: [],
    createdAt: Date.now()
  });
  savePlaylists();
  renderCharts();
  $('playlist-modal').hidden = true;
  toast(`歌单「${name}」创建成功！`);
}

let pendingTrackToAdd = null;
function openAddToPlaylistModal(track) {
  pendingTrackToAdd = track;
  $('playlist-modal').hidden = false;
  $('pl-create-view').hidden = true;
  $('pl-select-view').hidden = false;
  $('pl-target-song-name').textContent = track.name;

  const list = $('pl-select-list');
  list.innerHTML = '';
  if (!localPlaylists.length) {
    list.innerHTML = '<div style="color:var(--muted);text-align:center;padding:16px">还没有自建歌单，先新建一个吧</div>';
  } else {
    localPlaylists.forEach((pl, idx) => {
      const item = document.createElement('div');
      item.className = 'pl-select-item';
      item.innerHTML = `<span>🎵 ${escapeHtml(pl.name)}</span><span style="color:var(--muted);font-size:12px">${pl.tracks.length} 首</span>`;
      item.onclick = () => {
        addTrackToLocalPlaylist(idx, pendingTrackToAdd);
        $('playlist-modal').hidden = true;
      };
      list.appendChild(item);
    });
  }
}

function addTrackToLocalPlaylist(plIdx, track) {
  const pl = localPlaylists[plIdx];
  if (!pl) return;
  if (pl.tracks.some(t => trackKey(t) === trackKey(track))) {
    toast(`歌单中已有这首歌`);
    return;
  }
  pl.tracks.push({ ...track });
  savePlaylists();
  renderCharts();
  toast(`已加入歌单「${pl.name}」`);
}

function delPlaylist(pi) {
  if (!confirm(`删除导入的歌单「${customPlaylists[pi].name}」？`)) return;
  customPlaylists.splice(pi, 1);
  savePlaylists();
  renderCharts();
  toast('已删除');
}

async function openCustomPlaylist(pi) {
  const p = customPlaylists[pi];
  if (!p) return;
  $('load-more-wrap').hidden = true;
  $('view-home').hidden = true;
  $('view-list').hidden = false;
  $('list-title').textContent = p.name;
  if (p.platform === 'netease' && p.playlistId) {
    showListLoading(true);
    $('track-list').innerHTML = '';
    try {
      const d = await api({ types: 'playlist', id: p.playlistId });
      const tracks = (d.playlist.tracks || []).map((t) => ({
        id: String(t.id),
        name: t.name,
        artist: (t.ar || []).map((a) => a.name),
        album: (t.al || {}).name || '',
        pic: (t.al || {}).picUrl || '',
        lyric_id: String(t.id),
        source: 'netease',
        duration: t.dt ? Math.round(t.dt / 1000) : 0,
      }));
      showListLoading(false);
      renderTrackList(tracks, p.name, `网易云导入 · ${tracks.length}首`);
    } catch (e) {
      showListLoading(false);
      toast('歌单加载失败');
    }
    return;
  }

  // 严格按歌单源对应："哪里来的就找哪里的"，YouTube 歌单自动对应 YouTube 原生音源
  const isYouTube = p.platform === 'youtube';
  const tracks = (p.tracks || []).map((t, idx) => {
    const yId = t.youtubeId || t.ytId || (isYouTube ? t.id : '');
    const source = isYouTube ? 'youtube' : (t.source || p.platform || 'netease');
    let artistArr = [];
    if (Array.isArray(t.artist)) artistArr = t.artist;
    else if (typeof t.artist === 'string' && t.artist) artistArr = [t.artist];
    else {
      const parts = String(t.title || t.name || '').split(' - ');
      if (parts.length >= 2) artistArr = [parts[0].trim()];
      else if (source === 'youtube') artistArr = ['YouTube'];
    }

    return {
      id: yId ? `yt_${yId}` : (t.id || `import-${pi}-${idx}`),
      ytId: yId,
      youtubeId: yId,
      name: t.title || t.name || '未知曲目',
      artist: artistArr,
      album: t.album || (source === 'youtube' ? 'YouTube 歌单' : (p.name || '导入歌单')),
      pic: t.pic || (yId ? `https://i.ytimg.com/vi/${yId}/hqdefault.jpg` : ''),
      lyric_id: t.lyric_id || '',
      source: source,
      duration: t.duration || 0,
      _needMatch: (source !== 'youtube'),
      _matchQuery: (t.title + ' ' + artistArr.join(' ')).trim(),
    };
  });

  const platformTitleMap = {
    youtube: 'YouTube 音乐',
    joox: 'JOOX 海外',
    bilibili: 'B站音乐',
    spotify: 'Spotify',
    apple: 'Apple Music',
    netease: '网易云'
  };
  const platTitle = platformTitleMap[p.platform] || '导入歌单';

  renderTrackList(tracks, p.name, `${platTitle} · ${tracks.length} 首`);
  if (tracks.length) {
    if (isYouTube) {
      toast(`已对应 YouTube 原生音源（${tracks.length}首）🎵`);
    } else {
      toast(`已对应 ${platTitle} 平台曲库（${tracks.length}首）`);
    }
  }
}

/* ---------- 导入歌单弹窗 ---------- */
function openImportModal() {
  $('import-modal').hidden = false;
  $('import-msg').textContent = '';
  $('import-url').value = '';
  setTimeout(() => $('import-url').focus(), 50);
}
function closeImportModal() {
  $('import-modal').hidden = true;
}
async function doImport() {
  const url = $('import-url').value.trim();
  if (!url) { $('import-msg').textContent = '请先粘贴歌单链接'; return; }
  $('import-msg').textContent = '解析中…';
  $('import-btn').disabled = true;
  try {
    const nm = url.match(/music\.163\.com.*[?&]id=(\d+)/);
    if (nm) {
      const d = await api({ types: 'playlist', id: nm[1] });
      const pl = d.playlist || {};
      if (!pl.tracks || !pl.tracks.length) throw new Error('歌单是空的');
      customPlaylists.push({
        name: pl.name || '网易云歌单',
        platform: 'netease',
        playlistId: nm[1],
        tracks: [],
        trackCount: pl.tracks.length,
        addedAt: Date.now(),
      });
    } else {
      const proxy = proxyBase();
      const pr = await fetchJson(proxy + '/parse-playlist?url=' + encodeURIComponent(url));
      if (pr.error) throw new Error(pr.error);
      if (!pr.tracks || !pr.tracks.length) throw new Error('没解析到曲目');

      let platform = pr.platform || 'other';
      if (/youtube\.com|youtu\.be/i.test(url)) platform = 'youtube';
      else if (/spotify\.com/i.test(url)) platform = 'spotify';
      else if (/music\.apple\.com/i.test(url)) platform = 'apple';
      else if (/bilibili\.com/i.test(url)) platform = 'bilibili';
      else if (/joox\.com/i.test(url)) platform = 'joox';

      customPlaylists.push({
        name: pr.name || (platform === 'youtube' ? 'YouTube 歌单' : '导入的歌单'),
        platform: platform,
        playlistId: '',
        tracks: (pr.tracks || []).map(t => ({
          ...t,
          source: t.source || platform
        })),
        addedAt: Date.now(),
      });
    }
    savePlaylists();
    renderCharts();
    closeImportModal();
    toast('导入成功！已加入歌单列表');
  } catch (e) {
    $('import-msg').textContent = '导入失败：' + (e.message || e);
  }
  $('import-btn').disabled = false;
}

async function openChart(c) {
  $('load-more-wrap').hidden = true;
  showListLoading(true);
  $('view-home').hidden = true;
  $('view-list').hidden = false;
  $('list-title').textContent = c.name;
  $('list-subtitle').textContent = '官方精选榜单';
  $('track-list').innerHTML = '';
  $('list-empty').hidden = true;
  try {
    const d = await api({ types: 'playlist', id: c.id });
    const tracks = (d.playlist.tracks || []).map((t) => {
      let artists = [];
      if (Array.isArray(t.artist)) artists = t.artist;
      else if (t.ar && Array.isArray(t.ar)) artists = t.ar.map((a) => a.name);
      else if (typeof t.artist === 'string') artists = [t.artist];
      else if (t.author) artists = Array.isArray(t.author) ? t.author : [t.author];

      return {
        id: String(t.id),
        name: t.name || t.title || '未知曲目',
        artist: artists.length ? artists : ['未知歌手'],
        album: (t.al && t.al.name) || t.album || '',
        pic: (t.al && t.al.picUrl) || t.pic || '',
        lyric_id: String(t.lyric_id || t.id),
        source: t.source || 'netease',
        duration: t.duration || (t.dt ? Math.round(t.dt / 1000) : 0),
        _directUrl: t._directUrl || ''
      };
    });
    showListLoading(false);
    renderTrackList(tracks, c.name, `官方榜单 · ${tracks.length}首`);
  } catch (e) {
    showListLoading(false);
    $('list-empty').hidden = false;
    toast('榜单加载失败，稍后再试');
  }
}

function showListLoading(on) {
  $('list-loading').hidden = !on;
}

/* ---------- 搜索与热搜/搜索历史/分页 ---------- */
let searchHistory = [];
try { searchHistory = JSON.parse(localStorage.getItem('mp_search_history') || '[]'); } catch (e) {}

let searchKeyword = '';
let searchSource = 'all';
let searchPage = 1;
let currentSearchTracks = [];

function saveSearchHistory(kw) {
  if (!kw) return;
  searchHistory = [kw, ...searchHistory.filter(x => x !== kw)].slice(0, 10);
  try { localStorage.setItem('mp_search_history', JSON.stringify(searchHistory)); } catch (e) {}
  renderSearchTags();
}

function renderSearchTags() {
  const hisWrap = $('search-history-section');
  const hisBox = $('search-history-tags');
  hisBox.innerHTML = '';
  if (searchHistory.length) {
    hisWrap.hidden = false;
    searchHistory.forEach(h => {
      const pill = document.createElement('span');
      pill.className = 'tag-pill';
      pill.innerHTML = `<span>${escapeHtml(h)}</span><button class="tag-del" title="删除">&times;</button>`;
      pill.onclick = (e) => {
        if (e.target.closest('.tag-del')) return;
        $('search-input').value = h;
        $('search-clear-btn').hidden = false;
        $('search-tags-box').hidden = true;
        doSearch();
      };
      pill.querySelector('.tag-del').onclick = (e) => {
        e.stopPropagation();
        searchHistory = searchHistory.filter(x => x !== h);
        try { localStorage.setItem('mp_search_history', JSON.stringify(searchHistory)); } catch (e) {}
        renderSearchTags();
      };
      hisBox.appendChild(pill);
    });
  } else {
    hisWrap.hidden = true;
  }

  const hotBox = $('hot-search-tags');
  hotBox.innerHTML = '';
  HOT_KEYWORDS.forEach(k => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.textContent = k;
    pill.onclick = () => {
      $('search-input').value = k;
      $('search-clear-btn').hidden = false;
      $('search-tags-box').hidden = true;
      doSearch();
    };
    hotBox.appendChild(pill);
  });
}

/* 核心搜索实现：支持全网聚合、网易云、YouTube 跨域检索与单曲直链解析 */
async function doSearch(isLoadMore = false) {
  $('search-tags-box').hidden = true;
  if (!isLoadMore) {
    searchKeyword = $('search-input').value.trim();
    if (!searchKeyword) { toast('请先输入关键词或粘贴链接'); return; }
    searchSource = $('source-select').value;
    searchPage = 1;
    currentSearchTracks = [];
    saveSearchHistory(searchKeyword);
    showListLoading(true);
    $('view-home').hidden = true;
    $('view-list').hidden = false;
    $('list-title').textContent = `搜索：${searchKeyword}`;
    $('list-subtitle').textContent = `音乐源: ${$('source-select').options[$('source-select').selectedIndex].text}`;
    $('track-list').innerHTML = '';
    $('list-empty').hidden = true;
    $('load-more-wrap').hidden = true;
  } else {
    searchPage++;
    $('load-more-btn').disabled = true;
    $('load-more-btn').textContent = '加载中…';
  }

  // 1. 检测是否直接输入了 YouTube 链接
  const ytVid = matchYouTubeUrl(searchKeyword);
  if (ytVid && !isLoadMore) {
    try {
      const proxy = proxyBase();
      let info = null;
      if (proxy) {
        try { info = await fetchJson(proxy + '/yt-info?id=' + ytVid); } catch (e) {}
      }
      if (!info) {
        info = {
          id: `yt_${ytVid}`,
          ytId: ytVid,
          name: 'YouTube 单曲 (' + ytVid + ')',
          artist: ['YouTube'],
          album: 'YouTube',
          pic: `https://i.ytimg.com/vi/${ytVid}/hqdefault.jpg`,
          duration: 0,
          source: 'youtube',
          _needMatch: true,
          _matchQuery: ytVid
        };
      }
      showListLoading(false);
      currentSearchTracks = [info];
      renderTrackList(currentSearchTracks, `YouTube 解析结果`, `点击即可通过中转智能播放`);
      toast('已成功解析 YouTube 链接 🎵');
      return;
    } catch (e) {
      showListLoading(false);
      toast('YouTube 链接解析失败');
      return;
    }
  }

  let newTracks = [];

  try {
    // 2. YouTube 独立源搜索
    if (searchSource === 'youtube') {
      const proxy = proxyBase();
      try {
        const d = await fetchJson(proxy + '/yt-search?q=' + encodeURIComponent(searchKeyword));
        if (Array.isArray(d)) {
          newTracks = normalizeSearchList(d, 'youtube');
        } else {
          throw new Error('未返回数组');
        }
      } catch (err) {
        toast('中转未部署 /yt-search 路由，已自动为您全网音源匹配');
        const d = await api({ types: 'search', source: 'netease', name: searchKeyword, count: '20' });
        newTracks = normalizeSearchList(d, 'netease').map(s => ({
          ...s,
          album: s.album || '网易云'
        }));
      }
    }
    // 3. 🌐 全网聚合搜索（并发请求网易云 + 酷我 + JOOX + YouTube，去重整合）
    else if (searchSource === 'all') {
      const promises = [
        api({ types: 'search', source: 'netease', name: searchKeyword, count: '12', pages: String(searchPage) }),
        api({ types: 'search', source: 'kuwo', name: searchKeyword, count: '10', pages: String(searchPage) }),
        api({ types: 'search', source: 'joox', name: searchKeyword, count: '10', pages: String(searchPage) })
      ];
      const proxy = proxyBase();
      if (proxy) {
        promises.push(fetchJson(proxy + '/yt-search?q=' + encodeURIComponent(searchKeyword)).catch(() => []));
      }

      const results = await Promise.allSettled(promises);
      const combined = [];
      const seen = new Set();

      const mergeSourceResults = (resIdx, srcCode, srcLabel) => {
        if (results[resIdx] && results[resIdx].status === 'fulfilled' && Array.isArray(results[resIdx].value)) {
          normalizeSearchList(results[resIdx].value, srcCode).forEach(s => {
            const key = (s.name + '|' + s.artist.join(',')).toLowerCase();
            if (!seen.has(key)) {
              seen.add(key);
              combined.push({
                ...s,
                album: s.album ? (s.album.includes(srcLabel) ? s.album : `${s.album} · ${srcLabel}`) : srcLabel,
                source: srcCode
              });
            }
          });
        }
      };

      mergeSourceResults(0, 'netease', '网易云');
      mergeSourceResults(1, 'kuwo', '酷我');
      mergeSourceResults(2, 'joox', 'JOOX');

      // YouTube 结果
      if (results[3] && results[3].status === 'fulfilled' && Array.isArray(results[3].value)) {
        normalizeSearchList(results[3].value, 'youtube').forEach(s => {
          const key = (cleanSongTitle(s.name) + '|' + s.artist.join(',')).toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            combined.push(s);
          }
        });
      }

      newTracks = combined;
    }
    // 4. 其他单个音源 (网易云 netease / 酷我 kuwo / JOOX joox / B站 bilibili / 苹果 apple)
    else {
      const d = await api({ types: 'search', source: searchSource, name: searchKeyword, count: '20', pages: String(searchPage) });
      newTracks = normalizeSearchList(d, searchSource);
    }

    currentSearchTracks = [...currentSearchTracks, ...newTracks];
    showListLoading(false);

    if (currentSearchTracks.length === 0) {
      $('list-empty').hidden = false;
      $('load-more-wrap').hidden = true;
    } else {
      renderTrackList(currentSearchTracks, `搜索：${searchKeyword}`, `共找到 ${currentSearchTracks.length} 首歌曲`);
      $('load-more-wrap').hidden = (searchSource === 'youtube' || newTracks.length < 15);
    }
  } catch (e) {
    showListLoading(false);
    if (!isLoadMore) $('list-empty').hidden = false;
    toast('搜索失败，稍后再试');
  }
  $('load-more-btn').disabled = false;
  $('load-more-btn').textContent = '加载更多歌曲';
}

/* ---------- 视图切换 ---------- */
function showHome() {
  $('view-list').hidden = true;
  $('view-home').hidden = false;
  $('nav-home').classList.add('active');
  $('nav-fav').classList.remove('active');
  $('mnav-home').classList.add('active');
  $('mnav-fav').classList.remove('active');
  window.scrollTo({ top: 0 });
}
function showFav() {
  $('load-more-wrap').hidden = true;
  renderTrackList(favorites, `我的收藏`, `共 ${favorites.length} 首歌曲`);
  $('nav-fav').classList.add('active');
  $('nav-home').classList.remove('active');
  $('mnav-fav').classList.add('active');
  $('mnav-home').classList.remove('active');
}

/* ---------- Web Audio API 均衡器与频谱动画 ---------- */
let audioCtx = null;
let audioSourceNode = null;
let eqFilters = [];
let analyserNode = null;
let isEqEnabled = false;
let isVisualizerEnabled = true;

const EQ_FREQUENCIES = [60, 250, 1000, 4000, 12000];
const EQ_PRESETS = {
  flat: [0, 0, 0, 0, 0],
  bass: [7, 4, 1, 0, 0],
  vocal: [-2, 1, 5, 3, 0],
  pop: [3, 1, 2, 2, 1],
  rock: [5, 2, -1, 3, 5],
  electronic: [6, 3, 0, 2, 5],
  classical: [4, 2, 0, 2, 3],
  spatial: [3, -2, 1, 4, 4],
};

function tryInitAudioContext() {
  if (!isEqEnabled) return; // 均衡器关闭时保持原生 Audio 引擎，严禁劫持系统音频流以支持 iOS 后台播放
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return;
  }
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    audioCtx = new AudioCtx();
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 64;

    eqFilters = EQ_FREQUENCIES.map((freq, i) => {
      const f = audioCtx.createBiquadFilter();
      if (i === 0) f.type = 'lowshelf';
      else if (i === EQ_FREQUENCIES.length - 1) f.type = 'highshelf';
      else f.type = 'peaking';
      f.frequency.value = freq;
      f.gain.value = 0;
      return f;
    });

    audioSourceNode = audioCtx.createMediaElementSource(audio);

    // 串联: source -> f0 -> f1 -> f2 -> f3 -> f4 -> analyser -> destination
    let lastNode = audioSourceNode;
    eqFilters.forEach(f => {
      lastNode.connect(f);
      lastNode = f;
    });
    lastNode.connect(analyserNode);
    analyserNode.connect(audioCtx.destination);
  } catch (e) {
    console.warn('Web Audio Context 初始化失败（可能由于跨域限制），将继续直接播放', e);
  }
}

function applyEqGains(gains) {
  gains.forEach((g, i) => {
    if (eqFilters[i]) eqFilters[i].gain.value = isEqEnabled ? g : 0;
    const slider = document.querySelector(`.eq-slider[data-index="${i}"]`);
    if (slider) slider.value = g;
    const vEl = $(`eq-v-${i}`);
    if (vEl) vEl.textContent = (g > 0 ? '+' : '') + g + 'dB';
  });
}

function renderVisualizerLoop() {
  if (isVisualizerEnabled && !audio.paused) {
    let dataArray = null;
    let bufferLength = 28;
    if (analyserNode && audioCtx && audioCtx.state === 'running') {
      bufferLength = analyserNode.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);
      analyserNode.getByteFrequencyData(dataArray);
    } else {
      // 优雅动感模拟频谱 (无需劫持系统音频流，绝不影响 iOS 后台与跨域限制)
      dataArray = new Uint8Array(28);
      const t = performance.now() * 0.005;
      for (let i = 0; i < 28; i++) {
        const wave = Math.sin(t * 1.5 + i * 0.4) * 0.5 + 0.5;
        const wave2 = Math.cos(t * 0.8 + i * 0.7) * 0.5 + 0.5;
        dataArray[i] = Math.floor((wave * 0.6 + wave2 * 0.4) * 200 + 35);
      }
    }
    drawVisualizerCanvas($('np-visualizer'), dataArray, bufferLength);
    drawVisualizerCanvas($('lyrics-visualizer'), dataArray, bufferLength);
  }
  requestAnimationFrame(renderVisualizerLoop);
}
// 启动频谱动画循环 (支持无 Web Audio 模式下的轻量平滑动效)
requestAnimationFrame(renderVisualizerLoop);

function drawVisualizerCanvas(canvas, data, len) {
  if (!canvas || canvas.hidden) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.clientWidth || 300;
  const h = canvas.height = canvas.clientHeight || 100;
  ctx.clearRect(0, 0, w, h);

  const barCount = 28;
  const barWidth = (w / barCount) - 3;
  for (let i = 0; i < barCount; i++) {
    const val = data[i % len] || 0;
    const barHeight = (val / 255) * h * 0.9;
    const x = i * (barWidth + 3);
    const y = h - barHeight;

    const grad = ctx.createLinearGradient(0, y, 0, h);
    grad.addColorStop(0, '#1db954');
    grad.addColorStop(1, 'rgba(29, 185, 84, 0.1)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, barWidth, barHeight, [3, 3, 0, 0]) : ctx.rect(x, y, barWidth, barHeight);
    ctx.fill();
  }
}

/* ---------- 桌面画中画悬浮歌词 (Picture-in-Picture) ---------- */
let isPipActive = false;
const pipCanvas = $('pip-canvas');
const pipVideo = $('pip-video');

async function togglePipLyrics() {
  if (!document.pictureInPictureEnabled) {
    toast('当前浏览器不支持画中画歌词');
    return;
  }
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else {
      if (!pipVideo.srcObject) {
        drawPipFrame();
        const stream = pipCanvas.captureStream(30);
        pipVideo.srcObject = stream;
        await pipVideo.play();
      }
      await pipVideo.requestPictureInPicture();
    }
  } catch (e) {
    toast('开启画中画歌词失败：' + e.message);
  }
}

pipVideo.addEventListener('enterpictureinpicture', () => {
  isPipActive = true;
  $('pb-pip-btn').classList.add('active');
  $('lyrics-pip').classList.add('active');
  drawPipFrame();
  toast('已开启桌面悬浮画中画歌词 🪟');
});
pipVideo.addEventListener('leavepictureinpicture', () => {
  isPipActive = false;
  $('pb-pip-btn').classList.remove('active');
  $('lyrics-pip').classList.remove('active');
});

function drawPipFrame() {
  if (!pipCanvas) return;
  const ctx = pipCanvas.getContext('2d');
  const w = pipCanvas.width;
  const h = pipCanvas.height;

  // 背景渐变
  const bgGrad = ctx.createLinearGradient(0, 0, w, h);
  bgGrad.addColorStop(0, '#121216');
  bgGrad.addColorStop(1, '#0a0a0c');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // 歌曲信息
  const t = currentTrack();
  ctx.fillStyle = '#9ca3af';
  ctx.font = 'bold 15px -apple-system, sans-serif';
  ctx.textAlign = 'left';
  const trackInfo = t ? `🎵 ${t.name} - ${t.artist.join('/')}` : '🎵 音乐播放器';
  ctx.fillText(trackInfo.slice(0, 40), 24, 38);

  // 当前主歌词
  ctx.textAlign = 'center';
  const curLine = (lyricLines && lyricLines[currentLyricIndex]) ? lyricLines[currentLyricIndex] : null;
  const nextLine = (lyricLines && lyricLines[currentLyricIndex + 1]) ? lyricLines[currentLyricIndex + 1] : null;

  if (curLine) {
    ctx.fillStyle = '#1db954';
    ctx.font = 'bold 26px -apple-system, sans-serif';
    ctx.fillText(curLine.text.slice(0, 36), w / 2, 95);

    if (curLine.trans) {
      ctx.fillStyle = 'rgba(29, 185, 84, 0.85)';
      ctx.font = '16px -apple-system, sans-serif';
      ctx.fillText(curLine.trans.slice(0, 42), w / 2, 130);
    }

    if (nextLine) {
      ctx.fillStyle = '#6b7280';
      ctx.font = '15px -apple-system, sans-serif';
      ctx.fillText(nextLine.text.slice(0, 40), w / 2, 175);
    }
  } else {
    ctx.fillStyle = '#9ca3af';
    ctx.font = '20px -apple-system, sans-serif';
    ctx.fillText('♪ 随心聆听 享受音乐 ♪', w / 2, 115);
  }

  // 底部进度条
  const cur = audio.currentTime, dur = audio.duration || 1;
  const progressRatio = Math.min(1, Math.max(0, cur / dur));
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.fillRect(0, h - 8, w, 8);
  ctx.fillStyle = '#1db954';
  ctx.fillRect(0, h - 8, w * progressRatio, 8);
}

/* ---------- 睡眠定时器 ---------- */
let sleepTimerId = null;
let sleepEndTime = 0;
let sleepStopOnTrackEnd = false;

function startSleepTimer(minutes) {
  cancelSleepTimer(false);
  if (minutes === 'end-of-song') {
    sleepStopOnTrackEnd = true;
    updateSleepUI();
    toast('已设置：当前歌曲播完后自动停止 🌙');
    $('sleep-modal').hidden = true;
    return;
  }
  const mins = parseInt(minutes, 10);
  if (isNaN(mins) || mins <= 0) return;
  sleepStopOnTrackEnd = false;
  sleepEndTime = Date.now() + mins * 60 * 1000;
  updateSleepUI();
  toast(`已设置睡眠定时：${mins} 分钟后停止播放 🌙`);
  $('sleep-modal').hidden = true;

  sleepTimerId = setInterval(() => {
    const leftMs = sleepEndTime - Date.now();
    if (leftMs <= 0) {
      cancelSleepTimer(false);
      audio.pause();
      setPlayIcon(false);
      toast('睡眠定时已到，晚安 🌙', 4000);
      return;
    }
    // 最后 12 秒缓淡出音量
    if (leftMs <= 12000 && audio.volume > 0.05) {
      setAppVolume(Math.max(0, audio.volume - 0.08));
      $('vol-slider').value = Math.round(audio.volume * 100);
    }
    updateSleepUI();
  }, 1000);
}

function cancelSleepTimer(showToast = true) {
  if (sleepTimerId) clearInterval(sleepTimerId);
  sleepTimerId = null;
  sleepEndTime = 0;
  sleepStopOnTrackEnd = false;
  updateSleepUI();
  if (showToast) toast('睡眠定时已取消');
}

function updateSleepUI() {
  const isRunning = sleepTimerId !== null || sleepStopOnTrackEnd;
  $('sleep-bar-badge').hidden = !isRunning;
  $('sleep-side-badge').hidden = !isRunning;
  $('sleep-status-banner').hidden = !isRunning;

  if (sleepStopOnTrackEnd) {
    $('sleep-bar-time').textContent = '播完停';
    $('sleep-side-badge').textContent = '播完停';
    $('sleep-remaining-text').textContent = '本曲结束';
  } else if (sleepEndTime > 0) {
    const s = Math.max(0, Math.floor((sleepEndTime - Date.now()) / 1000));
    const str = `${Math.floor(s / 60)}分${String(s % 60).padStart(2, '0')}秒`;
    $('sleep-bar-time').textContent = fmtTime(s);
    $('sleep-side-badge').textContent = fmtTime(s);
    $('sleep-remaining-text').textContent = str;
  }
}

/* ---------- 数据备份与恢复 ---------- */
function exportDataBackup() {
  const data = {
    version: '2026.10',
    exportedAt: new Date().toISOString(),
    favorites,
    localPlaylists,
    customPlaylists,
    searchHistory,
    lyricDelayMs,
    volume: audio.volume,
  };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `music_player_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('已导出数据备份文件 💾');
}

function importDataBackup(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (Array.isArray(data.favorites)) favorites = data.favorites;
      if (Array.isArray(data.localPlaylists)) localPlaylists = data.localPlaylists;
      if (Array.isArray(data.customPlaylists)) customPlaylists = data.customPlaylists;
      if (Array.isArray(data.searchHistory)) searchHistory = data.searchHistory;
      if (data.lyricDelayMs) lyricDelayMs = data.lyricDelayMs;

      savePlaylists();
      localStorage.setItem('mp_fav', JSON.stringify(favorites));
      localStorage.setItem('mp_search_history', JSON.stringify(searchHistory));
      localStorage.setItem('mp_lyric_delay', String(lyricDelayMs));

      renderCharts();
      renderSearchTags();
      toast('数据导入成功！所有歌单与收藏已恢复 🎉');
    } catch (err) {
      toast('导入失败：无效的备份文件');
    }
  };
  reader.readAsText(file);
}

/* ---------- 音量与静音切换 ---------- */
function setAppVolume(val) {
  const v = Math.max(0, Math.min(1, val));
  audio.volume = v;
}

function toggleMute() {
  if (audio.volume > 0) {
    prevVol = audio.volume;
    setAppVolume(0);
  } else {
    setAppVolume(prevVol || 0.8);
  }
  $('vol-slider').value = Math.round(audio.volume * 100);
  localStorage.setItem('mp_vol', String(audio.volume));
  updateVolIcon();
}

function updateVolIcon() {
  const v = audio.volume;
  if (v === 0) setIcon($('vol-ic'), 'volMute');
  else if (v < 0.5) setIcon($('vol-ic'), 'volLow');
  else setIcon($('vol-ic'), 'volume');
}

/* ---------- 进度条悬停提示 ---------- */
$('progress-wrap').addEventListener('mousemove', (e) => {
  const r = $('progress-wrap').getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  const total = audio.duration || 0;
  const time = total * ratio;
  const tip = $('progress-tooltip');
  tip.textContent = fmtTime(time);
  tip.style.left = (ratio * 100) + '%';
  tip.hidden = false;
});
$('progress-wrap').addEventListener('mouseleave', () => {
  $('progress-tooltip').hidden = true;
});
$('progress-wrap').onclick = (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  const ratio = (e.clientX - r.left) / r.width;
  if (audio.duration) {
    audio.currentTime = ratio * audio.duration;
  }
};

/* ---------- 事件绑定 ---------- */
$('search-btn').onclick = () => doSearch(false);
$('search-input').addEventListener('input', (e) => {
  $('search-clear-btn').hidden = !e.target.value;
  $('search-tags-box').hidden = false;
});
$('search-input').addEventListener('focus', () => {
  $('search-tags-box').hidden = false;
});
$('search-input').addEventListener('click', (e) => {
  e.stopPropagation();
  $('search-tags-box').hidden = false;
});
$('search-clear-btn').onclick = () => {
  $('search-input').value = '';
  $('search-clear-btn').hidden = true;
  $('search-input').focus();
};
$('search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doSearch(false);
  else if (e.key === 'Escape') $('search-tags-box').hidden = true;
});
document.addEventListener('click', (e) => {
  const box = $('search-box');
  if (box && !box.contains(e.target)) {
    $('search-tags-box').hidden = true;
  }
});
$('clear-history-btn').onclick = () => {
  searchHistory = [];
  try { localStorage.removeItem('mp_search_history'); } catch (e) {}
  renderSearchTags();
  toast('已清空搜索历史');
};

$('nav-home').onclick = showHome;
$('logo-home').onclick = showHome;
$('nav-fav').onclick = showFav;
$('nav-lyrics').onclick = openLyricsPage;
$('back-home').onclick = showHome;

// 移动端底部便携导航
$('mnav-home').onclick = showHome;
$('mnav-fav').onclick = showFav;
$('mnav-search').onclick = () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => {
    $('search-input').focus();
    $('search-tags-box').hidden = false;
  }, 120);
};
$('mnav-queue').onclick = toggleQueue;
$('mnav-more').onclick = () => ($('settings-modal').hidden = false);

// 移动端轻点播放条信息展开全屏播放
$('pb-title').onclick = () => { if (window.innerWidth <= 860) openNowPlaying(); };
$('pb-artist').onclick = () => { if (window.innerWidth <= 860) openNowPlaying(); };

// 播放控制
$('play-btn').onclick = togglePlay;
$('next-btn').onclick = () => nextTrack(false);
$('prev-btn').onclick = prevTrack;
$('mode-btn').onclick = () => {
  playMode = (playMode + 1) % 3;
  setIcon($('mode-btn'), MODE_ICONS[playMode]);
  $('mode-btn').title = MODE_TIP[playMode];
  if ($('np-mode')) {
    setIcon($('np-mode'), MODE_ICONS[playMode]);
    $('np-mode').title = MODE_TIP[playMode];
  }
  toast(MODE_TIP[playMode]);
};
$('fav-btn').onclick = () => { const t = currentTrack(); if (t) toggleFav(t); };
$('vol-btn').onclick = toggleMute;
$('vol-slider').oninput = (e) => {
  setAppVolume(e.target.value / 100);
  localStorage.setItem('mp_vol', String(audio.volume));
  updateVolIcon();
};

// 列表头部操作
$('play-all-btn').onclick = () => {
  if (!currentRenderedTracks.length) { toast('列表中没有可播放的歌曲'); return; }
  setQueue(currentRenderedTracks, 0);
  playTrack(0);
  toast(`开始播放全部 ${currentRenderedTracks.length} 首歌曲`);
};
$('list-add-queue-btn').onclick = () => {
  if (!currentRenderedTracks.length) { toast('列表中没有歌曲'); return; }
  currentRenderedTracks.forEach(t => queue.push(t));
  updateQueueUI();
  toast(`已将全部 ${currentRenderedTracks.length} 首歌曲加入队列`);
};
$('load-more-btn').onclick = () => doSearch(true);

// 播放队列抽屉事件
$('pb-queue-btn').onclick = toggleQueue;
$('nav-queue').onclick = toggleQueue;
$('queue-close-btn').onclick = closeQueue;
$('queue-mask').onclick = closeQueue;
$('queue-clear-btn').onclick = clearQueue;

// 音效 & 均衡器弹窗事件
$('pb-eq-btn').onclick = openEqModal;
$('eq-btn').onclick = openEqModal;
$('eq-close').onclick = () => ($('eq-modal').hidden = true);
$('eq-modal').addEventListener('click', (e) => { if (e.target.id === 'eq-modal') $('eq-modal').hidden = true; });

function openEqModal() {
  $('eq-modal').hidden = false;
  $('eq-switch').checked = isEqEnabled;
  $('visualizer-switch').checked = isVisualizerEnabled;
}
$('eq-switch').onchange = (e) => {
  isEqEnabled = e.target.checked;
  if (isEqEnabled) {
    if (isIOS) {
      toast('提示：iOS开启均衡器可能导致锁屏断音，原音模式支持完美后台');
    }
    tryInitAudioContext();
  }
  const activePreset = document.querySelector('.preset-btn.active');
  const presetKey = activePreset ? activePreset.dataset.preset : 'flat';
  applyEqGains(EQ_PRESETS[presetKey] || EQ_PRESETS.flat);
  toast(isEqEnabled ? '专业均衡器已开启' : '均衡器已关闭 (原音输出 · 支持锁屏后台)');
};
$('visualizer-switch').onchange = (e) => {
  isVisualizerEnabled = e.target.checked;
};
$('eq-presets').addEventListener('click', (e) => {
  const btn = e.target.closest('.preset-btn');
  if (!btn) return;
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const preset = EQ_PRESETS[btn.dataset.preset] || EQ_PRESETS.flat;
  applyEqGains(preset);
  toast(`音效预设已切换: ${btn.textContent}`);
});
document.querySelectorAll('.eq-slider').forEach(slider => {
  slider.oninput = (e) => {
    const idx = parseInt(e.target.dataset.index, 10);
    const val = parseInt(e.target.value, 10);
    $(`eq-v-${idx}`).textContent = (val > 0 ? '+' : '') + val + 'dB';
    if (eqFilters[idx]) eqFilters[idx].gain.value = isEqEnabled ? val : 0;
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  };
});
$('speed-buttons').addEventListener('click', (e) => {
  const btn = e.target.closest('.speed-btn');
  if (!btn) return;
  document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const rate = parseFloat(btn.dataset.rate) || 1.0;
  audio.playbackRate = rate;
  toast(`播放倍速已设为 ${rate}x`);
});

// 睡眠定时器弹窗
$('sleep-btn').onclick = openSleepModal;
$('sleep-bar-badge').onclick = openSleepModal;
$('sleep-close').onclick = () => ($('sleep-modal').hidden = true);
$('sleep-modal').addEventListener('click', (e) => { if (e.target.id === 'sleep-modal') $('sleep-modal').hidden = true; });
$('sleep-cancel-btn').onclick = () => cancelSleepTimer(true);

function openSleepModal() {
  updateSleepUI();
  $('sleep-modal').hidden = false;
}
document.querySelectorAll('.sleep-opt-btn').forEach(btn => {
  btn.onclick = () => startSleepTimer(btn.dataset.mins);
});
$('sleep-custom-start').onclick = () => {
  const val = parseInt($('sleep-custom-input').value, 10);
  if (!val || val <= 0) { toast('请输入有效的分钟数'); return; }
  startSleepTimer(val);
};

// 歌单管理弹窗
$('create-playlist-btn').onclick = openCreatePlaylistModal;
$('home-create-pl-btn').onclick = openCreatePlaylistModal;
$('playlist-modal-close').onclick = () => ($('playlist-modal').hidden = true);
$('pl-create-cancel').onclick = () => ($('playlist-modal').hidden = true);
$('pl-select-close-btn').onclick = () => ($('playlist-modal').hidden = true);
$('pl-create-confirm').onclick = doCreatePlaylist;
$('pl-new-and-add-btn').onclick = () => {
  $('pl-create-view').hidden = false;
  $('pl-select-view').hidden = true;
  $('pl-name-input').value = '';
  setTimeout(() => $('pl-name-input').focus(), 50);
};

// 备份与恢复
$('export-data-btn').onclick = exportDataBackup;
$('import-data-trigger').onclick = () => $('import-data-file').click();
$('import-data-file').onchange = (e) => {
  const file = e.target.files[0];
  if (file) importDataBackup(file);
};

// 桌面画中画悬浮歌词
$('pb-pip-btn').onclick = togglePipLyrics;
$('lyrics-pip').onclick = togglePipLyrics;

// 歌词字体与复制工具
$('lyrics-copy').onclick = copyLyrics;
$('lyrics-font-inc').onclick = () => {
  lyricFontSize = Math.min(32, lyricFontSize + 2);
  document.documentElement.style.setProperty('--lyric-font-size', lyricFontSize + 'px');
  localStorage.setItem('mp_lyric_size', String(lyricFontSize));
};
$('lyrics-font-dec').onclick = () => {
  lyricFontSize = Math.max(12, lyricFontSize - 2);
  document.documentElement.style.setProperty('--lyric-font-size', lyricFontSize + 'px');
  localStorage.setItem('mp_lyric_size', String(lyricFontSize));
};

// 主题切换
$('theme-btn').onclick = () => {
  const light = localStorage.getItem('mp_theme') === 'light';
  localStorage.setItem('mp_theme', light ? 'dark' : 'light');
  applyTheme();
  toast(light ? '已切换深色模式' : '已切换浅色模式');
};

function setLyricsOpen(open) {
  $('lyrics-panel').hidden = !open;
  $('lyrics-btn').classList.toggle('active', open);
  if (open) {
    if (audio.paused) $('lyrics-panel').classList.add('paused');
    else $('lyrics-panel').classList.remove('paused');
    syncLyric();
    syncLyricsAmbient();
    setTimeout(centerCurrentLyric, 80);
  } else {
    $('lyrics-panel').classList.remove('fullscreen');
    document.body.classList.remove('lyrics-fs');
    setIcon($('lyrics-full-ic'), 'expand');
    if (location.hash === '#lyrics') {
      try { history.replaceState(null, '', location.pathname); } catch (e) {}
    }
  }
  updateScreenWakeState();
}
function toggleLyricsFull() {
  const p = $('lyrics-panel');
  p.classList.toggle('fullscreen');
  const fs = p.classList.contains('fullscreen');
  document.body.classList.toggle('lyrics-fs', fs);
  setIcon($('lyrics-full-ic'), fs ? 'compress' : 'expand');
  if (fs) {
    syncLyricsAmbient();
  }
  setTimeout(() => centerCurrentLyric(true), 80);
  updateScreenWakeState();
}
function syncLyricsAmbient() {
  const t = currentTrack();
  const el = $('lyrics-ambient');
  if (!el) return;
  const pic = t && t.pic ? imgSrc(t.pic) : '';
  el.style.backgroundImage = pic ? `url("${pic.replace(/"/g, '')}")` : '';
}
function openLyricsPage() {
  if (!currentTrack()) { toast('先播一首歌吧'); return; }
  setLyricsOpen(true);
  const p = $('lyrics-panel');
  if (!p.classList.contains('fullscreen')) toggleLyricsFull();
  try { history.replaceState(null, '', '#lyrics'); } catch (e) {}
  updateScreenWakeState();
  setTimeout(centerCurrentLyric, 100);
}
if (location.hash === '#lyrics') {
  setTimeout(() => { if (currentTrack()) openLyricsPage(); }, 800);
}
$('lyrics-btn').onclick = () => setLyricsOpen($('lyrics-panel').hidden);
$('lyrics-close').onclick = () => setLyricsOpen(false);
$('lyrics-full').onclick = toggleLyricsFull;
$('lyrics-prev').onclick = () => prevTrack();
$('lyrics-next').onclick = () => nextTrack(false);
$('lyrics-play').onclick = () => togglePlay();
$('pb-open').onclick = openNowPlaying;
$('pb-more-btn').onclick = (e) => {
  const t = currentTrack();
  if (t) openTrackMenu(t, $('pb-more-btn'));
  else toast('还没有播放歌曲');
};
$('np-close').onclick = closeNowPlaying;
$('np-prev').onclick = () => prevTrack();
$('np-next').onclick = () => nextTrack(false);
$('np-play').onclick = () => togglePlay();
$('np-mode').onclick = () => $('mode-btn').click();
$('np-lyrics-btn').onclick = () => { closeNowPlaying(); setLyricsOpen(true); };

$('import-btn').onclick = doImport;
$('import-close').onclick = closeImportModal;
$('import-modal').addEventListener('click', (e) => { if (e.target.id === 'import-modal') closeImportModal(); });
$('import-url').addEventListener('keydown', (e) => { if (e.key === 'Enter') doImport(); });

// 歌词滚动防打扰监听与窗口自适应
$('lyrics-body').addEventListener('wheel', onLyricsUserScroll, { passive: true });
$('lyrics-body').addEventListener('touchstart', onLyricsUserScroll, { passive: true });
window.addEventListener('resize', () => {
  if ($('lyrics-panel') && !$('lyrics-panel').hidden) centerCurrentLyric(true);
});

// 音频事件
audio.addEventListener('timeupdate', () => {
  const cur = audio.currentTime, total = audio.duration || 0;
  $('time-cur').textContent = fmtTime(cur);
  $('time-total').textContent = fmtTime(total);
  $('progress-fill').style.width = total ? (cur / total * 100) + '%' : '0%';
  if (currentTrack()) $('pb-artist').textContent = currentTrack().artist.join(' / ');
  syncLyric();
  updateMediaSessionPosition(false);
});
audio.addEventListener('ended', () => {
  updateMediaSessionPlaybackState(false);
  if (sleepStopOnTrackEnd) {
    cancelSleepTimer(false);
    audio.pause();
    setPlayIcon(false);
    toast('单曲结束，睡眠定时已停止播放 🌙');
    return;
  }
  nextTrack(true);
});
audio.addEventListener('play', () => {
  setPlayIcon(true);
  $('player-bar').classList.remove('paused');
  $('now-playing').classList.remove('paused');
  if ($('lyrics-panel')) $('lyrics-panel').classList.remove('paused');
  const a = $('ambient');
  if (a) a.classList.remove('paused');
  updateScreenWakeState();
  updateMediaSessionPlaybackState(true);
  updateMediaSessionPosition(true);
});
audio.addEventListener('pause', () => {
  setBuffering(false);
  $('player-bar').classList.add('paused');
  $('now-playing').classList.add('paused');
  if ($('lyrics-panel')) $('lyrics-panel').classList.add('paused');
  const a = $('ambient');
  if (a) a.classList.add('paused');
  updateScreenWakeState();
  updateMediaSessionPlaybackState(false);
  updateMediaSessionPosition(true);
});
audio.addEventListener('loadedmetadata', () => {
  updateMediaSessionPosition(true);
});
audio.addEventListener('waiting', () => setBuffering(true));
audio.addEventListener('playing', () => setBuffering(false));
audio.addEventListener('seeking', () => setBuffering(true));
audio.addEventListener('seeked', () => {
  if (audio.readyState >= 3) setBuffering(false);
  updateMediaSessionPosition(true);
});

let audioFallbackTried = false;
audio.addEventListener('error', () => {
  if (!audio.getAttribute('src')) return;
  const t = currentTrack();
  if (t && t._cdnUrl && !audioFallbackTried) {
    audioFallbackTried = true;
    audio.removeAttribute('crossorigin');
    const proxy = proxyBase();
    const canProxy = proxy && !/gdstudio\.(xyz|org)/i.test(t._cdnUrl);
    const proxiedUrl = canProxy ? proxy + '/audio?src=' + encodeURIComponent(t._cdnUrl) : t._cdnUrl;
    if (audio.src === t._cdnUrl && proxiedUrl !== t._cdnUrl) {
      toast('直连受阻，正在切换中转通道…');
      audio.src = proxiedUrl;
      audio.play().catch(() => {});
      return;
    } else if (audio.src !== t._cdnUrl) {
      toast('中转连接不畅，尝试直连…');
      audio.src = t._cdnUrl;
      audio.play().catch(() => {});
      return;
    }
  }
  setBuffering(false);
  toast(`《${t ? t.name : '当前歌曲'}》音频加载失败，已自动跳过`);
  nextTrack(false);
});

// 全局快捷键
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space') {
    e.preventDefault();
    togglePlay();
  } else if (e.key === 'ArrowRight') {
    nextTrack(false);
  } else if (e.key === 'ArrowLeft') {
    prevTrack();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setAppVolume(Math.min(1, audio.volume + 0.05));
    $('vol-slider').value = Math.round(audio.volume * 100);
    localStorage.setItem('mp_vol', String(audio.volume));
    updateVolIcon();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    setAppVolume(Math.max(0, audio.volume - 0.05));
    $('vol-slider').value = Math.round(audio.volume * 100);
    localStorage.setItem('mp_vol', String(audio.volume));
    updateVolIcon();
  } else if (e.key === 'm' || e.key === 'M') {
    toggleMute();
  } else if (e.key === 'l' || e.key === 'L') {
    setLyricsOpen($('lyrics-panel').hidden);
  } else if (e.key === 'q' || e.key === 'Q') {
    toggleQueue();
  } else if (e.key === 'Escape') {
    closeNowPlaying();
    closeQueue();
    closeTrackMenu();
    $('search-tags-box').hidden = true;
    $('settings-modal').hidden = true;
    $('import-modal').hidden = true;
    $('sleep-modal').hidden = true;
    $('eq-modal').hidden = true;
    $('playlist-modal').hidden = true;
  }
});

/* ---------- 设置弹窗 ---------- */
function openSettings() {
  const curApi = currentApiSource();
  const apiInput = $('api-source-input');
  const apiPreset = $('api-source-preset');
  if (apiPreset) {
    const found = Array.from(apiPreset.options).some(o => o.value === curApi);
    if (found) {
      apiPreset.value = curApi;
      if (apiInput) {
        apiInput.value = curApi;
        apiInput.style.display = 'none';
      }
    } else {
      apiPreset.value = 'custom';
      if (apiInput) {
        apiInput.value = curApi;
        apiInput.style.display = 'block';
      }
    }
  }
  if ($('api-source-status')) $('api-source-status').textContent = '';

  const prefQual = getPreferredQuality();
  if ($('pref-quality-select')) $('pref-quality-select').value = String(prefQual);

  const customProxy = (localStorage.getItem('mp_proxy') || '').trim();
  updateProxySettingsUI(customProxy);

  $('lyric-delay').value = String(lyricDelayMs);
  $('lyric-delay-val').textContent = lyricDelayMs + 'ms';
  $('settings-modal').hidden = false;
}

function updateProxySettingsUI(customProxy) {
  const lbl = $('proxy-current-label');
  const tag = $('proxy-tag');
  const inp = $('proxy-input');
  const wrap = $('proxy-custom-wrap');
  const status = $('proxy-status');
  if (status) status.textContent = '';
  if (customProxy) {
    if (lbl) lbl.textContent = `自建中转代理已生效 (${customProxy})`;
    if (tag) {
      tag.textContent = '自定义代理';
      tag.style.background = 'var(--gold-glow)';
      tag.style.color = 'var(--gold)';
    }
    if (inp) inp.value = customProxy;
    if (wrap) wrap.style.display = 'flex';
  } else {
    if (lbl) lbl.textContent = '默认极速中转通道已生效';
    if (tag) {
      tag.textContent = '默认通道';
      tag.style.background = 'var(--accent-dim)';
      tag.style.color = 'var(--accent)';
    }
    if (inp) inp.value = '';
    if (wrap) wrap.style.display = 'none';
  }
}

if ($('pref-quality-select')) {
  $('pref-quality-select').onchange = (e) => {
    switchQuality(parseInt(e.target.value, 10));
  };
}

// 实时音质切换胶囊与下拉气泡菜单绑定
if ($('quality-badge')) {
  $('quality-badge').onclick = (e) => {
    e.stopPropagation();
    const menu = $('quality-menu');
    if (menu) {
      menu.hidden = !menu.hidden;
      syncQualityMenuState();
    }
  };
}
document.querySelectorAll('.quality-opt').forEach(opt => {
  opt.onclick = (e) => {
    e.stopPropagation();
    const q = parseInt(opt.dataset.quality, 10) || 999;
    if ($('quality-menu')) $('quality-menu').hidden = true;
    switchQuality(q);
  };
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.quality-wrap')) {
    if ($('quality-menu')) $('quality-menu').hidden = true;
  }
});
audio.addEventListener('loadedmetadata', () => {
  const t = currentTrack();
  if (t && t._lastRes) {
    updateQualityBadge(t._lastRes, t);
  }
});

if ($('api-source-preset')) {
  $('api-source-preset').onchange = () => {
    const val = $('api-source-preset').value;
    const input = $('api-source-input');
    if (val === 'custom') {
      if (input) {
        input.style.display = 'block';
        input.focus();
      }
    } else {
      if (input) {
        input.style.display = 'none';
        input.value = val;
      }
      localStorage.setItem('mp_api_source', val);
      urlCache.clear();
      lyricCache.clear();
      if ($('api-source-status')) {
        $('api-source-status').style.color = 'var(--accent)';
        $('api-source-status').textContent = `✅ 已选择音源节点并生效：${val}`;
      }
      toast('音源节点已生效');
      renderCharts();
    }
  };
}

if ($('api-source-input')) {
  $('api-source-input').oninput = () => {
    const val = $('api-source-input').value.trim();
    const presetEl = $('api-source-preset');
    if (presetEl) {
      const found = Array.from(presetEl.options).some(o => o.value === val);
      presetEl.value = found ? val : 'custom';
    }
  };
}

if ($('api-source-test')) {
  $('api-source-test').onclick = async () => {
    const preset = $('api-source-preset') ? $('api-source-preset').value : 'custom';
    const val = (preset === 'custom' ? $('api-source-input').value : preset).trim().replace(/\/$/, '');
    if (!val) { toast('请先输入或选择 API 节点地址'); return; }
    $('api-source-status').style.color = 'var(--text-sub)';
    $('api-source-status').textContent = `正在测试节点：${val} …`;
    const start = performance.now();
    try {
      let d = null;
      if (isMetingUrl(val)) {
        const testUrl = `${val}?server=netease&type=search&id=${encodeURIComponent('晴天')}`;
        const r = await fetch(testUrl, { signal: AbortSignal.timeout(6000) });
        d = await r.json();
      } else {
        const encKw = gdUrlEncode('晴天');
        const s = signGd(encKw);
        const qs = `types=search&source=netease&name=${encKw}&count=1${s ? '&s=' + s : ''}`;
        if (/music\.gdstudio\.(xyz|org)/i.test(val)) {
          d = await fetchJsonp(val, qs, 6000);
        } else {
          try {
            const r = await fetch(`${val}${val.includes('?') ? '&' : '?'}${qs}`, { signal: AbortSignal.timeout(5000) });
            d = await r.json();
          } catch (err) {
            d = await fetchJsonp(val, qs, 6000);
          }
        }
      }
      const elapsed = Math.round(performance.now() - start);
      if (Array.isArray(d) || (d && d.length) || (d && d.playlist)) {
        $('api-source-status').style.color = 'var(--accent)';
        $('api-source-status').textContent = `✅ 连接正常！响应时间：${elapsed}ms · 返回有效歌曲数据`;
      } else {
        $('api-source-status').style.color = '#f59e0b';
        $('api-source-status').textContent = `⚠️ 节点可达 (${elapsed}ms) 但返回数据格式需适配`;
      }
    } catch (e) {
      $('api-source-status').style.color = '#ef4444';
      $('api-source-status').textContent = `❌ 测速失败：${e.message || '网络连接超时或跨域阻断'}`;
    }
  };
}

if ($('api-source-save')) {
  $('api-source-save').onclick = () => {
    const preset = $('api-source-preset') ? $('api-source-preset').value : 'custom';
    const val = (preset === 'custom' ? $('api-source-input').value : preset).trim().replace(/\/$/, '');
    if (!val) {
      localStorage.removeItem('mp_api_source');
      toast('已恢复默认 API 节点');
    } else {
      if (!/^https?:\/\//i.test(val)) {
        toast('API 地址需以 http:// 或 https:// 开头');
        return;
      }
      localStorage.setItem('mp_api_source', val);
      toast('API 音源已保存并生效');
    }
    urlCache.clear();
    lyricCache.clear();
    $('api-source-status').style.color = 'var(--accent)';
    $('api-source-status').textContent = '✅ 当前 API 源已生效，已清理历史缓存。';
    renderCharts();
  };
}

if ($('api-source-reset')) {
  $('api-source-reset').onclick = () => {
    localStorage.removeItem('mp_api_source');
    if ($('api-source-preset')) $('api-source-preset').value = DEFAULT_API_SOURCE;
    if ($('api-source-input')) {
      $('api-source-input').value = DEFAULT_API_SOURCE;
      $('api-source-input').style.display = 'none';
    }
    urlCache.clear();
    lyricCache.clear();
    $('api-source-status').style.color = 'var(--accent)';
    $('api-source-status').textContent = '已恢复默认 GDStudio (专属独立 API 首选 · 官方 Web 次选 · 多源智能容灾降级模式)。';
    toast('已恢复默认音源服务');
    renderCharts();
  };
}
$('lyric-delay').oninput = () => {
  lyricDelayMs = parseInt($('lyric-delay').value, 10) || 0;
  $('lyric-delay-val').textContent = lyricDelayMs + 'ms';
  try { localStorage.setItem('mp_lyric_delay', String(lyricDelayMs)); } catch (e) {}
};
$('settings-btn').onclick = openSettings;
$('proxy-close').onclick = () => ($('settings-modal').hidden = true);
$('settings-modal').addEventListener('click', (e) => {
  if (e.target.id === 'settings-modal') $('settings-modal').hidden = true;
});

if ($('proxy-custom-toggle')) {
  $('proxy-custom-toggle').onclick = () => {
    const wrap = $('proxy-custom-wrap');
    if (!wrap) return;
    const isHidden = wrap.style.display === 'none' || !wrap.style.display;
    wrap.style.display = isHidden ? 'flex' : 'none';
    if (isHidden && $('proxy-input')) $('proxy-input').focus();
  };
}

if ($('proxy-save')) {
  $('proxy-save').onclick = () => {
    const v = $('proxy-input').value.trim().replace(/\/$/, '');
    if (v && !/^https?:\/\//.test(v)) { toast('地址格式不对，需以 http 开头'); return; }
    if (v) {
      localStorage.setItem('mp_proxy', v);
      updateProxySettingsUI(v);
      toast('自定义中转代理已保存并生效');
    } else {
      localStorage.removeItem('mp_proxy');
      updateProxySettingsUI('');
      toast('已恢复默认官方极速中转');
    }
  };
}

if ($('proxy-clear')) {
  $('proxy-clear').onclick = () => {
    localStorage.removeItem('mp_proxy');
    updateProxySettingsUI('');
    toast('已恢复默认官方极速中转');
  };
}

if ($('proxy-test')) {
  $('proxy-test').onclick = async () => {
    const customVal = ($('proxy-input') && $('proxy-input').value || '').trim().replace(/\/$/, '');
    const activeProxy = customVal || proxyBase();
    $('proxy-status').style.color = 'var(--muted)';
    $('proxy-status').textContent = `正在测试连接：${activeProxy} …`;
    const start = performance.now();
    try {
      const r = await fetch(activeProxy + '/api?' + new URLSearchParams({ types: 'search', name: '晴天', count: '1' }).toString(), { signal: AbortSignal.timeout(6000) });
      const d = await r.json();
      const elapsed = Math.round(performance.now() - start);
      if (Array.isArray(d) || (d && (d.length || d.playlist))) {
        $('proxy-status').style.color = 'var(--accent)';
        $('proxy-status').textContent = `✅ 中转通道畅通！延迟：${elapsed}ms · 局域网/跨域已完美穿透`;
      } else {
        $('proxy-status').style.color = 'var(--gold)';
        $('proxy-status').textContent = `⚠️ 通道响应正常 (${elapsed}ms)，可正常代理流式音频`;
      }
    } catch (e) {
      $('proxy-status').style.color = '#ef4444';
      $('proxy-status').textContent = '❌ 连接失败：' + (e.message || '网络连接超时');
    }
  };
}

/* ---------- 彩蛋 ---------- */
let logoClicks = 0, logoTimer = null;
$('logo-home').addEventListener('click', () => {
  logoClicks++;
  clearTimeout(logoTimer);
  logoTimer = setTimeout(() => (logoClicks = 0), 2500);
  if (logoClicks >= 5) {
    logoClicks = 0;
    window.open('https://www.youtube.com/', '_blank', 'noopener');
  }
});

/* ---------- 屏幕常亮防休眠控制 (Screen Wake Lock) ---------- */
let wakeLockSentinel = null;
let wakeVideoActive = false;

function updateWakeBadge(active) {
  const badge = $('lyrics-wakelock-badge');
  if (badge) badge.style.display = active ? 'inline-flex' : 'none';
}

async function requestScreenWakeLock() {
  if (wakeLockSentinel && !wakeLockSentinel.released) {
    updateWakeBadge(true);
    return;
  }
  if ('wakeLock' in navigator && navigator.wakeLock && navigator.wakeLock.request) {
    try {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
        updateWakeBadge(false);
      });
      updateWakeBadge(true);
      return;
    } catch (e) {
      // 静默处理浏览器省电模式限制
    }
  }
  startWakeVideoFallback();
}

function releaseScreenWakeLock() {
  if (wakeLockSentinel) {
    try { wakeLockSentinel.release(); } catch (e) {}
    wakeLockSentinel = null;
  }
  stopWakeVideoFallback();
  updateWakeBadge(false);
}

function startWakeVideoFallback() {
  if (isIOS) return; // iOS 严禁运行伪装 video 唤醒，避免劫持 iOS 原生后台音频会话
  if (wakeVideoActive) return;
  const v = $('wake-video');
  if (!v) return;
  try {
    if (!v.srcObject && !v.src) {
      const c = document.createElement('canvas');
      c.width = 2; c.height = 2;
      const ctx = c.getContext('2d');
      if (ctx) ctx.fillRect(0, 0, 2, 2);
      if (c.captureStream) {
        v.srcObject = c.captureStream(1);
      } else {
        v.src = 'data:video/mp4;base64,AAAAHGZ0eXBpc29tAAAAAGlzb21tcDQxAAAACHZpZGVvAAAAAA==';
      }
    }
    const p = v.play();
    if (p && p.catch) p.catch(() => {});
    wakeVideoActive = true;
    updateWakeBadge(true);
  } catch (e) {}
}

function stopWakeVideoFallback() {
  wakeVideoActive = false;
  const v = $('wake-video');
  if (v) {
    try { v.pause(); } catch (e) {}
  }
}

function shouldKeepScreenAwake() {
  // 仅在用户停留于歌词沉浸页或大图播放页、且音频正在播放时才尝试保持屏幕常亮
  // 严禁在后台或锁屏时触发唤醒，确保 iOS / Android 系统锁屏能顺畅继续播放音频
  const lyricsOpen = $('lyrics-panel') && !$('lyrics-panel').hidden;
  const nowPlayingOpen = $('now-playing') && !$('now-playing').hidden;
  const isAudioPlaying = !audio.paused && !audio.ended && audio.currentTime > 0;
  return (lyricsOpen || nowPlayingOpen) && isAudioPlaying;
}

function updateScreenWakeState() {
  if (document.visibilityState === 'visible' && shouldKeepScreenAwake()) {
    requestScreenWakeLock();
  } else {
    releaseScreenWakeLock();
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    updateScreenWakeState();
  } else {
    releaseScreenWakeLock();
  }
});
window.addEventListener('focus', () => {
  updateScreenWakeState();
});

/* ---------- 初始化 ---------- */
setIcon($('logo-icon'), 'music');
setIcon($('nav-home-ic'), 'home');
setIcon($('nav-fav-ic'), 'heart');
setIcon($('nav-queue-ic'), 'list');
setIcon($('nav-lyrics-ic'), 'lyrics');
setIcon($('eq-ic'), 'sliders');
setIcon($('sleep-ic'), 'clock');
setIcon($('settings-ic'), 'gear');
setIcon($('back-ic'), 'chevL');
setIcon($('play-all-ic'), 'play');
setIcon($('list-queue-ic'), 'plus');
setIcon($('load-more-ic'), 'chevL');
setIcon($('lyrics-close-ic'), 'x');
setIcon($('lyrics-full-ic'), 'expand');
setIcon($('lyrics-pip-ic'), 'pip');
setIcon($('lyrics-copy-ic'), 'copy');
setIcon($('lyrics-prev-ic'), 'prev');
setIcon($('lyrics-next-ic'), 'next');
setIcon($('lyrics-play-ic'), 'play');
setIcon($('pb-more-ic'), 'more');
setIcon($('pb-pip-ic'), 'pip');
setIcon($('pb-eq-ic'), 'sliders');
setIcon($('pb-queue-ic'), 'list');
setIcon($('queue-close-ic'), 'x');
setIcon($('menu-play-ic'), 'play');
setIcon($('menu-next-ic'), 'next');
setIcon($('menu-queue-ic'), 'list');
setIcon($('menu-playlist-ic'), 'plus');
setIcon($('menu-download-ic'), 'download');
setIcon($('menu-copy-ic'), 'copy');
setIcon($('np-close-ic'), 'x');
setIcon($('np-prev'), 'prev');
setIcon($('np-next'), 'next');
setIcon($('np-play'), 'play');
setIcon($('np-mode'), 'repeat');
setIcon($('np-lyrics-btn'), 'lyrics');
setIcon($('mnav-home-ic'), 'home');
setIcon($('mnav-search-ic'), 'search');
setIcon($('mnav-fav-ic'), 'heart');
setIcon($('mnav-queue-ic'), 'list');
setIcon($('mnav-more-ic'), 'gear');
setPlayIcon(false);
setIcon($('prev-btn'), 'prev');
setIcon($('next-btn'), 'next');
setIcon($('mode-btn'), 'repeat');
setIcon($('lyrics-btn'), 'lyrics');
setIcon($('fav-btn'), 'heart');
applyTheme();
renderCharts();
renderSearchTags();
updateQueueUI();
updateScreenWakeState();
