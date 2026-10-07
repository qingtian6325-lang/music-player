/* 音乐播放器 - 数据接口: GD音乐台 music.gdstudio.xyz (CC BY-NC 4.0, 仅供学习) */
const API = 'https://music-api.gdstudio.xyz/api.php';
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
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), ms);
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
async function api(params) {
  const q = new URLSearchParams(params).toString();
  const proxy = proxyBase();
  if (proxy) {
    try { return await fetchJson(proxy + '/api?' + q); }
    catch (e) { /* 中转失败则降级直连 */ }
  }
  return fetchJson(API + '?' + q);
}
/* 音频地址：设置了中转则走 Worker 流式转发，否则直链 */
function audioSrc(cdnUrl) {
  const proxy = proxyBase();
  return proxy ? proxy + '/audio?src=' + encodeURIComponent(cdnUrl) : cdnUrl;
}
/* 封面地址：走 Worker /img 中转（公司网直连 music.126.net 会被墙）；失败时调用处回退显示 */
function imgSrc(u) {
  if (!u) return '';
  let url = String(u).replace(/"/g, '');
  if (url.includes('music.126.net') && !url.includes('param=')) {
    url += (url.includes('?') ? '&' : '?') + 'param=400y400';
  }
  const proxy = proxyBase();
  return proxy ? proxy + '/img?src=' + encodeURIComponent(url) : url;
}
const urlCache = new Map();   // source:id -> {url, br}
const lyricCache = new Map(); // source:id -> {lines:[{t, text, trans}]}

async function resolveUrl(source, id) {
  const key = source + ':' + id;
  if (urlCache.has(key)) return urlCache.get(key);
  for (const br of BR_FALLBACK) {
    try {
      const d = await api({ types: 'url', source, id, br: String(br) });
      if (d && d.url) {
        const r = { url: d.url, br: d.br || br };
        urlCache.set(key, r);
        return r;
      }
    } catch (e) { /* 换下一档 */ }
  }
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
  mic: SVG_OPEN + '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>' + SVG_END,
  home: SVG_OPEN + '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>' + SVG_END,
  gear: SVG_OPEN + '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>' + SVG_END,
  sun: SVG_OPEN + '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>' + SVG_END,
  moon: SVG_OPEN + '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>' + SVG_END,
  music: SVG_OPEN + '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>' + SVG_END,
  volume: SVG_OPEN + '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>' + SVG_END,
  chevL: SVG_OPEN + '<polyline points="15 18 9 12 15 6"/>' + SVG_END,
  x: SVG_OPEN + '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' + SVG_END,
};
function setIcon(el, name) { if (el) el.innerHTML = ICONS[name]; }
function setPlayIcon(playing) {
  setIcon($('play-btn'), playing ? 'pause' : 'play');
  $('play-btn').classList.toggle('pausing', playing);
  const npb = $('np-play');
  if (npb) {
    setIcon(npb, playing ? 'pause' : 'play');
    npb.classList.toggle('pausing', playing);
  }
}
/* 缓冲中：播放键变转圈 + 显示"缓冲中…" */
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
    const d = await api({ types: 'lyric', source: track.source, id: track.lyric_id || track.id });
    if (d && (d.lyric || d.tlyric)) lines = parseLrc(d.lyric || '', d.tlyric || '');
  } catch (e) { /* 无歌词 */ }
  lyricCache.set(key, lines);
  return lines;
}

function renderLyric(lines) {
  const body = $('lyrics-body');
  body.innerHTML = '';
  if (!lines.length) {
    body.innerHTML = '<div class="lyrics-empty">暂无歌词</div>';
    return;
  }
  lines.forEach((ln, i) => {
    const div = document.createElement('div');
    div.className = 'lyric-line';
    div.dataset.i = i;
    div.innerHTML = escapeHtml(ln.text) + (ln.trans ? `<span class="trans">${escapeHtml(ln.trans)}</span>` : '');
    div.onclick = () => { audio.currentTime = ln.t + 0.01; };
    body.appendChild(div);
  });
}
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

let lyricLines = [];
function syncLyric() {
  if (!lyricLines.length || $('lyrics-panel').hidden) return;
  const t = audio.currentTime;
  let idx = 0;
  for (let i = 0; i < lyricLines.length; i++) {
    if (lyricLines[i].t <= t + 0.15) idx = i; else break;
  }
  const body = $('lyrics-body');
  const prev = body.querySelector('.lyric-line.active');
  const cur = body.children[idx];
  if (prev !== cur) {
    if (prev) prev.classList.remove('active');
    if (cur) {
      cur.classList.add('active');
      cur.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }
}

/* ---------- 全屏环境光（仅电脑端） ---------- */
let ambientToken = 0;
async function setAmbient(picUrl) {
  const amb = $('ambient');
  if (!picUrl || window.innerWidth <= 860) { amb.classList.remove('on'); return; }
  const my = ++ambientToken;
  const url = imgSrc(picUrl);
  const pre = new Image();
  pre.src = url;
  await new Promise((res) => { pre.onload = res; pre.onerror = res; });
  if (my !== ambientToken) return;
  const cssUrl = `url("${url.replace(/"/g, '')}")`;
  const bg = $('ambient-img');
  bg.style.opacity = '0';
  setTimeout(() => {
    if (my !== ambientToken) return;
    bg.style.backgroundImage = cssUrl;
    $('ambient-glow').style.backgroundImage = cssUrl;
    bg.style.opacity = '';
    amb.classList.add('on');
    amb.classList.toggle('paused', audio.paused);
  }, 250);
}

/* ---------- 正在播放全屏 ---------- */
function syncNowPlaying(track) {
  const pic = track.pic ? imgSrc(track.pic) : '';
  const url = pic ? `url("${pic.replace(/"/g, '')}")` : '';
  $('np-bg').style.backgroundImage = url;
  $('np-cover').style.backgroundImage = url;
  $('np-glow').style.backgroundImage = url;
  $('np-cover-char').textContent = (track.name || '\u266a').charAt(0);
  $('np-title').textContent = track.name;
  $('np-artist').textContent = track.artist.join(' / ');
}
function openNowPlaying() {
  if (!currentTrack()) return;
  syncNowPlaying(currentTrack());
  $('now-playing').hidden = false;
  $('now-playing').classList.toggle('paused', audio.paused);
  document.body.style.overflow = 'hidden';
}
function closeNowPlaying() {
  $('now-playing').hidden = true;
  document.body.style.overflow = '';
}

/* ---------- 播放器状态 ---------- */
const audio = $('audio');
let queue = [];        // 当前播放列表
let qIndex = -1;       // 当前下标
let playMode = 0;      // 0 顺序 1 随机 2 单曲循环
let favorites = [];
try { favorites = JSON.parse(localStorage.getItem('mp_fav') || '[]'); } catch (e) {}
audio.volume = parseFloat(localStorage.getItem('mp_vol') || '0.8');
$('vol-slider').value = Math.round(audio.volume * 100);

const MODE_ICONS = ['repeat', 'shuffle', 'repeatOne'];
const MODE_TIP = ['播放模式：顺序', '播放模式：随机', '播放模式：单曲循环'];

function currentTrack() { return queue[qIndex] || null; }

function setQueue(list, index) {
  queue = list;
  qIndex = index;
}

async function playTrack(index) {
  const track = queue[index];
  if (!track) return;
  qIndex = index;
  markPlayingRow();
  updatePlayerMeta(track, true);
  setBuffering(true);
  setAmbient(track.pic);
  if (!$('now-playing').hidden) syncNowPlaying(track);

  // 解析最高可用音质地址
  const r = await resolveUrl(track.source, track.id);
  if (qIndex !== index) return; // 期间已切歌
  if (!r) {
    toast('这首歌暂无可播放地址，换个音乐源试试');
    setBuffering(false);
    return;
  }
  audio.src = audioSrc(r.url);
  track._cdnUrl = r.url;          // 直链备份：中转失败时降级用
  audioFallbackTried = false;
  try { await audio.play(); } catch (e) {
    setBuffering(false);
    toast('浏览器拦截了播放，再点一次播放试试');
    return;
  }
  $('quality-badge').hidden = false;
  $('quality-badge').textContent = qualityName(r.br);

  // 歌词（无图版不加载封面）
  lyricLines = await loadLyric(track);
  if (currentTrack() === track) renderLyric(lyricLines);
}

function qualityName(br) {
  br = +br;
  if (br >= 900) return '无损 24bit';
  if (br >= 700) return '无损 16bit';
  if (br >= 300) return '320K';
  if (br >= 180) return '192K';
  return '128K';
}

function updatePlayerMeta(track, loading) {
  const pic = track.pic ? imgSrc(track.pic) : '';
  $('pb-tile').innerHTML = `<span>${escapeHtml((track.name || '♪').charAt(0))}</span>` +
    (pic ? `<img src="${pic}" alt="" onerror="this.remove()">` : '');
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
  updateFavBtn();
  document.title = `${track.name} - ${track.artist.join('/')} | 音乐播放器`;
}

function updateFavBtn() {
  const t = currentTrack();
  const loved = t && favorites.some((f) => f.id === t.id && f.source === t.source);
  setIcon($('fav-btn'), loved ? 'heartFill' : 'heart');
}

function togglePlay() {
  if (!currentTrack()) { toast('先搜一首歌或打开榜单吧'); return; }
  if (audio.paused) { audio.play(); setPlayIcon(true); }
  else { audio.pause(); setPlayIcon(false); }
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

/* ---------- 列表渲染 ---------- */
function trackKey(t) { return t.source + ':' + t.id; }

function renderTrackList(tracks, title) {
  $('view-home').hidden = true;
  $('view-list').hidden = false;
  $('list-title').textContent = title;
  const box = $('track-list');
  box.innerHTML = '';
  $('list-empty').hidden = tracks.length > 0;
  if (tracks.length > 0) {
    const head = document.createElement('div');
    head.className = 'track-head';
    head.innerHTML = '<span>#</span><span>标题</span><span class="th-album">专辑</span><span class="th-dur">时长</span><span></span>';
    box.appendChild(head);
  }
  tracks.forEach((t, i) => {
    const row = document.createElement('div');
    row.className = 'track-row';
    row.dataset.key = trackKey(t);
    const loved = favorites.some((f) => f.id === t.id && f.source === t.source);
    row.innerHTML = `
      <span class="track-idx">${i + 1}</span>
      <div class="track-main">
        <div class="track-name">${escapeHtml(t.name)}</div>
        <div class="track-sub">${escapeHtml(t.artist.join(' / '))}</div>
      </div>
      <span class="track-album">${escapeHtml(t.album || '—')}</span>
      <span class="track-dur">${t.duration ? fmtTime(t.duration) : '—'}</span>
      <button class="row-fav${loved ? ' loved' : ''}" title="收藏">${loved ? ICONS.heartFill : ICONS.heart}</button>`;
    row.onclick = (e) => {
      if (e.target.closest('.row-fav')) return;
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
  if (i >= 0) { favorites.splice(i, 1); toast('已取消收藏'); }
  else { favorites.unshift({ ...t }); toast('已加入收藏'); }
  localStorage.setItem('mp_fav', JSON.stringify(favorites.slice(0, 500)));
  updateFavBtn();
}

/* ---------- 首页榜单（Spotify 风格卡片，无图） ---------- */
function renderCharts() {
  const grid = $('chart-grid');
  grid.innerHTML = '';
  CHARTS.forEach((c) => {
    const card = document.createElement('div');
    card.className = 'chart-card';
    card.innerHTML = `
      <div class="chart-tile"><span>${escapeHtml(c.name.charAt(0))}</span>${c.cover ? `<img loading="lazy" src="${imgSrc(c.cover)}" alt="" onerror="this.remove()">` : ''}</div>
      <div class="chart-name">${c.name}</div>
      <div class="chart-sub">榜单 · 点击查看曲目</div>`;
    card.onclick = () => openChart(c);
    grid.appendChild(card);
  });
  const side = $('side-charts');
  side.innerHTML = '';
  CHARTS.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'side-chart-link';
    b.innerHTML = `<span>${c.name}</span><span>›</span>`;
    b.onclick = () => openChart(c);
    side.appendChild(b);
  });
}

async function openChart(c) {
  showListLoading(true);
  $('view-home').hidden = true;
  $('view-list').hidden = false;
  $('list-title').textContent = c.name;
  $('track-list').innerHTML = '';
  $('list-empty').hidden = true;
  try {
    const d = await api({ types: 'playlist', id: c.id });
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
    renderTrackList(tracks, c.name + `（${tracks.length}首）`);
  } catch (e) {
    showListLoading(false);
    $('list-empty').hidden = false;
    toast('榜单加载失败，稍后再试');
  }
}

function showListLoading(on) {
  $('list-loading').hidden = !on;
}

/* ---------- 搜索 ---------- */
async function doSearch() {
  const kw = $('search-input').value.trim();
  if (!kw) { toast('先输入关键词'); return; }
  const source = $('source-select').value;
  showListLoading(true);
  $('view-home').hidden = true;
  $('view-list').hidden = false;
  $('list-title').textContent = `搜索：${kw}`;
  $('track-list').innerHTML = '';
  $('list-empty').hidden = true;
  try {
    const d = await api({ types: 'search', source, name: kw, count: '20' });
    const tracks = (Array.isArray(d) ? d : []).map((s) => ({
      id: String(s.id),
      name: s.name,
      artist: s.artist || [],
      album: s.album || '',
      pic: '',
      pic_id: s.pic_id || '',
      lyric_id: s.lyric_id ? String(s.lyric_id) : String(s.id),
      source: s.source || source,
      duration: 0,
    }));
    showListLoading(false);
    renderTrackList(tracks, `搜索：${kw}（${tracks.length}首）`);
  } catch (e) {
    showListLoading(false);
    $('list-empty').hidden = false;
    toast('搜索失败，稍后再试');
  }
}

/* ---------- 事件绑定 ---------- */
function showHome() {
  $('view-list').hidden = true;
  $('view-home').hidden = false;
  $('nav-home').classList.add('active');
  $('nav-fav').classList.remove('active');
  window.scrollTo({ top: 0 });
}
function showFav() {
  renderTrackList(favorites, `我的收藏（${favorites.length}首）`);
  $('nav-fav').classList.add('active');
  $('nav-home').classList.remove('active');
}

$('search-btn').onclick = doSearch;
$('search-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
$('nav-home').onclick = showHome;
$('logo-home').onclick = showHome;
$('nav-fav').onclick = showFav;
$('back-home').onclick = showHome;

$('play-btn').onclick = togglePlay;
$('next-btn').onclick = () => nextTrack(false);
$('prev-btn').onclick = prevTrack;
$('mode-btn').onclick = () => {
  playMode = (playMode + 1) % 3;
  setIcon($('mode-btn'), MODE_ICONS[playMode]);
  $('mode-btn').title = MODE_TIP[playMode];
  toast(MODE_TIP[playMode]);
};
$('fav-btn').onclick = () => { const t = currentTrack(); if (t) toggleFav(t); };
$('theme-btn').onclick = () => {
  const light = localStorage.getItem('mp_theme') === 'light';
  localStorage.setItem('mp_theme', light ? 'dark' : 'light');
  applyTheme();
  toast(light ? '已切换深色模式' : '已切换浅色模式');
};
function setLyricsOpen(open) {
  $('lyrics-panel').hidden = !open;
  $('lyrics-btn').classList.toggle('active', open);
  if (open) syncLyric();
}
$('lyrics-btn').onclick = () => setLyricsOpen($('lyrics-panel').hidden);
$('lyrics-close').onclick = () => setLyricsOpen(false);
$('pb-open').onclick = openNowPlaying;
$('np-close').onclick = closeNowPlaying;
$('np-prev').onclick = () => prevTrack();
$('np-next').onclick = () => nextTrack(false);
$('np-play').onclick = () => togglePlay();
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNowPlaying(); });

audio.addEventListener('timeupdate', () => {
  const cur = audio.currentTime, total = audio.duration || 0;
  $('time-cur').textContent = fmtTime(cur);
  $('time-total').textContent = fmtTime(total);
  $('progress-fill').style.width = total ? (cur / total * 100) + '%' : '0%';
  if (currentTrack()) $('pb-artist').textContent = currentTrack().artist.join(' / ');
  syncLyric();
});
audio.addEventListener('ended', () => nextTrack(true));
audio.addEventListener('play', () => { setPlayIcon(true); $('player-bar').classList.remove('paused'); $('now-playing').classList.remove('paused'); $('ambient').classList.remove('paused'); });
audio.addEventListener('pause', () => { setBuffering(false); $('player-bar').classList.add('paused'); $('now-playing').classList.add('paused'); $('ambient').classList.add('paused'); });
audio.addEventListener('waiting', () => setBuffering(true));
audio.addEventListener('playing', () => setBuffering(false));
audio.addEventListener('seeking', () => setBuffering(true));
audio.addEventListener('seeked', () => {
  // 跳到的位置有数据就直接关，没数据就等 waiting/playing 事件来关
  if (audio.readyState >= 3) setBuffering(false);
});
// 中转播不出时，自动降级用直链再试一次
let audioFallbackTried = false;
audio.addEventListener('error', () => {
  const t = currentTrack();
  const pb = proxyBase();
  if (t && t._cdnUrl && pb && audio.src.startsWith(pb) && !audioFallbackTried) {
    audioFallbackTried = true;
    toast('中转连接不畅，尝试直连…');
    audio.src = t._cdnUrl;
    audio.play().catch(() => {});
  }
});

$('progress-wrap').onclick = (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  const ratio = (e.clientX - r.left) / r.width;
  if (audio.duration) audio.currentTime = ratio * audio.duration;
};
$('vol-slider').oninput = (e) => {
  audio.volume = e.target.value / 100;
  localStorage.setItem('mp_vol', String(audio.volume));
};
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  else if (e.key === 'ArrowRight') nextTrack(false);
  else if (e.key === 'ArrowLeft') prevTrack();
});

/* ---------- 中转设置 ---------- */
function openSettings() {
  $('proxy-input').value = localStorage.getItem('mp_proxy') || '';
  $('proxy-status').textContent = '';
  $('settings-modal').hidden = false;
}
$('settings-btn').onclick = openSettings;
$('proxy-close').onclick = () => ($('settings-modal').hidden = true);
$('settings-modal').addEventListener('click', (e) => {
  if (e.target.id === 'settings-modal') $('settings-modal').hidden = true;
});
$('proxy-save').onclick = () => {
  const v = $('proxy-input').value.trim().replace(/\/$/, '');
  if (v && !/^https?:\/\//.test(v)) { toast('地址格式不对，要以 http 开头'); return; }
  if (v) localStorage.setItem('mp_proxy', v); else localStorage.removeItem('mp_proxy');
  $('proxy-status').textContent = v ? '已保存，之后搜歌和播放都走你填的中转。' : '已恢复默认公共中转。';
  toast('设置已保存');
};
$('proxy-clear').onclick = () => {
  localStorage.removeItem('mp_proxy');
  $('proxy-input').value = '';
  $('proxy-status').textContent = '已恢复默认公共中转。';
};
$('proxy-test').onclick = async () => {
  const v = $('proxy-input').value.trim().replace(/\/$/, '');
  if (!v) { toast('先填 Worker 地址'); return; }
  $('proxy-status').textContent = '测试中…';
  try {
    const r = await fetch(v + '/api?' + new URLSearchParams({ types: 'search', name: 'test', count: '1' }).toString());
    const d = await r.json();
    $('proxy-status').textContent = Array.isArray(d) ? '连接正常 ✅，点保存生效。' : '返回异常：' + JSON.stringify(d).slice(0, 80);
  } catch (e) {
    $('proxy-status').textContent = '连接失败：' + e.message;
  }
};

/* ---------- 彩蛋：2.5 秒内连点 logo 5 次，开 YouTube ---------- */
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

/* ---------- 初始化 ---------- */
setIcon($('logo-icon'), 'music');
setIcon($('nav-home-ic'), 'home');
setIcon($('nav-fav-ic'), 'heart');
setIcon($('settings-ic'), 'gear');
setIcon($('back-ic'), 'chevL');
setIcon($('lyrics-close-ic'), 'x');
setPlayIcon(false);
setIcon($('prev-btn'), 'prev');
setIcon($('next-btn'), 'next');
setIcon($('mode-btn'), 'repeat');
$('lyrics-btn').textContent = '词';
setIcon($('fav-btn'), 'heart');
setIcon($('vol-ic'), 'volume');
setIcon($('np-close-ic'), 'x');
setIcon($('np-prev'), 'prev');
setIcon($('np-next'), 'next');
setIcon($('np-play'), 'play');
applyTheme();
renderCharts();
