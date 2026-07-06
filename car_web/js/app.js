/* =========================================================
 * 中古車買賣管理系統 - 應用程式邏輯
 * 資料儲存在瀏覽器的 localStorage，無需伺服器或資料庫。
 * ========================================================= */

(function () {
  "use strict";

  const STORAGE_KEY = "carDealerRecords_v1";

  // ---------- Firebase 雲端同步（選用）----------
  // 若 firebase-config.js 有填入有效設定，則啟用雲端模式（跨裝置同步）；
  // 否則自動使用本機模式（資料只存這台裝置）。
  const cfg = window.FIREBASE_CONFIG || {};
  const cloudMode = !!(cfg.apiKey && cfg.projectId);
  let db = null, auth = null, docRef = null, unsub = null;
  let cloudReady = false;

  if (cloudMode) {
    try {
      firebase.initializeApp(cfg);
      db = firebase.firestore();
      auth = firebase.auth();
      docRef = db.collection("carDealer").doc("data");
    } catch (e) {
      console.error("Firebase 初始化失敗", e);
    }
  }

  /** @typedef {Object} Car
   * @property {string} id
   * @property {string} status        狀態：庫存中 / 已收訂 / 已售出
   * @property {string} brand         廠牌
   * @property {string} model         車型
   * @property {number|null} year     年份
   * @property {string} color         顏色
   * @property {string} plate         車號
   * @property {number|null} mileage  里程數
   * @property {number} purchasePrice 進價
   * @property {number} repairCost    整備費用
   * @property {number} otherCost     其他費用
   * @property {number} deposit       訂金
   * @property {number} salePrice     成交價
   * @property {string} purchaseDate  進貨日期
   * @property {string} saleDate      售出日期
   * @property {string} sellerName    賣方姓名（原車主/進貨來源）
   * @property {string} sellerPhone   賣方電話
   * @property {string} sellerAddress 賣方地址/身分證
   * @property {string} buyerName     買方姓名（成交客戶）
   * @property {string} buyerPhone    買方電話
   * @property {string} buyerAddress  買方地址/身分證
   * @property {string} notes         備註
   * @property {number} createdAt
   * @property {number} updatedAt
   */

  // ---------- 資料存取 ----------
  let cars = cloudMode ? [] : loadCars();

  function normalizeCars(list) {
    if (!Array.isArray(list)) return [];
    // 相容舊版：將舊的「買賣對象」欄位轉為買方姓名
    list.forEach((c) => {
      if (c && c.contact && !c.buyerName && !c.sellerName) {
        c.buyerName = c.contact;
      }
    });
    return list;
  }

  function loadCars() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const data = raw ? JSON.parse(raw) : [];
      return normalizeCars(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("讀取資料失敗", e);
      return [];
    }
  }

  function saveCars() {
    // 本機一律保存一份（快取／離線備援）
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cars));
    } catch (e) {
      console.error("儲存資料失敗", e);
    }
    // 雲端模式且已登入 → 同步到雲端
    if (cloudMode && cloudReady && docRef) {
      docRef.set({ cars: cars, updatedAt: Date.now() }).catch((e) => {
        console.error("雲端儲存失敗", e);
        showToast("雲端儲存失敗，請檢查網路", "error");
      });
    }
  }

  // ---------- 工具函式 ----------
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function num(v) {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  function calcProfit(car) {
    // 利潤 = 成交價 - 進價 - 整備費用 - 其他費用
    return num(car.salePrice) - num(car.purchasePrice) - num(car.repairCost) - num(car.otherCost);
  }

  function formatMoney(n) {
    const value = Math.round(num(n));
    const sign = value < 0 ? "-" : "";
    return sign + "$" + Math.abs(value).toLocaleString("en-US");
  }

  function formatNumber(n) {
    if (n === null || n === undefined || n === "") return "-";
    return num(n).toLocaleString("en-US");
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---------- DOM 參照 ----------
  const $ = (id) => document.getElementById(id);

  const tableBody = $("carTableBody");
  const emptyState = $("emptyState");
  const searchInput = $("searchInput");
  const filterStatus = $("filterStatus");
  const sortSelect = $("sortSelect");

  const modalOverlay = $("modalOverlay");
  const modalTitle = $("modalTitle");
  const carForm = $("carForm");

  const confirmOverlay = $("confirmOverlay");
  let pendingDeleteId = null;

  // ---------- 統計儀表板 ----------
  function renderStats() {
    const total = cars.length;
    const inStock = cars.filter((c) => c.status === "庫存中").length;
    const deposit = cars.filter((c) => c.status === "已收訂").length;
    const sold = cars.filter((c) => c.status === "已售出");
    const soldCount = sold.length;

    const totalCost = cars.reduce(
      (s, c) => s + num(c.purchasePrice) + num(c.repairCost) + num(c.otherCost),
      0
    );
    const revenue = sold.reduce((s, c) => s + num(c.salePrice), 0);
    const profit = sold.reduce((s, c) => s + calcProfit(c), 0);
    const avgProfit = soldCount > 0 ? profit / soldCount : 0;

    $("statTotal").textContent = total;
    $("statInStock").textContent = inStock + deposit; // 庫存含已收訂
    $("statSold").textContent = soldCount;
    $("statCost").textContent = formatMoney(totalCost);
    $("statRevenue").textContent = formatMoney(revenue);
    $("statProfit").textContent = formatMoney(profit);
    $("statAvgProfit").textContent = formatMoney(avgProfit);
  }

  // ---------- 列表渲染 ----------
  function statusBadge(status) {
    const map = {
      "庫存中": "stock",
      "已收訂": "deposit",
      "已售出": "sold",
    };
    const cls = map[status] || "stock";
    return `<span class="badge ${cls}">${escapeHtml(status)}</span>`;
  }

  function getFilteredCars() {
    const keyword = searchInput.value.trim().toLowerCase();
    const status = filterStatus.value;

    let result = cars.filter((c) => {
      if (status && c.status !== status) return false;
      if (!keyword) return true;
      const haystack = [
        c.brand, c.model, c.color, c.plate, c.year, c.notes,
        c.sellerName, c.sellerPhone, c.buyerName, c.buyerPhone, c.contact,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });

    const [field, dir] = sortSelect.value.split("-");
    const factor = dir === "asc" ? 1 : -1;
    result.sort((a, b) => {
      let va, vb;
      if (field === "profit") {
        va = calcProfit(a);
        vb = calcProfit(b);
      } else if (field === "salePrice") {
        va = num(a.salePrice);
        vb = num(b.salePrice);
      } else if (field === "year") {
        va = num(a.year);
        vb = num(b.year);
      } else {
        va = a[field] || 0;
        vb = b[field] || 0;
      }
      if (va < vb) return -1 * factor;
      if (va > vb) return 1 * factor;
      return 0;
    });

    return result;
  }

  function renderTable() {
    const list = getFilteredCars();

    if (list.length === 0) {
      tableBody.innerHTML = "";
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;

    tableBody.innerHTML = list
      .map((c) => {
        const profit = calcProfit(c);
        const profitCls = profit >= 0 ? "pos" : "neg";
        const showProfit = num(c.salePrice) > 0;
        const clientBits = [];
        if (c.sellerName) clientBits.push("賣 " + escapeHtml(c.sellerName));
        if (c.buyerName) clientBits.push("買 " + escapeHtml(c.buyerName));
        const clientLine = clientBits.length
          ? `<div class="car-client">👤 ${clientBits.join(" · ")}</div>`
          : "";
        return `
        <tr>
          <td>${statusBadge(c.status)}</td>
          <td>
            <div class="car-name">${escapeHtml(c.brand)} ${escapeHtml(c.model)}</div>
            <div class="car-sub">${escapeHtml(c.plate || "")}</div>
            ${clientLine}
          </td>
          <td>${c.year ? escapeHtml(c.year) : "-"}</td>
          <td>${escapeHtml(c.color || "-")}</td>
          <td class="num">${formatNumber(c.mileage)}</td>
          <td class="num">${formatMoney(c.purchasePrice)}</td>
          <td class="num">${formatMoney(c.repairCost)}</td>
          <td class="num">${formatMoney(c.otherCost)}</td>
          <td class="num">${num(c.deposit) > 0 ? formatMoney(c.deposit) : "-"}</td>
          <td class="num">${num(c.salePrice) > 0 ? formatMoney(c.salePrice) : "-"}</td>
          <td class="num profit-cell ${profitCls}">${showProfit ? formatMoney(profit) : "-"}</td>
          <td>
            <div class="row-actions">
              <button class="btn-icon" data-edit="${c.id}" title="編輯">✏️</button>
              <button class="btn-icon danger" data-delete="${c.id}" title="刪除">🗑️</button>
            </div>
          </td>
        </tr>`;
      })
      .join("");
  }

  function renderAll() {
    renderStats();
    renderTable();
  }

  // ---------- 表單：新增 / 編輯 ----------
  function openModal(car) {
    carForm.reset();
    if (car) {
      modalTitle.textContent = "編輯車輛";
      $("carId").value = car.id;
      $("fStatus").value = car.status || "庫存中";
      $("fBrand").value = car.brand || "";
      $("fModel").value = car.model || "";
      $("fYear").value = car.year || "";
      $("fColor").value = car.color || "";
      $("fPlate").value = car.plate || "";
      $("fMileage").value = car.mileage || "";
      $("fPurchasePrice").value = car.purchasePrice || "";
      $("fRepairCost").value = car.repairCost || "";
      $("fOtherCost").value = car.otherCost || "";
      $("fDeposit").value = car.deposit || "";
      $("fSalePrice").value = car.salePrice || "";
      $("fPurchaseDate").value = car.purchaseDate || "";
      $("fSaleDate").value = car.saleDate || "";
      $("fSellerName").value = car.sellerName || "";
      $("fSellerPhone").value = car.sellerPhone || "";
      $("fSellerAddress").value = car.sellerAddress || "";
      $("fBuyerName").value = car.buyerName || "";
      $("fBuyerPhone").value = car.buyerPhone || "";
      $("fBuyerAddress").value = car.buyerAddress || "";
      $("fNotes").value = car.notes || "";
    } else {
      modalTitle.textContent = "新增車輛";
      $("carId").value = "";
      $("fStatus").value = "庫存中";
    }
    updateProfitPreview();
    modalOverlay.hidden = false;
    setTimeout(() => $("fBrand").focus(), 50);
  }

  function closeModal() {
    modalOverlay.hidden = true;
  }

  function updateProfitPreview() {
    const profit =
      num($("fSalePrice").value) -
      num($("fPurchasePrice").value) -
      num($("fRepairCost").value) -
      num($("fOtherCost").value);
    const box = $("profitPreview");
    box.textContent = formatMoney(profit);
    box.classList.toggle("neg", profit < 0);
  }

  function handleSubmit(e) {
    e.preventDefault();
    const id = $("carId").value;
    const now = Date.now();

    const data = {
      status: $("fStatus").value,
      brand: $("fBrand").value.trim(),
      model: $("fModel").value.trim(),
      year: $("fYear").value ? num($("fYear").value) : null,
      color: $("fColor").value.trim(),
      plate: $("fPlate").value.trim(),
      mileage: $("fMileage").value ? num($("fMileage").value) : null,
      purchasePrice: num($("fPurchasePrice").value),
      repairCost: num($("fRepairCost").value),
      otherCost: num($("fOtherCost").value),
      deposit: num($("fDeposit").value),
      salePrice: num($("fSalePrice").value),
      purchaseDate: $("fPurchaseDate").value,
      saleDate: $("fSaleDate").value,
      sellerName: $("fSellerName").value.trim(),
      sellerPhone: $("fSellerPhone").value.trim(),
      sellerAddress: $("fSellerAddress").value.trim(),
      buyerName: $("fBuyerName").value.trim(),
      buyerPhone: $("fBuyerPhone").value.trim(),
      buyerAddress: $("fBuyerAddress").value.trim(),
      notes: $("fNotes").value.trim(),
    };

    if (!data.brand || !data.model) {
      showToast("請至少填寫廠牌與車型", "error");
      return;
    }

    if (id) {
      const idx = cars.findIndex((c) => c.id === id);
      if (idx !== -1) {
        cars[idx] = Object.assign({}, cars[idx], data, { updatedAt: now });
      }
      showToast("已更新車輛資料", "success");
    } else {
      cars.push(Object.assign({ id: uid(), createdAt: now, updatedAt: now }, data));
      showToast("已新增車輛", "success");
    }

    saveCars();
    renderAll();
    closeModal();
  }

  // ---------- 刪除 ----------
  function askDelete(id) {
    const car = cars.find((c) => c.id === id);
    if (!car) return;
    pendingDeleteId = id;
    $("confirmText").textContent = `確定要刪除「${car.brand} ${car.model}」嗎？此動作無法復原。`;
    confirmOverlay.hidden = false;
  }

  function doDelete() {
    if (pendingDeleteId) {
      cars = cars.filter((c) => c.id !== pendingDeleteId);
      saveCars();
      renderAll();
      showToast("已刪除", "success");
    }
    pendingDeleteId = null;
    confirmOverlay.hidden = true;
  }

  // ---------- 匯出 CSV ----------
  function exportCsv() {
    if (cars.length === 0) {
      showToast("目前沒有資料可匯出", "error");
      return;
    }
    const headers = [
      "狀態", "廠牌", "車型", "年份", "顏色", "車號", "里程數",
      "進價", "整備費用", "其他費用", "訂金", "成交價", "利潤",
      "進貨日期", "售出日期",
      "賣方姓名", "賣方電話", "賣方地址",
      "買方姓名", "買方電話", "買方地址",
      "備註",
    ];
    const rows = cars.map((c) => [
      c.status, c.brand, c.model, c.year || "", c.color, c.plate, c.mileage || "",
      num(c.purchasePrice), num(c.repairCost), num(c.otherCost), num(c.deposit),
      num(c.salePrice), calcProfit(c), c.purchaseDate, c.saleDate,
      c.sellerName || "", c.sellerPhone || "", c.sellerAddress || "",
      c.buyerName || "", c.buyerPhone || "", c.buyerAddress || "",
      c.notes,
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");

    // 加上 BOM 讓 Excel 正確辨識 UTF-8 中文
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    downloadBlob(blob, `中古車買賣_${dateStamp()}.csv`);
    showToast("已匯出 CSV", "success");
  }

  function csvCell(value) {
    const s = String(value == null ? "" : value);
    if (/[",\r\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  // ---------- 備份 / 還原 (JSON) ----------
  function backup() {
    if (cars.length === 0) {
      showToast("目前沒有資料可備份", "error");
      return;
    }
    const blob = new Blob([JSON.stringify(cars, null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, `中古車買賣_備份_${dateStamp()}.json`);
    showToast("已下載備份檔", "success");
  }

  function restore(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = JSON.parse(e.target.result);
        if (!Array.isArray(data)) throw new Error("格式錯誤");
        if (!confirm(`即將匯入 ${data.length} 筆資料，這會「覆蓋」目前所有資料。確定要繼續嗎？`)) {
          return;
        }
        cars = data.map((c) =>
          Object.assign(
            {
              id: c.id || uid(),
              status: c.status || "庫存中",
              createdAt: c.createdAt || Date.now(),
              updatedAt: c.updatedAt || Date.now(),
            },
            c
          )
        );
        saveCars();
        renderAll();
        showToast(`已還原 ${data.length} 筆資料`, "success");
      } catch (err) {
        console.error(err);
        showToast("還原失敗，檔案格式不正確", "error");
      }
    };
    reader.readAsText(file);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function dateStamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  }

  // ---------- Toast 提示 ----------
  let toastTimer = null;
  function showToast(message, type) {
    const toast = $("toast");
    toast.textContent = message;
    toast.className = "toast" + (type ? " " + type : "");
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 2500);
  }

  // ---------- 事件綁定 ----------
  function bindEvents() {
    $("btnAdd").addEventListener("click", () => openModal(null));
    $("btnAddEmpty").addEventListener("click", () => openModal(null));
    $("modalClose").addEventListener("click", closeModal);
    $("btnCancel").addEventListener("click", closeModal);
    modalOverlay.addEventListener("click", (e) => {
      if (e.target === modalOverlay) closeModal();
    });

    carForm.addEventListener("submit", handleSubmit);

    // 即時計算利潤預覽
    ["fPurchasePrice", "fRepairCost", "fOtherCost", "fSalePrice"].forEach((id) => {
      $(id).addEventListener("input", updateProfitPreview);
    });

    // 表格內的編輯 / 刪除（事件委派）
    tableBody.addEventListener("click", (e) => {
      const editBtn = e.target.closest("[data-edit]");
      const delBtn = e.target.closest("[data-delete]");
      if (editBtn) {
        const car = cars.find((c) => c.id === editBtn.dataset.edit);
        if (car) openModal(car);
      } else if (delBtn) {
        askDelete(delBtn.dataset.delete);
      }
    });

    // 搜尋 / 篩選 / 排序
    searchInput.addEventListener("input", renderTable);
    filterStatus.addEventListener("change", renderTable);
    sortSelect.addEventListener("change", renderTable);

    // 刪除確認
    $("confirmCancel").addEventListener("click", () => {
      pendingDeleteId = null;
      confirmOverlay.hidden = true;
    });
    $("confirmOk").addEventListener("click", doDelete);
    confirmOverlay.addEventListener("click", (e) => {
      if (e.target === confirmOverlay) {
        pendingDeleteId = null;
        confirmOverlay.hidden = true;
      }
    });

    // 匯出 / 備份 / 還原
    $("btnExportCsv").addEventListener("click", exportCsv);
    $("btnBackup").addEventListener("click", backup);
    $("btnRestore").addEventListener("click", () => $("restoreFile").click());
    $("restoreFile").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) restore(file);
      e.target.value = ""; // 允許再次選同一檔案
    });

    // 雲端登入 / 登出
    const loginForm = $("loginForm");
    if (loginForm) loginForm.addEventListener("submit", doLogin);
    const logoutBtn = $("btnLogout");
    if (logoutBtn) logoutBtn.addEventListener("click", doLogout);

    // ESC 關閉彈窗
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (!modalOverlay.hidden) closeModal();
        if (!confirmOverlay.hidden) {
          pendingDeleteId = null;
          confirmOverlay.hidden = true;
        }
      }
    });
  }

  // ---------- 雲端：登入 / 登出 / 同步 ----------
  function updateModeBadge(state, email) {
    const badge = $("modeBadge");
    const logoutBtn = $("btnLogout");
    if (!badge) return;
    if (!cloudMode) {
      badge.textContent = "💾 本機模式";
      badge.className = "mode-badge local";
      if (logoutBtn) logoutBtn.hidden = true;
      return;
    }
    if (state === "cloud") {
      badge.textContent = "☁️ 雲端同步中";
      badge.title = email || "";
      badge.className = "mode-badge cloud";
      if (logoutBtn) logoutBtn.hidden = false;
    } else if (state === "connecting") {
      badge.textContent = "☁️ 連線中…";
      badge.className = "mode-badge connecting";
      if (logoutBtn) logoutBtn.hidden = true;
    } else {
      badge.textContent = "☁️ 未登入";
      badge.className = "mode-badge out";
      if (logoutBtn) logoutBtn.hidden = true;
    }
  }

  function showLogin() {
    const o = $("loginOverlay");
    if (o) o.hidden = false;
  }

  function hideLogin() {
    const o = $("loginOverlay");
    if (o) o.hidden = true;
  }

  function doLogin(e) {
    if (e) e.preventDefault();
    const email = $("loginEmail").value.trim();
    const pw = $("loginPassword").value;
    const errBox = $("loginError");
    errBox.textContent = "";
    if (!email || !pw) {
      errBox.textContent = "請輸入帳號與密碼";
      return;
    }
    const btn = $("loginBtn");
    btn.disabled = true;
    btn.textContent = "登入中…";
    auth
      .signInWithEmailAndPassword(email, pw)
      .catch((err) => {
        console.error(err);
        errBox.textContent = "登入失敗：帳號或密碼錯誤";
      })
      .finally(() => {
        btn.disabled = false;
        btn.textContent = "登入";
      });
  }

  function doLogout() {
    if (auth) auth.signOut();
  }

  function subscribeCloud() {
    if (unsub) unsub();
    updateModeBadge("connecting");
    unsub = docRef.onSnapshot(
      (snap) => {
        const data = snap.data();
        cars = normalizeCars(data && Array.isArray(data.cars) ? data.cars : []);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(cars));
        } catch (e) {}
        renderAll();
        if (auth.currentUser) updateModeBadge("cloud", auth.currentUser.email);
      },
      (err) => {
        console.error("雲端同步錯誤", err);
        showToast("雲端連線發生問題，請檢查安全規則設定", "error");
      }
    );
  }

  function initCloud() {
    updateModeBadge("connecting");
    auth.onAuthStateChanged((user) => {
      if (user) {
        cloudReady = true;
        hideLogin();
        updateModeBadge("cloud", user.email);
        subscribeCloud();
      } else {
        cloudReady = false;
        if (unsub) {
          unsub();
          unsub = null;
        }
        cars = [];
        renderAll();
        updateModeBadge("out");
        showLogin();
      }
    });
  }

  // ---------- 初始化 ----------
  bindEvents();
  if (cloudMode) {
    initCloud();
  } else {
    updateModeBadge("local");
    renderAll();
  }
})();
