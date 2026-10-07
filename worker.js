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

    return cors(new Response('music-proxy ok'));
  },
};
