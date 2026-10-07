/* 音乐播放器 - 数据接口: GD音乐台 music.gdstudio.xyz (CC BY-NC 4.0, 仅供学习) */
const API = 'https://music-api.gdstudio.xyz/api.php';
const BR_FALLBACK = [999, 740, 320, 128];

const CHARTS = [
  { id: '19723756',   name: '飙升榜', cover: 'https://p1.music.126.net/rIi7Qzy2i2Y_1QD7cd0MYA==/109951170048506929.jpg' },
  { id: '3779629',    name: '新歌榜', cover: 'https://p1.music.126.net/5guhqPBTcIrrhLBotgaT6w==/109951170048511751.jpg' },
  { id: '3778678',    name: '热歌榜', cover: 'https://p1.music.126.net/0SUEG8yDACfx0Bw2MYFv4Q==/109951170048519512.jpg' },
  { id: '71384707',   name: '古典榜', cover: 'https://p1.music.126.net/urByD_AmfBDBrs7fA9-O8A==/109951167976973225.jpg' },
  { id: '1978921795', name: '电音榜', cover: 'https://p1.music.126.net/hXGObvXfsGtFjFvRhOYAkA==/109951170091888741.jpg' },
  { id: '71385702',   name: 'ACG榜',  cover: 'https://p1.music.126.net/na1kEeCS1iZEkzOrs9r_9g==/109951167976973667.jpg' },
  { id: '2809513713', name: '欧美榜', cover: 'https://p1.music.126.net/70_EO_Dc7NT_hhfvsapzcQ==/109951167430862162.jpg' },
  { id: '5059644681', name: '日语榜', cover: 'https://p1.music.126.net/YFBFNI2F-4BveUpv6FKFuw==/109951167430864069.jpg' },
  { id: '745956260',  name: '韩语榜', cover: 'https://p1.music.126.net/5oN9YaFznwNGXkmi8i2Ytw==/109951167430864741.jpg' },
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
async function api(params) {
  const url = API + '?' + new URLSearchParams(params).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error('网络请求失败 ' + res.status);
  return res.json();
}
const urlCache = new Map();   // source:id -> {url, br}
const lyricCache = new Map(); // source:id -> {lines:[{t, text, trans}]}
const picCache = new Map();   // pic_id -> url

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

async function resolvePic(picId) {
  if (!picId) return '';
  if (picCache.has(picId)) return picCache.get(picId);
  try {
    const d = await api({ types: 'pic', id: picId, size: '500' });
    const u = (d && d.url) || '';
    picCache.set(picId, u);
    return u;
  } catch (e) { return ''; }
}

/* ---------- 歌词 ---------- */
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

/* ---------- 播放器状态 ---------- */
const audio = $('audio');
let queue = [];        // 当前播放列表
let qIndex = -1;       // 当前下标
let playMode = 0;      // 0 顺序 1 随机 2 单曲循环
let favorites = [];
try { favorites = JSON.parse(localStorage.getItem('mp_fav') || '[]'); } catch (e) {}
audio.volume = parseFloat(localStorage.getItem('mp_vol') || '0.8');
$('vol-slider').value = Math.round(audio.volume * 100);

const MODE_TXT = ['🔁', '🔀', '🔂'];
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
  $('play-btn').textContent = '⏸';

  // 解析最高可用音质地址
  const r = await resolveUrl(track.source, track.id);
  if (qIndex !== index) return; // 期间已切歌
  if (!r) {
    toast('这首歌暂无可播放地址，换个音乐源试试');
    $('play-btn').textContent = '▶';
    return;
  }
  audio.src = r.url;
  try { await audio.play(); } catch (e) { $('play-btn').textContent = '▶'; return; }
  $('quality-badge').hidden = false;
  $('quality-badge').textContent = qualityName(r.br);

  // 封面（搜索结果需要单独取）
  if (!track.pic && track.pic_id) track.pic = await resolvePic(track.pic_id);
  if (track.pic) {
    $('pb-cover').src = track.pic;
    $('lyrics-cover').src = track.pic;
    const bg = $('bg-blur');
    bg.style.backgroundImage = `url("${track.pic}")`;
    bg.style.opacity = 1;
  }
  // 歌词
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
  $('fav-btn').textContent = loved ? '❤️' : '🤍';
}

function togglePlay() {
  if (!currentTrack()) { toast('先搜一首歌或打开榜单吧'); return; }
  if (audio.paused) { audio.play(); $('play-btn').textContent = '⏸'; }
  else { audio.pause(); $('play-btn').textContent = '▶'; }
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
  tracks.forEach((t, i) => {
    const row = document.createElement('div');
    row.className = 'track-row';
    row.dataset.key = trackKey(t);
    const loved = favorites.some((f) => f.id === t.id && f.source === t.source);
    row.innerHTML = `
      <span class="track-idx">${i + 1}</span>
      <img class="track-thumb" loading="lazy" src="${t.pic || ''}" onerror="this.style.visibility='hidden'" alt="">
      <div class="track-main">
        <div class="track-name">${escapeHtml(t.name)}</div>
        <div class="track-sub">${escapeHtml(t.artist.join(' / '))}${t.album ? ' · ' + escapeHtml(t.album) : ''}</div>
      </div>
      ${t.duration ? `<span class="track-dur">${fmtTime(t.duration)}</span>` : ''}
      <button class="row-fav" title="收藏">${loved ? '❤️' : '🤍'}</button>`;
    row.onclick = (e) => {
      if (e.target.classList.contains('row-fav')) return;
      setQueue(tracks, i);
      playTrack(i);
    };
    row.querySelector('.row-fav').onclick = (e) => {
      e.stopPropagation();
      toggleFav(t);
      e.target.textContent = favorites.some((f) => f.id === t.id && f.source === t.source) ? '❤️' : '🤍';
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
  else { favorites.unshift({ ...t }); toast('已加入收藏 ❤️'); }
  localStorage.setItem('mp_fav', JSON.stringify(favorites.slice(0, 500)));
  updateFavBtn();
}

/* ---------- 首页榜单 ---------- */
function renderCharts() {
  const grid = $('chart-grid');
  grid.innerHTML = '';
  CHARTS.forEach((c) => {
    const card = document.createElement('div');
    card.className = 'chart-card';
    card.innerHTML = `<img loading="lazy" src="${c.cover}" alt="${c.name}" onerror="this.style.display='none'"><div class="chart-name">${c.name}</div>`;
    card.onclick = () => openChart(c);
    grid.appendChild(card);
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
  $('mode-btn').textContent = MODE_TXT[playMode];
  $('mode-btn').title = MODE_TIP[playMode];
  toast(MODE_TIP[playMode]);
};
$('fav-btn').onclick = () => { const t = currentTrack(); if (t) toggleFav(t); };
$('lyrics-btn').onclick = () => { $('lyrics-panel').hidden = false; syncLyric(); };
$('lyrics-close').onclick = () => { $('lyrics-panel').hidden = true; };

audio.addEventListener('timeupdate', () => {
  const cur = audio.currentTime, total = audio.duration || 0;
  $('time-cur').textContent = fmtTime(cur);
  $('time-total').textContent = fmtTime(total);
  $('progress-fill').style.width = total ? (cur / total * 100) + '%' : '0%';
  if (currentTrack()) $('pb-artist').textContent = currentTrack().artist.join(' / ');
  syncLyric();
});
audio.addEventListener('ended', () => nextTrack(true));
audio.addEventListener('play', () => ($('play-btn').textContent = '⏸'));
audio.addEventListener('pause', () => ($('play-btn').textContent = '▶'));

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

/* ---------- 初始化 ---------- */
renderCharts();
