/* =========================================================
 * Firebase 雲端同步設定
 * ---------------------------------------------------------
 * 想讓「每一台手機／電腦都看到同一份資料」，請照 README 的
 * 教學建立免費的 Firebase 專案，把設定貼到下面。
 *
 * ⚠️ 還沒設定前，請保持 apiKey 為空字串 ""，
 *    網站會自動使用「本機模式」（資料只存這台裝置）。
 * ========================================================= */

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDrqqdoXBxLNL-t8Legq8djGKX8teaN4zE",              // ← 貼上你的 apiKey
  authDomain: "car-web-fa859.firebaseapp.com",         // ← 例：your-project.firebaseapp.com
  projectId: "car-web-fa859",          // ← 例：your-project
  storageBucket: "car-web-fa859.firebasestorage.app",      // ← 例：your-project.appspot.com
  messagingSenderId: "162897849127",  // ← 一串數字
  appId: "1:162897849127:web:8370f6cc75513f22b39702"               // ← 以 1: 開頭的字串
};
