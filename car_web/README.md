# 🚗 中古車買賣管理系統

一個純網頁的中古車買賣記錄與統計工具，可完全免費放上 GitHub Pages。預設資料存在**你自己的瀏覽器**（本機模式）；也可以選擇設定免費的 **Firebase**，達成**多裝置即時同步**——在任何手機、電腦登入後都看到同一份資料。

## ✨ 功能特色

- **記錄買賣資訊**：廠牌、車型、年份、顏色、車號、里程數
- **完整金額管理**：進價（收購價）、整備費用、其他費用、訂金、成交價
- **自動計算利潤**：利潤 = 成交價 − 進價 − 整備費用 − 其他費用（填寫時即時預覽）
- **狀態管理**：庫存中 / 已收訂 / 已售出
- **統計儀表板**：總車輛數、總成本、已售出營收、已實現總利潤、平均每台利潤
- **搜尋與篩選**：可搜尋廠牌／車型／顏色／車號／備註，並依狀態篩選、多種方式排序
- **匯出 CSV**：可直接用 Excel 開啟，方便對帳
- **備份 / 還原**：匯出 JSON 備份檔，換電腦或手機也能還原資料
- **手機、電腦皆可用**：響應式設計（RWD）
- **雲端同步（選用）**：設定 Firebase 後，手機、電腦登入同一帳號即可即時同步、共用同一份資料

## 🖥️ 本機使用

直接用瀏覽器打開 [index.html](index.html) 即可，無需安裝任何東西。

> 💡 資料存在該瀏覽器的 localStorage。換裝置、清除瀏覽器資料前，請先用「💾 備份」下載 JSON 檔保存。

## 🌐 免費部署到 GitHub Pages

1. 到 [GitHub](https://github.com) 註冊 / 登入帳號。
2. 點右上角 **＋ → New repository**，取一個名字（例如 `car-web`），設為 **Public**，建立。
3. 進入該儲存庫 → **Add file → Upload files**，把這個資料夾裡的所有檔案（index.html、css、js、README.md、.nojekyll）拖進去上傳，然後 **Commit changes**。
4. 進入儲存庫的 **Settings → Pages**。
5. 在 **Build and deployment** 的 **Source** 選 **Deploy from a branch**，Branch 選 **main**、資料夾選 **/(root)**，按 **Save**。
6. 等待約 1 分鐘，重新整理該頁面，上方就會出現你的網址：
   `https://你的帳號.github.io/car-web/`
7. 手機或電腦打開這個網址就能使用，還可以加到手機主畫面像 App 一樣用！

> ⚠️ 預設情況下，GitHub Pages 上的資料是存在「開啟網頁的那台裝置」瀏覽器裡，手機和電腦各自獨立。**想讓每台裝置都看到同一份資料，請參考下方「☁️ 跨裝置雲端同步」章節設定。**

## ☁️ 跨裝置雲端同步（讓每台手機／電腦都看到同一份資料）

預設是「本機模式」，資料只存在當下這台裝置。如果你希望**在任何手機、電腦登入後都看到同一份資料、並即時同步**，請照下面步驟設定免費的 Firebase（約 10 分鐘，只需做一次）。

### 步驟 1：建立 Firebase 專案
1. 前往 <https://console.firebase.google.com/>，用 Google 帳號登入。
2. 點「建立專案 / Add project」，輸入名稱（例如 `car-web`），一直按「繼續」。
3. Google Analytics 可以關掉，最後按「建立專案」。

### 步驟 2：新增網頁應用程式，取得設定
1. 專案建立後，在首頁點「**</>**」（網頁）圖示。
2. 輸入 App 暱稱（例如 `car-web`），按「註冊應用程式」。
3. 會看到一段 `const firebaseConfig = { apiKey: "...", ... }`，這就是你的設定。
4. 把裡面的值，對應填到本專案的 [js/firebase-config.js](js/firebase-config.js) 檔案中（apiKey、authDomain、projectId …）。

### 步驟 3：開啟 Firestore 資料庫
1. 左側選單 → 「建構 Build → Firestore Database」。
2. 按「建立資料庫 Create database」。
3. 位置選離你近的（例如 `asia-east1` 台灣、`asia-northeast1` 東京），按「下一步」。
4. 安全規則先選「以測試模式啟動」都可以（稍後會改成正式規則），按「啟用」。

### 步驟 4：開啟登入功能並建立你的帳號
1. 左側選單 → 「Build → Authentication」→「開始使用 Get started」。
2. 在「Sign-in method」分頁，點「電子郵件/密碼 Email/Password」，開啟第一個開關，儲存。
3. 切到「Users 使用者」分頁 → 「新增使用者 Add user」。
4. 輸入你要用的 Email 和密碼（自己記住，這就是以後登入用的帳密），按「新增使用者」。

> 💡 建議只建立你自己的帳號，別開放註冊，這樣只有你能看到資料。

### 步驟 5：設定安全規則（很重要！保護你的資料）
1. 回到「Firestore Database → 規則 Rules」分頁。
2. 把內容整個換成下面這段，然後按「發布 Publish」：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

這代表：**只有登入的人才能讀寫資料**，別人就算知道網址也看不到。

### 步驟 6：完成！
1. 確認 [js/firebase-config.js](js/firebase-config.js) 已填好設定（apiKey 不是空的）。
2. 重新整理網頁 → 會出現登入畫面 → 輸入步驟 4 建立的帳密登入。
3. 右上角會顯示「☁️ 雲端同步中」，代表成功！
4. 之後在任何手機、電腦打開你的網址，登入同一組帳密，就會看到同一份資料，而且即時同步。

> 📤 若你之前在「本機模式」已有輸入資料，可先按「💾 備份」下載，登入雲端後再用「📂 還原」匯入，資料就上雲端了。

## 📂 檔案結構

```
car_web/
├── index.html            主頁面
├── css/
│   └── styles.css        介面樣式
├── js/
│   ├── app.js            應用程式邏輯
│   └── firebase-config.js 雲端同步設定（選用）
├── .nojekyll         讓 GitHub Pages 正確載入檔案
└── README.md         本說明
```

## 💾 資料備份建議

- 建議每隔一段時間就按一次「💾 備份」，把 JSON 檔存到雲端硬碟或 Email 給自己。
- 換手機、清理瀏覽器前，一定要先備份。
- 還原時會「覆蓋」目前所有資料，操作前系統會再次跟你確認。

## 🔒 隱私

- **本機模式**：所有資料只留在你自己的裝置上，不會上傳。
- **雲端模式**：資料存在你自己的 Firebase 專案，並以帳號密碼保護，只有你登入才能存取。
