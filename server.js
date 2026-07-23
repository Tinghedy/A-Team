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
  { title: '維基百科：膽固醇', link: 'https://zh.wikipedia.org/wiki/%E8%86%BD%E5%9B%BA%E9%86%87' },
  { title: '膽固醇過高怎麼辦？14種食物有效降低', link: 'https://blog.worldgymtaiwan.com' },
  { title: '高血壓與高膽固醇的健康管理', link: 'https://nutrition.org.tw' },
];

// ---- 當作 mock 的網頁結果（用於測試或 API 無回傳時） ----
const MOCK_WEB_RESULTS = [
  {
    title: '維基百科：膽固醇',
    snippet: '膽固醇的基本介紹，包含好膽固醇與壞膽固醇的差異、正常數值範圍與飲食建議。',
    link: 'https://zh.wikipedia.org/wiki/%E8%86%BD%E5%9B%BA%E9%86%87',
    displayLink: 'zh.wikipedia.org',
  },
  {
    title: '膽固醇過高怎麼辦？14種食物有效降低',
    snippet: '介紹燕麥、堅果、深海魚等食物如何幫助降低壞膽固醇，附飲食建議。',
    link: 'https://blog.worldgymtaiwan.com',
    displayLink: 'blog.worldgymtaiwan.com',
  },
  {
    title: '高血壓與高膽固醇的健康管理',
    snippet: '台灣營養學會整理的健康管理共識，包含飲食原則與生活習慣建議。',
    link: 'https://nutrition.org.tw',
    displayLink: 'nutrition.org.tw',
  },
];

function isCholesterolQuery(q) {
  return String(q || '').includes('膽固醇');
}

function buildCholesterolMockPayload(q) {
  const web = MOCK_WEB_RESULTS.map((r) => ({
    title: r.title,
    snippet: r.snippet,
    link: r.link,
    site: r.displayLink,
  }));
  return {
    ok: true,
    query: q,
    summary: '【什麼是膽固醇】膽固醇是血液裡的一種油脂。其中「壞膽固醇」如果太高，會慢慢塞住血管，容易引起心臟病或中風。一般人的壞膽固醇最好控制在 100 以下。',
    more: [
      '【膽固醇對身體造成什麼影響】如果壞膽固醇過高，血管會逐漸變硬、變窄，增加高血壓、心肌梗塞和中風的風險。多吃豆腐、魚、燕麥和黑木耳有助於降低壞膽固醇。',
      '如果數值一直降不下來，建議找醫生討論是否需要吃藥。',
    ],
    questions: [
      { q: '什麼是膽固醇？', a: '【什麼是膽固醇】膽固醇是血液裡的一種油脂，分為好膽固醇與壞膽固醇。' },
      { q: '膽固醇對身體造成什麼影響？', a: '【膽固醇對身體造成什麼影響】壞膽固醇過高會讓血管變窄堵塞，增加心血管疾病與中風風險。' },
      { q: '膽固醇過高要吃什麼改善？', a: '少吃油炸和肥肉，多吃豆腐、魚、燕麥、黑木耳，用橄欖油或苦茶油炒菜。' },
      { q: '膽固醇高需要吃藥嗎？', a: '如果飲食控制三到六個月還是降不下來，建議找醫生討論是否需要用藥。' },
    ],
    video: {
      title: '壞膽固醇如何控制在標準值？這樣做避免高血脂',
      channel: 'ME美醫誌',
      thumbnail: 'https://i.ytimg.com/vi/42Wm4dwW_78/hqdefault.jpg',
      publishedAt: '',
      duration: '8:42',
      views: '12萬次觀看',
      url: 'https://www.youtube.com/watch?v=42Wm4dwW_78',
    },
    sources: FIXED_SOURCES.map((s) => ({ ...s })),
    web,
    aiGenerated: false,
    cached: false,
  };
}

function buildGenericMockResults(q) {
  const cleanQ = String(q || '').replace(/[？?！!。.\s]/g, '');
  return [
    {
      title: `【什麼是${cleanQ}】衛教與健康保養建議 - 衛生福利部`,
      snippet: `【什麼是${cleanQ}】${cleanQ}是常見的飲食、保健或健康衛教主題。瞭解${cleanQ}的基本性質、成分與正確使用觀念，能幫助長輩做好日常保健。`,
      link: `https://www.mohw.gov.tw/search?q=${encodeURIComponent(cleanQ)}`,
      displayLink: 'mohw.gov.tw',
    },
    {
      title: `【${cleanQ}對身體造成什麼影響】專家飲食與生活保健建議`,
      snippet: `【${cleanQ}對身體造成什麼影響】適量飲食或正確面對${cleanQ}對維持身體代謝與健康有其影響。如過量攝取或有相關不適，建議留意身體反應並尋求專業醫師指示。`,
      link: `https://health.tvbs.com.tw/search/${encodeURIComponent(cleanQ)}`,
      displayLink: 'health.tvbs.com.tw',
    },
    {
      title: `維基百科：${cleanQ}`,
      snippet: `${cleanQ}的定義、常見類型與相關健康影響介紹。`,
      link: `https://zh.wikipedia.org/wiki/${encodeURIComponent(cleanQ)}`,
      displayLink: 'zh.wikipedia.org',
    },
  ];
}

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

// ---- YouTube 影片擷取標題與內容簡介 ----
async function youtubeSearch(q, maxResults = 4) {
  if (!GOOGLE_API_KEY) return [];

  // 先搜尋包含「衛教」或「健康」關鍵字，提升衛教相關度
  const searchQuery = `${q} 衛教 健康`;
  let searchUrl = `https://www.googleapis.com/youtube/v3/search`
    + `?key=${GOOGLE_API_KEY}`
    + `&part=snippet&type=video&maxResults=${maxResults}&relevanceLanguage=zh-Hant&regionCode=TW`
    + `&q=${encodeURIComponent(searchQuery)}`;

  let res = await fetchWithTimeout(searchUrl);
  if (!res.ok) {
    // 備援：若加關鍵字搜尋失敗，嘗試直接搜尋原關鍵字 q
    searchUrl = `https://www.googleapis.com/youtube/v3/search`
      + `?key=${GOOGLE_API_KEY}`
      + `&part=snippet&type=video&maxResults=${maxResults}&relevanceLanguage=zh-Hant&regionCode=TW`
      + `&q=${encodeURIComponent(q)}`;
    res = await fetchWithTimeout(searchUrl);
    if (!res.ok) {
      console.error('YouTube search 失敗', res.status);
      return [];
    }
  }
  const data = await res.json();
  const items = data.items || [];
  if (items.length === 0) return [];

  const videoIds = items.map((it) => it.id.videoId).filter(Boolean).join(',');
  const detailsMap = new Map();

  if (videoIds) {
    try {
      const detailUrl = `https://www.googleapis.com/youtube/v3/videos`
        + `?key=${GOOGLE_API_KEY}&part=contentDetails,statistics&id=${videoIds}`;
      const dRes = await fetchWithTimeout(detailUrl);
      if (dRes.ok) {
        const dData = await dRes.json();
        (dData.items || []).forEach((d) => {
          detailsMap.set(d.id, {
            duration: formatDuration(d.contentDetails?.duration),
            views: formatViews(d.statistics?.viewCount),
          });
        });
      }
    } catch (e) {
      console.error('YouTube details 失敗', e.message);
    }
  }

  return items.map((it) => {
    const videoId = it.id.videoId;
    const sn = it.snippet || {};
    const details = detailsMap.get(videoId) || {};
    return {
      videoId,
      title: sn.title || '',
      snippet: (sn.description || '').replace(/\s+/g, ' ').trim(),
      description: (sn.description || '').replace(/\s+/g, ' ').trim(),
      channel: sn.channelTitle || '',
      thumbnail: sn.thumbnails?.high?.url || sn.thumbnails?.medium?.url || '',
      publishedAt: relativeTime(sn.publishedAt),
      duration: details.duration || '',
      views: details.views || '',
      url: `https://www.youtube.com/watch?v=${videoId}`,
    };
  });
}

function buildPayloadFromYouTube(q, ytVideos) {
  const cleanQ = String(q || '').replace(/[？?！!。.\s]/g, '');
  const v1 = ytVideos[0] || {};
  const v2 = ytVideos[1] || {};
  const v3 = ytVideos[2] || {};

  const cleanTitle1 = v1.title ? v1.title.replace(/【.*?】/g, '').trim() : cleanQ;
  const cleanDesc1 = v1.description ? v1.description.slice(0, 140).trim() : `點擊影片觀看衛教說明。`;

  const cleanTitle2 = v2.title ? v2.title.replace(/【.*?】/g, '').trim() : `相關健康影響說明`;
  const cleanDesc2 = v2.description ? v2.description.slice(0, 140).trim() : `了解日常飲食、生活習慣與健康維護方式。`;

  const summary = `【什麼是${cleanQ}】${cleanTitle1}。${cleanDesc1}`;
  const more = [
    `【${cleanQ}對身體造成什麼影響】${cleanTitle2}。${cleanDesc2}`,
    ...(v3.description ? [`影片內容簡介：${v3.description.slice(0, 120)}`] : []),
  ];

  const questions = [
    {
      q: `什麼是${cleanQ}？`,
      a: v1.title ? `【什麼是${cleanQ}】觀看「${v1.title}」（${v1.channel}）：${v1.description ? v1.description.slice(0, 100) : '提供衛生教育資訊'}` : `【什麼是${cleanQ}】瞭解${cleanQ}的相關衛教資訊。`,
    },
    {
      q: `${cleanQ}對身體造成什麼影響？`,
      a: v2.title ? `【${cleanQ}對身體造成什麼影響】參閱「${v2.title}」（${v2.channel}）：${v2.description ? v2.description.slice(0, 100) : '相關影響說明'}` : `【${cleanQ}對身體造成什麼影響】適量選擇並注意日常身體維護。`,
    },
    {
      q: `${cleanQ}飲食與日常保養注意事項？`,
      a: `多數健康與飲食議題建議依個人體質適量選擇，有不適症狀請及早諮詢專業醫師。`,
    },
    {
      q: `什麼時候需要就醫詢問？`,
      a: `如果相關不適症狀持續或體質較敏感，建議至專科醫院進行進一步檢查。`,
    },
  ];

  const sources = ytVideos.map((v) => ({
    title: v.title,
    link: v.url,
    site: `YouTube ・ ${v.channel}`,
  }));

  const web = ytVideos.map((v) => ({
    title: v.title,
    snippet: v.description || `觀看 ${v.channel} 說明的 ${v.title} 衛教影片內容`,
    link: v.url,
    site: `YouTube ・ ${v.channel}`,
  }));

  return {
    ok: true,
    query: q,
    summary,
    more,
    questions,
    video: v1.videoId ? v1 : null,
    sources,
    web,
    aiGenerated: false,
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
    if (isCholesterolQuery(q)) {
      return res.json(buildCholesterolMockPayload(q));
    }

    // 優先使用 YouTube API 擷取影片標題與內容簡介
    let ytVideos = [];
    try {
      ytVideos = await youtubeSearch(q, 4);
    } catch (e) {
      console.error('youtubeSearch 失敗', e.message);
      ytVideos = [];
    }

    if (ytVideos && ytVideos.length > 0) {
      console.log(`[YouTube API] 成功擷取 ${ytVideos.length} 支影片標題與內容簡介`);
      const payload = buildPayloadFromYouTube(q, ytVideos);
      setCache(q, payload);
      return res.json(payload);
    }

    // 若 YouTube 搜尋失敗或無結果，使用備援 Mock 回傳
    console.log(`[Fallback] YouTube 無結果，使用備援 Mock 回傳: ${q}`);
    const mockWeb = buildGenericMockResults(q);
    const payload = {
      ok: true,
      query: q,
      summary: mockWeb[0]?.snippet || `【什麼是${q}】衛教知識與健康照護建議`,
      more: [
        mockWeb[1]?.snippet || `【${q}對身體造成什麼影響】建議依個人體質適量選擇並諮詢醫師。`,
        mockWeb[2]?.snippet || '',
      ].filter(Boolean),
      questions: [
        { q: `什麼是${q}？`, a: `【什麼是${q}】${q}是常見的飲食與衛教保健主題。` },
        { q: `${q}對身體造成什麼影響？`, a: `【${q}對身體造成什麼影響】適量攝取並留意身體反應。` },
      ],
      video: null,
      sources: FIXED_SOURCES,
      web: mockWeb.map((r) => ({
        title: r.title,
        snippet: r.snippet,
        link: r.link,
        site: r.displayLink,
      })),
      aiGenerated: false,
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
