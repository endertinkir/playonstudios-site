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
  getDocs,
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const config = PLAYON_ADMIN_CONFIG;
const levelBuckets = ["0-4", "5-9", "10-19", "20-49", "50+"];

const state = {
  auth: null,
  db: null,
  user: null,
  users: [],
  charts: {}
};

const els = {
  authGate: document.querySelector("#authGate"),
  authGateTitle: document.querySelector("#authGateTitle"),
  authGateText: document.querySelector("#authGateText"),
  authScreen: document.querySelector("#authScreen"),
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
  platformFilter: document.querySelector("#platformFilter"),
  refreshButton: document.querySelector("#refreshButton"),
  dataFreshness: document.querySelector("#dataFreshness"),
  kpiTotalProfiles: document.querySelector("#kpiTotalProfiles"),
  kpiActiveProfiles: document.querySelector("#kpiActiveProfiles"),
  kpiAvgLevel: document.querySelector("#kpiAvgLevel"),
  kpiAvgPowerUses: document.querySelector("#kpiAvgPowerUses"),
  kpiAvgToolsUnlocked: document.querySelector("#kpiAvgToolsUnlocked"),
  summaryTableBody: document.querySelector("#summaryTableBody"),
  recentUsersTableBody: document.querySelector("#recentUsersTableBody")
};

wireEvents();
initializeDefaults();
setAuthGate("loading");

if (hasPlaceholderConfig()) {
  renderSetupState();
} else {
  initializeFirebase();
}

function wireEvents() {
  els.loginForm.addEventListener("submit", handleLoginSubmit);
  els.logoutButton.addEventListener("click", handleLogout);
  els.rangePreset.addEventListener("change", handlePresetChange);
  els.rangeStart.addEventListener("change", handleManualRangeChange);
  els.rangeEnd.addEventListener("change", handleManualRangeChange);
  els.platformFilter.addEventListener("change", renderDashboard);
  els.refreshButton.addEventListener("click", () => {
    refreshAll().catch(handleDashboardError);
  });
}

function initializeDefaults() {
  setDateRangeFromPreset(Number(els.rangePreset.value));
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
      handleDashboardError(error);
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
  els.authScreen.hidden = false;
  els.configBanner.hidden = false;
  setAuthGate("setup");
  setBadge("Setup required");
  setAuthFeedback("Waiting for Firebase config.", "error");
}

function renderSignedOut() {
  setAuthGate("hidden");
  els.authScreen.hidden = false;
  els.loginPanel.hidden = false;
  els.appPanel.hidden = true;
  els.logoutButton.hidden = true;
  setBadge("Signed out");
}

function renderSignedIn() {
  setAuthGate("signed_in");
  els.authScreen.hidden = true;
  els.loginPanel.hidden = true;
  els.appPanel.hidden = false;
  els.logoutButton.hidden = false;
  setBadge(state.user.email, true);
  setAuthFeedback(`Signed in as ${state.user.email}.`, "success");
}

async function refreshAll() {
  if (!state.db) {
    return;
  }

  await loadUsers();
  renderDashboard();
  els.dataFreshness.textContent = `Last synced ${formatDateTime(new Date())}`;
}

async function loadUsers() {
  const usersCollection = config.collections.users || "users";
  const snapshot = await getDocs(collection(state.db, usersCollection));

  state.users = snapshot.docs
    .map((snapshotDoc) => normalizeUser(snapshotDoc.id, snapshotDoc.data()))
    .sort((left, right) => compareDates(right.updatedAt, left.updatedAt));
}

function renderDashboard() {
  const summary = buildUserSummary();

  els.kpiTotalProfiles.textContent = formatNumber(summary.totalProfiles);
  els.kpiActiveProfiles.textContent = formatNumber(summary.activeProfiles);
  els.kpiAvgLevel.textContent = formatDecimal(summary.avgLevel);
  els.kpiAvgPowerUses.textContent = formatDecimal(summary.avgPowerUses);
  els.kpiAvgToolsUnlocked.textContent = formatDecimal(summary.avgToolsUnlocked);

  renderPlatformSummaryTable(summary.platformRows);
  renderRecentUsersTable(summary.recentUsers);
  renderTrendChart(summary.dailyRows);
  renderPlatformChart(summary.platformRows);
  renderLevelChart(summary.levelRows);
}

function buildUserSummary() {
  const usersForPlatform = getUsersForPlatform();
  const activeUsers = usersForPlatform.filter(isUserInRange);
  const powerUses = activeUsers.map((user) => user.powerUses);
  const toolsUnlocked = activeUsers.map((user) => user.toolsUnlockedCount);
  const levels = activeUsers.map((user) => user.level);

  return {
    totalProfiles: usersForPlatform.length,
    activeProfiles: activeUsers.length,
    avgLevel: average(levels),
    avgPowerUses: average(powerUses),
    avgToolsUnlocked: average(toolsUnlocked),
    dailyRows: buildDailyRows(activeUsers),
    platformRows: buildPlatformRows(activeUsers),
    levelRows: buildLevelRows(activeUsers),
    recentUsers: buildRecentUsers(activeUsers, usersForPlatform)
  };
}

function getUsersForPlatform() {
  const platformFilter = els.platformFilter.value;

  if (platformFilter === "all") {
    return state.users;
  }

  return state.users.filter((user) => user.lastSeenPlatform === platformFilter);
}

function isUserInRange(user) {
  if (!user.updatedAt || Number.isNaN(user.updatedAt.getTime())) {
    return false;
  }

  const { start, end } = getRangeBounds();
  return user.updatedAt >= start && user.updatedAt <= end;
}

function buildDailyRows(users) {
  const { start, end } = getRangeBounds();
  const dayMap = new Map();

  for (const date of iterateDays(start, end)) {
    dayMap.set(toIsoDate(date), 0);
  }

  users.forEach((user) => {
    const key = toIsoDate(user.updatedAt);
    dayMap.set(key, (dayMap.get(key) || 0) + 1);
  });

  return Array.from(dayMap.entries()).map(([date, count]) => ({ date, count }));
}

function buildPlatformRows(users) {
  const platformMap = new Map();

  users.forEach((user) => {
    const key = user.lastSeenPlatform || "unknown";
    const entry = platformMap.get(key) || {
      platform: key,
      profiles: 0,
      levelSum: 0,
      powerUsesSum: 0,
      toolsUnlockedSum: 0
    };

    entry.profiles += 1;
    entry.levelSum += user.level;
    entry.powerUsesSum += user.powerUses;
    entry.toolsUnlockedSum += user.toolsUnlockedCount;
    platformMap.set(key, entry);
  });

  return Array.from(platformMap.values())
    .map((entry) => ({
      platform: entry.platform,
      profiles: entry.profiles,
      avgLevel: entry.profiles ? entry.levelSum / entry.profiles : 0,
      avgPowerUses: entry.profiles ? entry.powerUsesSum / entry.profiles : 0,
      avgToolsUnlocked: entry.profiles ? entry.toolsUnlockedSum / entry.profiles : 0
    }))
    .sort((left, right) => right.profiles - left.profiles);
}

function buildLevelRows(users) {
  const bucketMap = new Map(levelBuckets.map((bucket) => [bucket, 0]));

  users.forEach((user) => {
    const bucket = bucketLevel(user.level);
    bucketMap.set(bucket, (bucketMap.get(bucket) || 0) + 1);
  });

  return levelBuckets.map((bucket) => ({
    label: bucket,
    count: bucketMap.get(bucket) || 0
  }));
}

function buildRecentUsers(activeUsers, allPlatformUsers) {
  const source = activeUsers.length ? activeUsers : allPlatformUsers;

  return [...source]
    .sort((left, right) => compareDates(right.updatedAt, left.updatedAt))
    .slice(0, 25);
}

function renderPlatformSummaryTable(rows) {
  if (!rows.length) {
    els.summaryTableBody.innerHTML = `<tr><td colspan="5" class="table-empty">No active profiles in this range yet.</td></tr>`;
    return;
  }

  els.summaryTableBody.innerHTML = rows
    .map((row) => `
      <tr>
        <td>${escapeHtml(platformLabel(row.platform))}</td>
        <td>${formatNumber(row.profiles)}</td>
        <td>${formatDecimal(row.avgLevel)}</td>
        <td>${formatDecimal(row.avgPowerUses)}</td>
        <td>${formatDecimal(row.avgToolsUnlocked)}</td>
      </tr>
    `)
    .join("");
}

function renderRecentUsersTable(users) {
  if (!users.length) {
    els.recentUsersTableBody.innerHTML = `<tr><td colspan="8" class="table-empty">No recent profiles found for this filter.</td></tr>`;
    return;
  }

  els.recentUsersTableBody.innerHTML = users
    .map((user) => `
      <tr>
        <td><code>${escapeHtml(truncateId(user.id))}</code></td>
        <td>${escapeHtml(platformLabel(user.lastSeenPlatform))}</td>
        <td>${formatNumber(user.level)}</td>
        <td>${formatNumber(user.hintCount)}</td>
        <td>${formatNumber(user.shuffleCount)}</td>
        <td>${formatNumber(user.undoCount)}</td>
        <td>${formatNumber(user.toolsUnlockedCount)}</td>
        <td>${formatDateTime(user.updatedAt)}</td>
      </tr>
    `)
    .join("");
}

function renderTrendChart(rows) {
  if (!window.Chart) {
    return;
  }

  upsertChart("trendChart", {
    type: "line",
    data: {
      labels: rows.map((row) => row.date),
      datasets: [
        {
          label: "Updated profiles",
          data: rows.map((row) => row.count),
          borderColor: "#dfc38f",
          backgroundColor: "rgba(223, 195, 143, 0.18)",
          borderWidth: 3,
          fill: true,
          tension: 0.34
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
          data: rows.map((row) => row.profiles),
          backgroundColor: ["#dfc38f", "#8db7e3", "#91d6b1", "#f1a598"],
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

function renderLevelChart(rows) {
  if (!window.Chart) {
    return;
  }

  upsertChart("levelChart", {
    type: "bar",
    data: {
      labels: rows.map((row) => row.label),
      datasets: [
        {
          label: "Profiles",
          data: rows.map((row) => row.count),
          backgroundColor: "rgba(141, 183, 227, 0.74)",
          borderRadius: 8,
          maxBarThickness: 40
        }
      ]
    },
    options: baseChartOptions()
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

function handlePresetChange() {
  setDateRangeFromPreset(Number(els.rangePreset.value));
  renderDashboard();
}

function handleManualRangeChange() {
  els.rangePreset.value = "";
  renderDashboard();
}

function setDateRangeFromPreset(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  els.rangeStart.value = toIsoDate(start);
  els.rangeEnd.value = toIsoDate(end);
}

function normalizeUser(id, payload) {
  return {
    id,
    level: readNumber(payload.level),
    hintCount: readNumber(payload.hintCount),
    shuffleCount: readNumber(payload.shuffleCount),
    undoCount: readNumber(payload.undoCount),
    toolsUnlockedCount: readNumber(payload.toolsUnlockedCount),
    schemaVersion: readNumber(payload.schemaVersion),
    lastSeenPlatform: normalizePlatform(payload.lastSeenPlatform),
    updatedAt: parseDate(payload.updatedAt),
    powerUses: readNumber(payload.hintCount) + readNumber(payload.shuffleCount) + readNumber(payload.undoCount)
  };
}

function normalizePlatform(value) {
  if (!value) {
    return "unknown";
  }

  const normalized = String(value).toLowerCase();
  if (normalized.includes("android")) {
    return "android";
  }
  if (normalized.includes("ios") || normalized.includes("iphone") || normalized.includes("ipad")) {
    return "ios";
  }
  return normalized;
}

function getRangeBounds() {
  const start = new Date(`${els.rangeStart.value}T00:00:00`);
  const end = new Date(`${els.rangeEnd.value}T23:59:59.999`);
  return { start, end };
}

function iterateDays(start, end) {
  const days = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

function average(values) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function bucketLevel(level) {
  if (level <= 4) {
    return "0-4";
  }
  if (level <= 9) {
    return "5-9";
  }
  if (level <= 19) {
    return "10-19";
  }
  if (level <= 49) {
    return "20-49";
  }
  return "50+";
}

function compareDates(left, right) {
  const leftTime = left instanceof Date && !Number.isNaN(left.getTime()) ? left.getTime() : 0;
  const rightTime = right instanceof Date && !Number.isNaN(right.getTime()) ? right.getTime() : 0;
  return leftTime - rightTime;
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

function setBadge(text, isLive = false) {
  els.sessionBadge.textContent = text;
  els.sessionBadge.classList.toggle("is-live", isLive);
}

function setAuthGate(stateName) {
  const states = {
    loading: {
      title: "Checking access",
      text: "Verifying your admin session."
    },
    setup: {
      title: "Setup required",
      text: "Firebase config is incomplete. Finish setup before this page can be used."
    }
  };

  if (stateName === "signed_in" || stateName === "hidden") {
    els.authGate.hidden = true;
    return;
  }

  const stateCopy = states[stateName] || states.loading;
  els.authGateTitle.textContent = stateCopy.title;
  els.authGateText.textContent = stateCopy.text;
  els.authGate.hidden = false;
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

function handleDashboardError(error) {
  const message =
    error.code === "permission-denied"
      ? "Firestore denied access to the users collection. Update Firestore rules to allow the admin account to read users."
      : error.message || "Unexpected Firebase error.";

  els.dataFreshness.textContent = message;
  setAuthFeedback(message, "error");
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(Math.round(value || 0));
}

function formatDecimal(value) {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1
  }).format(value || 0);
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
  if (value === "unknown") {
    return "Unknown";
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

function truncateId(value) {
  if (!value || value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function readNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
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

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
