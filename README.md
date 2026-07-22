# 高齡者搜尋介面 Prototype

參與式設計工作坊用的可運作搜尋器。前端維持長輩拼貼出的介面規格，後端串 Google Custom Search + YouTube Data API。

---

## 一、五分鐘啟動

```bash
npm install
cp .env.example .env    # 然後把金鑰填進 .env
npm start
```

打開 http://localhost:3000

---

## 二、申請 API 金鑰

### 1. Google API Key（Custom Search 與 YouTube 共用一把）

1. 到 Google Cloud Console 建立一個新專案
2. 「API 和服務」→「程式庫」，搜尋並啟用這兩個：
   - **Custom Search API**
   - **YouTube Data API v3**
3. 「憑證」→「建立憑證」→「API 金鑰」
4. 複製金鑰，填到 `.env` 的 `GOOGLE_API_KEY`

建議點「限制金鑰」，只勾選上面那兩個 API，避免誤用。

### 2. Search Engine ID (cx)

1. 到 Programmable Search Engine 建立搜尋引擎
2. 「搜尋整個網路」打開
3. 語言選繁體中文、地區選台灣
4. 複製「搜尋引擎 ID」，填到 `.env` 的 `SEARCH_ENGINE_ID`

### 3. Gemini API Key（選配，但強烈建議）

沒有 Gemini 的話，回答會直接用 Google 的 snippet，那些文字對長輩偏難懂（充滿專有名詞、常常斷在半句）。有 Gemini 的話會改寫成口語版本，這對你的工作坊觀察品質差很多。

到 Google AI Studio 申請免費金鑰，填到 `GEMINI_API_KEY`。

---

## 三、額度與工作坊風險

| API | 免費額度 | 工作坊估算 |
|---|---|---|
| Custom Search | 100 次/天 | 10 人 × 6 次 = 60 次，**接近上限** |
| YouTube Data | 10,000 units/天，search.list 一次 100 units | 60 次 × 200 units = 12,000，**會超過** |
| Gemini Flash | 免費層每分鐘 15 次 | 同時多人操作可能撞到 |

因應方式：

1. **快取已內建** — 同樣的查詢字一小時內不重打 API。長輩常會查一樣的東西，實際用量會低於估算
2. **YouTube 是最容易爆的** — 若不想冒險，把 `server.js` 裡 `youtubeSearch` 的第二次呼叫（拿時長觀看數）註解掉，可省一半 units
3. **事前預熱快取** — 工作坊前一天自己先查十個最可能的問題，當天就直接走快取
4. **一定要準備 fallback**（見下）

---

## 四、工作坊當天

### 讓長輩的手機連上

後端跑在你的筆電，長輩手機連同一個 Wi-Fi：

```bash
ipconfig getifaddr en0    # Mac，取得內網 IP，例如 192.168.1.23
```

請長輩開瀏覽器輸入 `http://192.168.1.23:3000`

> 網址對長輩來說很難輸入。建議你先產生 QR code 印出來貼在桌上，或事先幫每台測試機開好頁面加到主畫面。

### Fallback：網路掛掉照樣進行

```
http://192.168.1.23:3000/?demo=1
```

`?demo=1` 會跳過所有 API，用寫死的「載具是什麼」假資料。介面互動完全一樣，長輩不會察覺差別，你的觀察照樣能做。

**建議先用 demo 模式跑一輪 pilot**，確認流程沒問題再開真 API。

### 確認服務還活著

```
http://localhost:3000/health
```

### 收資料

每一筆查詢都會寫進 `queries.log`，包含時間、查詢字、裝置 UA。工作坊結束直接開：

```
http://localhost:3000/admin/queries
```

這是你研究的原始資料 — 長輩實際打了什麼字、打錯了什麼、重複查了幾次、放棄前的最後一次輸入是什麼。比事後回想準確太多，也比錄影更容易編碼。

**建議搭配紙本記錄每位參與者的操作起訖時間**，這樣能把 log 對回個別參與者。

---

## 五、針對長輩做的設計決策

改動都不是隨手加的，記一下理由方便你寫進論文方法章節：

| 決策 | 理由 |
|---|---|
| 輸入框 `font-size: 17px` | iOS 對 16px 以下的輸入框會自動放大整頁，長輩會以為畫面壞了 |
| `enterkeyhint="search"` | 鍵盤右下角顯示「搜尋」而非「換行」，減少不知道按哪裡的猶豫 |
| 關閉 `autocorrect` / `autocapitalize` | 長輩打字慢，自動修正會在他們還沒打完時就改字，造成困惑 |
| 載入用 spinner + 文字，不用骨架屏 | 骨架屏的灰色方塊會被解讀成「壞掉了」 |
| 逾時設 8 秒 | 超過 10 秒長輩會開始重複點擊或放棄 |
| 錯誤訊息全中文口語，無錯誤碼 | 英文或數字錯誤碼會引發焦慮，且無助於他們判斷下一步 |
| 每個錯誤畫面都有「回到首頁」大按鈕 | 不能讓長輩卡在死路 |
| TTS `rate = 0.85` | 預設語速對 65 歲以上偏快 |
| 點擊回饋 100ms 背景變化 | 沒有回饋時長輩會反覆狂點，造成重複送出 |
| 送出中按鈕禁用 | 同上，防止重複請求 |
| 搜尋框為空時不跳警告，只聚焦 | 警告視窗對長輩是負向回饋，容易讓他們不敢再試 |

---

## 六、還沒做的（三個選項按鈕）

「用說的問」「拍照詢問」「相片參考」目前是 alert，維持原規格。若之後要接：

- **用說的問** → Web Speech API 的 `SpeechRecognition`，`lang='zh-TW'`。注意 Safari 支援不完整，Android Chrome 較穩
- **拍照詢問** → `<input type="file" accept="image/*" capture="environment">` 拍照後傳給 Gemini Vision
- **相片參考** → 同上但不加 `capture`，改從相簿選

三個都會用到裝置權限，工作坊當天可能出現權限詢問視窗，長輩通常會直接按拒絕。若要做，建議先幫測試機預先授權好。

---

## 七、檔案結構

```
senior-search/
├─ server.js          後端 proxy、快取、log
├─ public/
│  └─ index.html      前端（單檔，含 CSS 與 JS）
├─ package.json
├─ .env               金鑰（不要進 git）
├─ .env.example
├─ .gitignore
└─ queries.log        自動產生的查詢紀錄
```
