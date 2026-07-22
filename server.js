/**
 * 高齡者搜尋介面 — 後端 proxy
 * 用途：把 Google API key 藏在後端，前端只打自己家的 /api/search
 *
 * 啟動：node server.js
 * 前端：http://localhost:3000
 * 手機同網段：http://<你的內網IP>:3000
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- 憑證（全部放在 .env）----
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;   // Custom Search + YouTube 可共用
const SEARCH_ENGINE_ID = process.env.SEARCH_ENGINE_ID; // Programmable Search 的 cx
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;   // 選配，沒有就用 snippet 當摘要
const BRAVE_API_KEY = process.env.BRAVE_API_KEY;   // Brave Search API 金鑰（選配）

// ---- 固定要優先顯示的來源 ----
const FIXED_SOURCES = [
  { title: '財政部電子發票整合服務平台', link: 'https://www.einvoice.nat.gov.tw' },
  { title: 'CETUS 條碼申請說明', link: 'https://www.cetustek.com.tw/how-to-apply-barcode.html' },
  { title: 'Invoice Manager (Google Play)', link: 'https://play.google.com/store/apps/details?id=money.com.invoicemanager&hl=zh_TW' },
  { title: '發票載具（App Store）', link: 'https://apps.apple.com/tw/app/%E7%99%BC%E7%A5%A8%E8%BC%89%E5%85%B7-%E7%B5%B1%E4%B8%80%E7%99%BC%E7%A5%A8%E5%B0%8D%E7%8D%8E-%E9%9B%B2%E7%AB%AF%E5%8A%A0%E7%A2%BC%E7%8D%8E-%E5%A4%A2%E5%B9%BB%E7%99%BC%E7%A5%A8%E8%87%AA%E8%A8%82%E5%9C%96%E7%89%87/id1434785043' },
  { title: '中華電信載具查詢', link: 'https://invoice.cht.com.tw/' },
  { title: '統一發票載具 FAQ', link: 'https://www.cinvoice.tw/faq/article?id=289&title=%E3%80%8C%E8%BC%89%E5%85%B7%E6%AD%B8%E6%88%B6%E3%80%8D%E6%9C%89%E5%A4%9A%E9%87%8D%E8%A6%81%EF%BC%9F%E4%B8%89%E5%88%86%E9%90%98%E8%AA%8D%E8%AD%98%E5%A6%82%E4%BD%95%E6%AD%B8%E6%88%B6%EF%BC%81' },
  { title: 'QMonster 載具教學', link: 'https://qmonster.cc/invoicecarrier/' },
];

// ---- 當作 mock 的網頁結果（用於測試或 API 無回傳時） ----
const MOCK_WEB_RESULTS = FIXED_SOURCES.map((s, i) => ({
  title: s.title,
  snippet: `${s.title} 的官方說明與申請步驟，包含載具申請、使用與常見問題。`,
  link: s.link,
  displayLink: s.link.replace(/^https?:\/\//, ''),
}));

// ---- 靜態檔案 ----
app.use(express.static(path.join(__dirname, 'public')));

// ---- 簡易 in-memory cache（省 API 額度，工作坊重複測試也快）----
const cache = new Map();
const CACHE_TTL = 1000 * 60 * 60; // 1 小時

function getCache(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.time > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}
function setCache(key, data) {
  cache.set(key, { time: Date.now(), data });
}

// ---- 查詢紀錄：這是你的研究原始資料 ----
// Vercel 的專案目錄是唯讀，只有 /tmp 可寫（且每個 instance 各自獨立、會被回收）。
const ON_VERCEL = !!process.env.VERCEL;
const LOG_PATH = ON_VERCEL
  ? path.join('/tmp', 'queries.log')
  : path.join(__dirname, 'queries.log');
function logQuery(q, meta = {}) {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    query: q,
    ...meta,
  }) + '\n';
  // 在 Vercel 上檔案不會持久保存，改用 console 讓查詢字進入後台 Logs（可事後匯出）
  if (ON_VERCEL) console.log('[query]', line.trim());
  fs.appendFile(LOG_PATH, line, (err) => {
    if (err) console.error('log 寫入失敗', err.message);
  });
}

// ---- 帶 timeout 的 fetch ----
async function fetchWithTimeout(url, ms = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ---- 觀看數格式化：823456 -> 82萬 ----
function formatViews(n) {
  const num = parseInt(n, 10);
  if (isNaN(num)) return '';
  if (num >= 100000000) return Math.floor(num / 100000000) + '億次觀看';
  if (num >= 10000) return Math.floor(num / 10000) + '萬次觀看';
  if (num >= 1000) return (num / 1000).toFixed(1) + '千次觀看';
  return num + '次觀看';
}

// ---- 相對時間：2018-03-01 -> 7年前 ----
function relativeTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const day = 1000 * 60 * 60 * 24;
  const years = Math.floor(diff / (day * 365));
  if (years >= 1) return years + '年前';
  const months = Math.floor(diff / (day * 30));
  if (months >= 1) return months + '個月前';
  const days = Math.floor(diff / day);
  if (days >= 1) return days + '天前';
  return '今天';
}

// ---- ISO8601 時長 PT2M53S -> 2:53 ----
function formatDuration(iso) {
  if (!iso) return '';
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return '';
  const h = parseInt(m[1] || 0, 10);
  const min = parseInt(m[2] || 0, 10);
  const s = parseInt(m[3] || 0, 10);
  const pad = (v) => String(v).padStart(2, '0');
  return h > 0 ? `${h}:${pad(min)}:${pad(s)}` : `${min}:${pad(s)}`;
}

// ---- Google Custom Search ----
async function googleSearch(q) {
  if (!GOOGLE_API_KEY || !SEARCH_ENGINE_ID) return [];
  const url = `https://www.googleapis.com/customsearch/v1`
    + `?key=${GOOGLE_API_KEY}`
    + `&cx=${SEARCH_ENGINE_ID}`
    + `&q=${encodeURIComponent(q)}`
    + `&num=6&hl=zh-TW&lr=lang_zh-TW&gl=tw`;

  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    const body = await res.text();
    console.error('CustomSearch 失敗', res.status, body.slice(0, 300));
    throw new Error('SEARCH_FAILED');
  }
  const data = await res.json();
  return (data.items || []).map((it) => ({
    title: it.title,
    snippet: (it.snippet || '').replace(/\s+/g, ' ').trim(),
    link: it.link,
    displayLink: it.displayLink,
  }));
}

// ---- Brave Search ----
async function braveSearch(q) {
  if (!BRAVE_API_KEY) return [];
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&size=6`;
  const res = await fetchWithTimeout(url, 8000);
  if (!res.ok) {
    const body = await res.text();
    console.error('Brave Search 失敗', res.status, body.slice(0, 300));
    return [];
  }
  const data = await res.json();
  // Brave response shapes may vary; try common paths
  const items = data?.web?.results || data?.results || data?.organic || data?.items || [];
  return (items || []).slice(0, 6).map((it) => ({
    title: it.title || it.name || it.headline || '',
    snippet: it.snippet || it.snippetText || it.excerpt || it.summary || '',
    link: it.url || it.link || it.path || '',
    displayLink: (it.domain || it.displayUrl || (it.url||'')).replace(/^https?:\/\//, ''),
  }));
}

// ---- YouTube 影片（含時長與觀看數，需兩次呼叫）----
async function youtubeSearch(q) {
  if (!GOOGLE_API_KEY) return null;

  const searchUrl = `https://www.googleapis.com/youtube/v3/search`
    + `?key=${GOOGLE_API_KEY}`
    + `&part=snippet&type=video&maxResults=1&relevanceLanguage=zh-Hant&regionCode=TW`
    + `&q=${encodeURIComponent(q)}`;

  const res = await fetchWithTimeout(searchUrl);
  if (!res.ok) {
    console.error('YouTube search 失敗', res.status);
    return null;
  }
  const data = await res.json();
  const item = (data.items || [])[0];
  if (!item) return null;

  const videoId = item.id.videoId;
  const sn = item.snippet;

  // 第二次呼叫拿時長與觀看數
  let duration = '';
  let views = '';
  try {
    const detailUrl = `https://www.googleapis.com/youtube/v3/videos`
      + `?key=${GOOGLE_API_KEY}&part=contentDetails,statistics&id=${videoId}`;
    const dRes = await fetchWithTimeout(detailUrl);
    if (dRes.ok) {
      const dData = await dRes.json();
      const d = (dData.items || [])[0];
      if (d) {
        duration = formatDuration(d.contentDetails?.duration);
        views = formatViews(d.statistics?.viewCount);
      }
    }
  } catch (e) {
    console.error('YouTube details 失敗', e.message);
  }

  return {
    videoId,
    title: sn.title,
    channel: sn.channelTitle,
    thumbnail: sn.thumbnails?.high?.url || sn.thumbnails?.medium?.url || '',
    publishedAt: relativeTime(sn.publishedAt),
    duration,
    views,
    url: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

// ---- Gemini：把 snippet 改寫成長輩看得懂的口語摘要 + 產生延伸問題 ----
async function geminiSummarize(q, snippets) {
  if (!GEMINI_API_KEY) return null;

  const prompt = `你在幫 65-80 歲的台灣長輩解釋網路查到的資料。

他們問的問題是：「${q}」

以下是網路搜尋到的片段：
${snippets.slice(0, 4).map((s, i) => `${i + 1}. ${s}`).join('\n')}

請用繁體中文回覆一個 JSON 物件，不要有任何前後說明文字、不要 markdown 標記：
{
  "summary": "第一段解釋，2-3 句，口語、不用專有名詞，若一定要用就順帶解釋",
  "more": ["第二段補充說明", "第三段補充說明"],
  "questions": [
    {"q": "延伸問題一", "a": "兩到三句的口語回答"},
    {"q": "延伸問題二", "a": "兩到三句的口語回答"},
    {"q": "延伸問題三", "a": "兩到三句的口語回答"},
    {"q": "延伸問題四", "a": "兩到三句的口語回答"}
  ]
}

寫作要求：句子短、避免英文、避免「係指」「藉由」這類書面語、把長輩當成第一次聽到這個詞。`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 1200 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error('Gemini 失敗', res.status);
      return null;
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error('Gemini 錯誤', e.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---- 防濫用關卡 1：只接受從「自己這個網站」發出的請求 ----
// 正常使用者用瀏覽器開頁面 → fetch 會帶 Referer/Origin，主機名跟本站一致才放行。
// 這能擋掉別的網站盜連、以及沒帶來源的裸 curl；但擋不了刻意偽造 Referer 的攻擊者
// （那種只能靠下面的 Google 額度上限來保底）。
function sameOriginOnly(req) {
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
  const src = req.headers.origin || req.headers.referer || '';
  if (!host) return true;                       // 極少數拿不到 host 的情況，不誤殺
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(src)) return true; // 本機開發
  try { return new URL(src).host.toLowerCase() === host; } catch (e) { return false; }
}

// ---- 防濫用關卡 2：同一 IP 的速率限制（每分鐘上限）----
// 注意：Vercel serverless 每個 instance 各有自己的記憶體，這個限制是「盡力而為」，
// 不是全域精準的。要全域精準需接 Vercel KV / Upstash（可再加）。
const RL_MAX = 30;                 // 每分鐘每 IP 最多 30 次
const RL_WINDOW = 60 * 1000;
const rlHits = new Map();
function rateLimited(req) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const rec = rlHits.get(ip);
  if (!rec || now > rec.resetAt) { rlHits.set(ip, { count: 1, resetAt: now + RL_WINDOW }); return false; }
  rec.count += 1;
  return rec.count > RL_MAX;
}

// ---- 主要搜尋端點 ----
app.get('/api/search', async (req, res) => {
  if (!sameOriginOnly(req)) {
    return res.status(403).json({ ok: false, reason: 'FORBIDDEN' });
  }
  if (rateLimited(req)) {
    return res.status(429).json({ ok: false, reason: 'RATE_LIMIT' });
  }

  const q = (req.query.q || '').trim();

  if (!q) {
    return res.status(400).json({ ok: false, reason: 'EMPTY' });
  }
  if (q.length > 100) {
    return res.status(400).json({ ok: false, reason: 'TOO_LONG' });
  }

  logQuery(q, { ua: req.headers['user-agent'] });

  const cached = getCache(q);
  if (cached) {
    return res.json({ ...cached, cached: true });
  }

  try {
    // 優先使用 Google Custom Search；若沒有結果且有設定 Brave，則以 Brave 做後備
    let webResults = [];
    let video = null;

    const videoPromise = youtubeSearch(q).catch(() => null);

    try {
      webResults = await googleSearch(q);
    } catch (e) {
      console.error('googleSearch 失敗', e.message);
      webResults = [];
    }

    video = await videoPromise;

    if ((!webResults || webResults.length === 0) && BRAVE_API_KEY) {
      try {
        const braveRes = await braveSearch(q);
        if (braveRes && braveRes.length) webResults = braveRes;
      } catch (e) {
        console.error('braveSearch 失敗', e.message);
      }
    }

    // 如果沒有實際搜尋到 web results，就用 mock data（你要求硬寫成 mock）
    if ((!webResults || webResults.length === 0)) {
      webResults = MOCK_WEB_RESULTS;
    }

    if ((!webResults || webResults.length === 0) && !video) {
      return res.json({ ok: false, reason: 'NO_RESULT' });
    }

    // 試著用 Gemini 改寫；失敗就退回原始 snippet
    const ai = await geminiSummarize(q, webResults.map((r) => r.snippet));

    // 合併固定來源與搜尋結果（固定來源優先，避免重複連結）
    const dynamicSources = webResults.slice(0, 5).map((r) => ({
      title: r.title,
      link: r.link,
      site: r.displayLink,
    }));

    const seen = new Set();
    const combined = [];
    for (const s of FIXED_SOURCES) {
      if (!seen.has(s.link)) {
        combined.push(s);
        seen.add(s.link);
      }
    }
    for (const s of dynamicSources) {
      if (!seen.has(s.link)) {
        combined.push(s);
        seen.add(s.link);
      }
    }

    const payload = {
      ok: true,
      query: q,
      summary: ai?.summary || webResults[0]?.snippet || '',
      more: ai?.more || webResults.slice(1, 4).map((r) => r.snippet).filter(Boolean),
      questions: ai?.questions || webResults.slice(1, 5).map((r) => ({
        q: r.title,
        a: r.snippet,
      })),
      video,
      sources: combined,
      web: webResults.slice(0, 6).map((r) => ({
        title: r.title,
        snippet: r.snippet,
        link: r.link,
        site: r.displayLink || r.link,
      })),
      aiGenerated: !!ai,
    };

    setCache(q, payload);
    res.json(payload);
  } catch (err) {
    console.error('搜尋失敗', err.message);
    res.status(502).json({ ok: false, reason: 'UPSTREAM' });
  }
});

// ---- 健康檢查：工作坊當天確認服務還活著 ----
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    hasSearchKey: !!(GOOGLE_API_KEY && SEARCH_ENGINE_ID),
    hasGemini: !!GEMINI_API_KEY,
    cacheSize: cache.size,
  });
});

// ---- 查詢紀錄檢視：工作坊後直接看長輩打了什麼 ----
app.get('/admin/queries', (req, res) => {
  if (!fs.existsSync(LOG_PATH)) return res.type('text/plain').send('尚無紀錄');
  res.type('text/plain').send(fs.readFileSync(LOG_PATH, 'utf8'));
});

// 只有「直接用 node server.js 啟動」時才開長駐伺服器（本機開發用）。
// 在 Vercel 上這個檔案是被當成 serverless function 匯入的，不能 listen。
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  高齡者搜尋介面已啟動`);
    console.log(`  本機： http://localhost:${PORT}`);
    console.log(`  手機： http://<你的內網IP>:${PORT}   （用 ipconfig getifaddr en0 查）`);
    console.log(`  健康檢查： http://localhost:${PORT}/health`);
    console.log(`  查詢紀錄： http://localhost:${PORT}/admin/queries\n`);
    if (!GOOGLE_API_KEY || !SEARCH_ENGINE_ID) {
      console.warn('  ⚠ 尚未設定 GOOGLE_API_KEY / SEARCH_ENGINE_ID，請先填 .env\n');
    }
  });
}

// Vercel 的 @vercel/node 會把這個匯出的 Express app 當成請求處理器
module.exports = app;
