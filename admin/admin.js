import { PLAYON_ADMIN_CONFIG } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const config = PLAYON_ADMIN_CONFIG;
const statusLabels = {
  live: "Live",
  soft_launch: "Soft launch",
  in_development: "In development",
  sunset: "Sunset"
};

const state = {
  auth: null,
  db: null,
  user: null,
  games: [],
  rangeMetrics: [],
  recentMetrics: [],
  charts: {}
};

const els = {
  configBanner: document.querySelector("#configBanner"),
  sessionBadge: document.querySelector("#sessionBadge"),
  logoutButton: document.querySelector("#logoutButton"),
  loginPanel: document.querySelector("#loginPanel"),
  appPanel: document.querySelector("#appPanel"),
  loginForm: document.querySelector("#loginForm"),
  loginButton: document.querySelector("#loginButton"),
  loginEmail: document.querySelector("#loginEmail"),
  loginPassword: document.querySelector("#loginPassword"),
  authFeedback: document.querySelector("#authFeedback"),
  rangePreset: document.querySelector("#rangePreset"),
  rangeStart: document.querySelector("#rangeStart"),
  rangeEnd: document.querySelector("#rangeEnd"),
  gameFilter: document.querySelector("#gameFilter"),
  platformFilter: document.querySelector("#platformFilter"),
  refreshButton: document.querySelector("#refreshButton"),
  dataFreshness: document.querySelector("#dataFreshness"),
  kpiRevenue: document.querySelector("#kpiRevenue"),
  kpiDownloads: document.querySelector("#kpiDownloads"),
  kpiSpend: document.querySelector("#kpiSpend"),
  kpiDau: document.querySelector("#kpiDau"),
  kpiRoas: document.querySelector("#kpiRoas"),
  summaryTableBody: document.querySelector("#summaryTableBody"),
  gamesTableBody: document.querySelector("#gamesTableBody"),
  metricsTableBody: document.querySelector("#metricsTableBody"),
  gameForm: document.querySelector("#gameForm"),
  gameId: document.querySelector("#gameId"),
  gameName: document.querySelector("#gameName"),
  gameSlug: document.querySelector("#gameSlug"),
  gameStatus: document.querySelector("#gameStatus"),
  platformIos: document.querySelector("#platformIos"),
  platformAndroid: document.querySelector("#platformAndroid"),
  gameIosUrl: document.querySelector("#gameIosUrl"),
  gameAndroidUrl: document.querySelector("#gameAndroidUrl"),
  gameNotes: document.querySelector("#gameNotes"),
  resetGameForm: document.querySelector("#resetGameForm"),
  gameFeedback: document.querySelector("#gameFeedback"),
  metricForm: document.querySelector("#metricForm"),
  metricGame: document.querySelector("#metricGame"),
  metricPlatform: document.querySelector("#metricPlatform"),
  metricDate: document.querySelector("#metricDate"),
  metricDownloads: document.querySelector("#metricDownloads"),
  metricRevenue: document.querySelector("#metricRevenue"),
  metricAdRevenue: document.querySelector("#metricAdRevenue"),
  metricIapRevenue: document.querySelector("#metricIapRevenue"),
  metricAdSpend: document.querySelector("#metricAdSpend"),
  metricDau: document.querySelector("#metricDau"),
  metricMau: document.querySelector("#metricMau"),
  metricSessions: document.querySelector("#metricSessions"),
  metricRating: document.querySelector("#metricRating"),
  metricCrashFree: document.querySelector("#metricCrashFree"),
  metricNotes: document.querySelector("#metricNotes"),
  resetMetricForm: document.querySelector("#resetMetricForm"),
  metricFeedback: document.querySelector("#metricFeedback")
};

wireEvents();
initializeDefaults();

if (hasPlaceholderConfig()) {
  renderSetupState();
} else {
  initializeFirebase();
}

function wireEvents() {
  els.loginForm.addEventListener("submit", handleLoginSubmit);
  els.logoutButton.addEventListener("click", handleLogout);
  els.rangePreset.addEventListener("change", handlePresetChange);
  els.rangeStart.addEventListener("change", clearPresetSelection);
  els.rangeEnd.addEventListener("change", clearPresetSelection);
  els.gameFilter.addEventListener("change", handleSliceFilterChange);
  els.platformFilter.addEventListener("change", handleSliceFilterChange);
  els.refreshButton.addEventListener("click", refreshRangeAndRecentData);
  els.gameForm.addEventListener("submit", handleGameSubmit);
  els.resetGameForm.addEventListener("click", resetGameForm);
  els.metricForm.addEventListener("submit", handleMetricSubmit);
  els.resetMetricForm.addEventListener("click", resetMetricForm);
  els.gameName.addEventListener("input", maybeMirrorSlug);
  els.gamesTableBody.addEventListener("click", handleGameTableClick);
  els.metricsTableBody.addEventListener("click", handleMetricsTableClick);
}

function initializeDefaults() {
  setDateRangeFromPreset(Number(els.rangePreset.value));
  els.metricDate.value = todayIso();
}

function initializeFirebase() {
  const app = initializeApp(config.firebase);
  state.auth = getAuth(app);
  state.db = getFirestore(app);

  els.configBanner.hidden = true;
  setAuthFeedback("Sign in with your admin account.");

  onAuthStateChanged(state.auth, async (user) => {
    if (!user) {
      state.user = null;
      renderSignedOut();
      return;
    }

    if (!isAllowedUser(user.email)) {
      setAuthFeedback(`This account is not allowed. Replace adminEmail in firebase-config.js or sign in with ${config.adminEmail}.`, "error");
      await signOut(state.auth);
      return;
    }

    state.user = user;
    renderSignedIn();

    try {
      await refreshAll();
    } catch (error) {
      handleFirestoreError(error, els.authFeedback);
    }
  });
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  if (hasPlaceholderConfig()) {
    setAuthFeedback("Firebase config is still using placeholders.", "error");
    return;
  }

  els.loginButton.disabled = true;
  setAuthFeedback("Signing in...");

  try {
    await signInWithEmailAndPassword(
      state.auth,
      els.loginEmail.value.trim(),
      els.loginPassword.value
    );
    els.loginPassword.value = "";
  } catch (error) {
    setAuthFeedback(normalizeAuthError(error), "error");
  } finally {
    els.loginButton.disabled = false;
  }
}

async function handleLogout() {
  if (!state.auth) {
    return;
  }

  await signOut(state.auth);
}

function renderSetupState() {
  renderSignedOut();
  els.configBanner.hidden = false;
  setBadge("Setup required");
  setAuthFeedback("Waiting for Firebase config.", "error");
}

function renderSignedOut() {
  els.loginPanel.hidden = false;
  els.appPanel.hidden = true;
  els.logoutButton.hidden = true;
  setBadge("Signed out");
}

function renderSignedIn() {
  els.loginPanel.hidden = true;
  els.appPanel.hidden = false;
  els.logoutButton.hidden = false;
  setBadge(state.user.email, true);
  setAuthFeedback(`Signed in as ${state.user.email}.`, "success");
}

async function refreshAll() {
  await loadGames();
  await refreshRangeAndRecentData();
}

async function refreshRangeAndRecentData() {
  if (!state.db) {
    return;
  }

  await Promise.all([loadRangeMetrics(), loadRecentMetrics()]);
  renderDashboard();
  renderRecentMetricsTable();
  els.dataFreshness.textContent = `Last synced ${formatDateTime(new Date())}`;
}

async function loadGames() {
  const gamesQuery = query(
    collection(state.db, config.collections.games),
    orderBy("name", "asc")
  );
  const snapshot = await getDocs(gamesQuery);

  state.games = snapshot.docs.map((snapshotDoc) => normalizeGame(snapshotDoc.id, snapshotDoc.data()));
  populateGameOptions();
  renderGamesTable();
}

async function loadRangeMetrics() {
  const start = els.rangeStart.value;
  const end = els.rangeEnd.value;

  if (!start || !end) {
    return;
  }

  const metricsQuery = query(
    collection(state.db, config.collections.dailyMetrics),
    where("date", ">=", start),
    where("date", "<=", end),
    orderBy("date", "asc")
  );

  const snapshot = await getDocs(metricsQuery);
  state.rangeMetrics = snapshot.docs.map((snapshotDoc) => normalizeMetric(snapshotDoc.id, snapshotDoc.data()));
}

async function loadRecentMetrics() {
  const metricsQuery = query(
    collection(state.db, config.collections.dailyMetrics),
    orderBy("date", "desc"),
    limit(25)
  );

  const snapshot = await getDocs(metricsQuery);
  state.recentMetrics = snapshot.docs.map((snapshotDoc) => normalizeMetric(snapshotDoc.id, snapshotDoc.data()));
}

function populateGameOptions() {
  const options = ['<option value="all">All games</option>']
    .concat(state.games.map((game) => `<option value="${escapeHtml(game.id)}">${escapeHtml(game.name)}</option>`))
    .join("");

  els.gameFilter.innerHTML = options;

  const metricOptions = ['<option value="">Select a game</option>']
    .concat(state.games.map((game) => `<option value="${escapeHtml(game.id)}">${escapeHtml(game.name)}</option>`))
    .join("");

  els.metricGame.innerHTML = metricOptions;
}

function renderDashboard() {
  const metrics = getFilteredRangeMetrics();
  const summary = buildSummary(metrics);

  els.kpiRevenue.textContent = formatCurrency(summary.totalRevenue);
  els.kpiDownloads.textContent = formatNumber(summary.totalDownloads);
  els.kpiSpend.textContent = formatCurrency(summary.totalSpend);
  els.kpiDau.textContent = formatNumber(summary.averageDau);
  els.kpiRoas.textContent = formatPercent(summary.roas);

  renderSummaryTable(summary.gameRows);
  renderTrendChart(summary.dailyRows);
  renderDownloadsChart(summary.dailyRows);
  renderPlatformChart(summary.platformRows);
}

function renderSummaryTable(rows) {
  if (!rows.length) {
    els.summaryTableBody.innerHTML = `<tr><td colspan="5" class="table-empty">No metrics in this range yet.</td></tr>`;
    return;
  }

  els.summaryTableBody.innerHTML = rows
    .map((row) => `
      <tr>
        <td>${escapeHtml(row.gameName)}</td>
        <td>${formatCurrency(row.revenue)}</td>
        <td>${formatNumber(row.downloads)}</td>
        <td>${formatCurrency(row.spend)}</td>
        <td>${formatPercent(row.roas)}</td>
      </tr>
    `)
    .join("");
}

function renderGamesTable() {
  if (!state.games.length) {
    els.gamesTableBody.innerHTML = `<tr><td colspan="5" class="table-empty">No games created yet.</td></tr>`;
    return;
  }

  els.gamesTableBody.innerHTML = state.games
    .map((game) => `
      <tr>
        <td>
          <strong>${escapeHtml(game.name)}</strong>
          ${renderStoreLinks(game)}
        </td>
        <td><span class="status-pill" data-status="${escapeHtml(game.status)}">${escapeHtml(statusLabels[game.status] || game.status)}</span></td>
        <td>
          <div class="pill-list">
            ${game.platforms.map((platform) => `<span class="platform-pill">${escapeHtml(platformLabel(platform))}</span>`).join("")}
          </div>
        </td>
        <td>${formatDateTime(game.updatedAt)}</td>
        <td>
          <button class="row-action" type="button" data-game-edit="${escapeHtml(game.id)}">Edit</button>
        </td>
      </tr>
    `)
    .join("");
}

function renderRecentMetricsTable() {
  const metrics = state.recentMetrics.filter(matchesFilters);

  if (!metrics.length) {
    els.metricsTableBody.innerHTML = `<tr><td colspan="7" class="table-empty">No recent daily metrics found.</td></tr>`;
    return;
  }

  els.metricsTableBody.innerHTML = metrics
    .map((metric) => `
      <tr>
        <td>${escapeHtml(metric.date)}</td>
        <td>${escapeHtml(metric.gameName)}</td>
        <td>${escapeHtml(platformLabel(metric.platform))}</td>
        <td>${formatCurrency(metric.revenue)}</td>
        <td>${formatNumber(metric.downloads)}</td>
        <td>${formatCurrency(metric.adSpend)}</td>
        <td>
          <div class="row-actions">
            <button class="row-action" type="button" data-metric-edit="${escapeHtml(metric.id)}">Edit</button>
            <button class="row-action is-danger" type="button" data-metric-delete="${escapeHtml(metric.id)}">Delete</button>
          </div>
        </td>
      </tr>
    `)
    .join("");
}

function renderTrendChart(rows) {
  if (!window.Chart) {
    return;
  }

  const labels = rows.map((row) => row.date);
  const revenue = rows.map((row) => row.revenue);
  const spend = rows.map((row) => row.spend);

  upsertChart("trendChart", {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Revenue",
          data: revenue,
          borderColor: "#dfc38f",
          backgroundColor: "rgba(223, 195, 143, 0.18)",
          borderWidth: 3,
          fill: true,
          tension: 0.34
        },
        {
          label: "Ad Spend",
          data: spend,
          borderColor: "#8db7e3",
          backgroundColor: "rgba(141, 183, 227, 0.12)",
          borderWidth: 2,
          fill: false,
          tension: 0.32
        }
      ]
    },
    options: baseChartOptions()
  });
}

function renderDownloadsChart(rows) {
  if (!window.Chart) {
    return;
  }

  upsertChart("downloadsChart", {
    type: "bar",
    data: {
      labels: rows.map((row) => row.date),
      datasets: [
        {
          label: "Downloads",
          data: rows.map((row) => row.downloads),
          backgroundColor: "rgba(145, 214, 177, 0.74)",
          borderRadius: 8,
          maxBarThickness: 20
        }
      ]
    },
    options: baseChartOptions()
  });
}

function renderPlatformChart(rows) {
  if (!window.Chart) {
    return;
  }

  upsertChart("platformChart", {
    type: "doughnut",
    data: {
      labels: rows.map((row) => platformLabel(row.platform)),
      datasets: [
        {
          data: rows.map((row) => row.revenue),
          backgroundColor: ["#dfc38f", "#8db7e3", "#91d6b1"],
          borderWidth: 0
        }
      ]
    },
    options: {
      ...baseChartOptions(),
      cutout: "68%"
    }
  });
}

function upsertChart(id, configObject) {
  const previousChart = state.charts[id];

  if (previousChart) {
    previousChart.destroy();
  }

  const element = document.getElementById(id);
  state.charts[id] = new window.Chart(element, configObject);
}

function baseChartOptions() {
  return {
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: "#f6f2ea"
        }
      }
    },
    scales: {
      x: {
        ticks: {
          color: "#97a8bc"
        },
        grid: {
          color: "rgba(255, 255, 255, 0.04)"
        }
      },
      y: {
        ticks: {
          color: "#97a8bc"
        },
        grid: {
          color: "rgba(255, 255, 255, 0.06)"
        }
      }
    }
  };
}

async function handleGameSubmit(event) {
  event.preventDefault();

  if (!state.db || !state.user) {
    return;
  }

  const platforms = getSelectedPlatforms();
  if (!platforms.length) {
    setFeedback(els.gameFeedback, "Pick at least one platform.", "error");
    return;
  }

  const id = els.gameId.value || crypto.randomUUID();
  const payload = {
    name: els.gameName.value.trim(),
    slug: slugify(els.gameSlug.value.trim() || els.gameName.value),
    status: els.gameStatus.value,
    platforms,
    iosUrl: els.gameIosUrl.value.trim(),
    androidUrl: els.gameAndroidUrl.value.trim(),
    notes: els.gameNotes.value.trim(),
    updatedAt: serverTimestamp(),
    updatedBy: state.user.email
  };

  if (!payload.name || !payload.slug) {
    setFeedback(els.gameFeedback, "Game name and slug are required.", "error");
    return;
  }

  if (!els.gameId.value) {
    payload.createdAt = serverTimestamp();
    payload.createdBy = state.user.email;
  }

  try {
    await setDoc(doc(state.db, config.collections.games, id), payload, { merge: true });
    setFeedback(els.gameFeedback, "Game saved.", "success");
    resetGameForm();
    await loadGames();
  } catch (error) {
    handleFirestoreError(error, els.gameFeedback);
  }
}

async function handleMetricSubmit(event) {
  event.preventDefault();

  if (!state.db || !state.user) {
    return;
  }

  const gameId = els.metricGame.value;
  const game = state.games.find((entry) => entry.id === gameId);
  const platform = els.metricPlatform.value;
  const date = els.metricDate.value;

  if (!game || !platform || !date) {
    setFeedback(els.metricFeedback, "Game, platform and date are required.", "error");
    return;
  }

  const adRevenue = readNumber(els.metricAdRevenue.value);
  const iapRevenue = readNumber(els.metricIapRevenue.value);
  const explicitRevenue = readNumber(els.metricRevenue.value);
  const computedRevenue = explicitRevenue > 0 ? explicitRevenue : adRevenue + iapRevenue;
  const documentId = buildMetricId(gameId, platform, date);

  const payload = {
    gameId,
    gameName: game.name,
    gameSlug: game.slug,
    platform,
    date,
    downloads: readNumber(els.metricDownloads.value),
    revenue: computedRevenue,
    adRevenue,
    iapRevenue,
    adSpend: readNumber(els.metricAdSpend.value),
    dau: readNumber(els.metricDau.value),
    mau: readNumber(els.metricMau.value),
    sessions: readNumber(els.metricSessions.value),
    rating: readNumber(els.metricRating.value),
    crashFreeUsers: readNumber(els.metricCrashFree.value),
    notes: els.metricNotes.value.trim(),
    updatedAt: serverTimestamp(),
    updatedBy: state.user.email
  };

  try {
    const metricRef = doc(state.db, config.collections.dailyMetrics, documentId);
    await setDoc(metricRef, payload, { merge: true });
    setFeedback(els.metricFeedback, "Daily metric saved.", "success");
    resetMetricForm();
    await refreshRangeAndRecentData();
  } catch (error) {
    handleFirestoreError(error, els.metricFeedback);
  }
}

function handleGameTableClick(event) {
  const gameId = event.target.dataset.gameEdit;
  if (!gameId) {
    return;
  }

  const game = state.games.find((entry) => entry.id === gameId);
  if (!game) {
    return;
  }

  els.gameId.value = game.id;
  els.gameName.value = game.name;
  els.gameSlug.value = game.slug;
  els.gameStatus.value = game.status;
  els.platformIos.checked = game.platforms.includes("ios");
  els.platformAndroid.checked = game.platforms.includes("android");
  els.gameIosUrl.value = game.iosUrl || "";
  els.gameAndroidUrl.value = game.androidUrl || "";
  els.gameNotes.value = game.notes || "";
  setFeedback(els.gameFeedback, `Editing ${game.name}.`, "success");
  els.gameName.focus();
}

async function handleMetricsTableClick(event) {
  const editId = event.target.dataset.metricEdit;
  const deleteId = event.target.dataset.metricDelete;

  if (editId) {
    const metric = state.recentMetrics.find((entry) => entry.id === editId);
    if (!metric) {
      return;
    }

    els.metricGame.value = metric.gameId;
    els.metricPlatform.value = metric.platform;
    els.metricDate.value = metric.date;
    els.metricDownloads.value = metric.downloads || "";
    els.metricRevenue.value = metric.revenue || "";
    els.metricAdRevenue.value = metric.adRevenue || "";
    els.metricIapRevenue.value = metric.iapRevenue || "";
    els.metricAdSpend.value = metric.adSpend || "";
    els.metricDau.value = metric.dau || "";
    els.metricMau.value = metric.mau || "";
    els.metricSessions.value = metric.sessions || "";
    els.metricRating.value = metric.rating || "";
    els.metricCrashFree.value = metric.crashFreeUsers || "";
    els.metricNotes.value = metric.notes || "";
    setFeedback(els.metricFeedback, `Editing ${metric.gameName} on ${metric.date}.`, "success");
    els.metricGame.focus();
    return;
  }

  if (!deleteId || !state.db || !state.user) {
    return;
  }

  const metric = state.recentMetrics.find((entry) => entry.id === deleteId);
  const label = metric ? `${metric.gameName} ${metric.date} ${platformLabel(metric.platform)}` : "this entry";
  if (!window.confirm(`Delete ${label}?`)) {
    return;
  }

  try {
    await deleteDoc(doc(state.db, config.collections.dailyMetrics, deleteId));
    setFeedback(els.metricFeedback, "Daily metric deleted.", "success");
    await refreshRangeAndRecentData();
  } catch (error) {
    handleFirestoreError(error, els.metricFeedback);
  }
}

function resetGameForm() {
  els.gameForm.reset();
  els.gameId.value = "";
  els.platformIos.checked = true;
  els.platformAndroid.checked = true;
  els.gameStatus.value = "live";
  clearFeedback(els.gameFeedback);
}

function resetMetricForm() {
  els.metricForm.reset();
  els.metricDate.value = todayIso();
  clearFeedback(els.metricFeedback);
}

function handlePresetChange() {
  setDateRangeFromPreset(Number(els.rangePreset.value));
  refreshRangeAndRecentData().catch((error) => handleFirestoreError(error, els.metricFeedback));
}

function handleSliceFilterChange() {
  renderDashboard();
  renderRecentMetricsTable();
}

function clearPresetSelection() {
  els.rangePreset.value = "";
}

function setDateRangeFromPreset(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  els.rangeStart.value = toIsoDate(start);
  els.rangeEnd.value = toIsoDate(end);
}

function maybeMirrorSlug() {
  if (els.gameId.value) {
    return;
  }

  els.gameSlug.value = slugify(els.gameName.value);
}

function getFilteredRangeMetrics() {
  return state.rangeMetrics.filter(matchesFilters);
}

function matchesFilters(metric) {
  const gameFilter = els.gameFilter.value;
  const platformFilter = els.platformFilter.value;

  const matchesGame = gameFilter === "all" || metric.gameId === gameFilter;
  const matchesPlatform = platformFilter === "all" || metric.platform === platformFilter;
  return matchesGame && matchesPlatform;
}

function buildSummary(metrics) {
  const dailyMap = new Map();
  const gameMap = new Map();
  const platformMap = new Map();

  let totalRevenue = 0;
  let totalDownloads = 0;
  let totalSpend = 0;
  let dauSum = 0;

  metrics.forEach((metric) => {
    totalRevenue += metric.revenue;
    totalDownloads += metric.downloads;
    totalSpend += metric.adSpend;
    dauSum += metric.dau;

    const dailyEntry = dailyMap.get(metric.date) || { date: metric.date, revenue: 0, spend: 0, downloads: 0 };
    dailyEntry.revenue += metric.revenue;
    dailyEntry.spend += metric.adSpend;
    dailyEntry.downloads += metric.downloads;
    dailyMap.set(metric.date, dailyEntry);

    const gameEntry = gameMap.get(metric.gameId) || {
      gameName: metric.gameName,
      revenue: 0,
      downloads: 0,
      spend: 0
    };
    gameEntry.revenue += metric.revenue;
    gameEntry.downloads += metric.downloads;
    gameEntry.spend += metric.adSpend;
    gameMap.set(metric.gameId, gameEntry);

    const platformEntry = platformMap.get(metric.platform) || {
      platform: metric.platform,
      revenue: 0
    };
    platformEntry.revenue += metric.revenue;
    platformMap.set(metric.platform, platformEntry);
  });

  const dailyRows = Array.from(dailyMap.values()).sort((left, right) => left.date.localeCompare(right.date));
  const gameRows = Array.from(gameMap.values())
    .map((entry) => ({
      ...entry,
      roas: entry.spend > 0 ? entry.revenue / entry.spend : 0
    }))
    .sort((left, right) => right.revenue - left.revenue);
  const platformRows = Array.from(platformMap.values()).sort((left, right) => right.revenue - left.revenue);

  return {
    totalRevenue,
    totalDownloads,
    totalSpend,
    averageDau: metrics.length ? Math.round(dauSum / metrics.length) : 0,
    roas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
    dailyRows,
    gameRows,
    platformRows
  };
}

function normalizeGame(id, payload) {
  return {
    id,
    name: payload.name || "Untitled",
    slug: payload.slug || id,
    status: payload.status || "live",
    platforms: Array.isArray(payload.platforms) ? payload.platforms : [],
    iosUrl: payload.iosUrl || "",
    androidUrl: payload.androidUrl || "",
    notes: payload.notes || "",
    updatedAt: parseDate(payload.updatedAt),
    createdAt: parseDate(payload.createdAt)
  };
}

function normalizeMetric(id, payload) {
  return {
    id,
    gameId: payload.gameId || "",
    gameName: payload.gameName || "Unknown game",
    gameSlug: payload.gameSlug || "",
    platform: payload.platform || "ios",
    date: payload.date || "",
    downloads: readNumber(payload.downloads),
    revenue: readNumber(payload.revenue),
    adRevenue: readNumber(payload.adRevenue),
    iapRevenue: readNumber(payload.iapRevenue),
    adSpend: readNumber(payload.adSpend),
    dau: readNumber(payload.dau),
    mau: readNumber(payload.mau),
    sessions: readNumber(payload.sessions),
    rating: readNumber(payload.rating),
    crashFreeUsers: readNumber(payload.crashFreeUsers),
    notes: payload.notes || "",
    updatedAt: parseDate(payload.updatedAt)
  };
}

function isAllowedUser(email) {
  return Boolean(email) && email.toLowerCase() === config.adminEmail.toLowerCase();
}

function hasPlaceholderConfig() {
  const firebaseConfig = config.firebase || {};
  return (
    !config.adminEmail ||
    config.adminEmail.startsWith("YOUR_") ||
    !firebaseConfig.apiKey ||
    firebaseConfig.apiKey.startsWith("YOUR_") ||
    !firebaseConfig.projectId ||
    firebaseConfig.projectId.startsWith("YOUR_")
  );
}

function getSelectedPlatforms() {
  return ["ios", "android"].filter((platform) => {
    if (platform === "ios") {
      return els.platformIos.checked;
    }

    return els.platformAndroid.checked;
  });
}

function renderStoreLinks(game) {
  const links = [];
  if (game.iosUrl) {
    links.push(`<a class="text-link" href="${escapeAttribute(game.iosUrl)}" target="_blank" rel="noreferrer">App Store</a>`);
  }
  if (game.androidUrl) {
    links.push(`<a class="text-link" href="${escapeAttribute(game.androidUrl)}" target="_blank" rel="noreferrer">Google Play</a>`);
  }
  if (!links.length) {
    return "";
  }

  return `<div class="link-cell">${links.join("<span>•</span>")}</div>`;
}

function buildMetricId(gameId, platform, date) {
  return [gameId, platform, date].join("__");
}

function parseDate(value) {
  if (!value) {
    return null;
  }
  if (typeof value.toDate === "function") {
    return value.toDate();
  }
  if (value instanceof Date) {
    return value;
  }
  return new Date(value);
}

function setBadge(text, isLive = false) {
  els.sessionBadge.textContent = text;
  els.sessionBadge.classList.toggle("is-live", isLive);
}

function setAuthFeedback(message, tone) {
  setFeedback(els.authFeedback, message, tone);
}

function setFeedback(element, message, tone) {
  element.textContent = message;
  element.classList.remove("is-error", "is-success");

  if (tone === "error") {
    element.classList.add("is-error");
  }

  if (tone === "success") {
    element.classList.add("is-success");
  }
}

function clearFeedback(element) {
  element.textContent = "";
  element.classList.remove("is-error", "is-success");
}

function formatCurrency(value) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: config.dashboard.currency || "USD",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(Math.round(value || 0));
}

function formatPercent(value) {
  return `${Math.round((value || 0) * 100)}%`;
}

function formatDateTime(date) {
  if (!date || Number.isNaN(date.getTime())) {
    return "Not yet";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: config.dashboard.timezone || "UTC"
  }).format(date);
}

function platformLabel(value) {
  if (value === "ios") {
    return "iOS";
  }
  if (value === "android") {
    return "Android";
  }
  return value;
}

function normalizeAuthError(error) {
  const errorMessages = {
    "auth/invalid-credential": "Invalid email or password.",
    "auth/invalid-email": "Email address is invalid.",
    "auth/missing-password": "Password is required.",
    "auth/too-many-requests": "Too many attempts. Try again later."
  };

  return errorMessages[error.code] || error.message || "Login failed.";
}

function handleFirestoreError(error, feedbackElement) {
  const message =
    error.code === "permission-denied"
      ? "Firestore denied access. Check the rules and confirm the admin email matches."
      : error.code === "failed-precondition"
        ? "Firestore needs an index or database setup change. Review ADMIN_SETUP.md."
        : error.message || "Unexpected Firebase error.";

  setFeedback(feedbackElement, message, "error");
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayIso() {
  return toIsoDate(new Date());
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
