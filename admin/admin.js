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

// ====== Constants ======
const LEVEL_BUCKETS = [
  { label: "0–4",   min: 0,  max: 4  },
  { label: "5–9",   min: 5,  max: 9  },
  { label: "10–19", min: 10, max: 19 },
  { label: "20–49", min: 20, max: 49 },
  { label: "50–99", min: 50, max: 99 },
  { label: "100+",  min: 100, max: Infinity }
];

const FUNNEL_STAGES = [
  { label: "Started",  minLevel: 1  },
  { label: "Tutorial", minLevel: 5  },
  { label: "Early",    minLevel: 10 },
  { label: "Mid",      minLevel: 20 },
  { label: "Late",     minLevel: 50 },
  { label: "Expert",   minLevel: 100 }
];

const RECENCY_BUCKETS = [
  { label: "Today",     maxDays: 1   },
  { label: "2–7 days",  maxDays: 7   },
  { label: "8–14 days", maxDays: 14  },
  { label: "15–30 days", maxDays: 30 },
  { label: "31–90 days", maxDays: 90 },
  { label: "90+ days",  maxDays: Infinity }
];

const PALETTE = {
  text: "#f4ecdc",
  muted: "#8a99ad",
  gold: "#e7c98a",
  goldSoft: "#f7e6c4",
  blue: "#7db0e6",
  blueSoft: "#b5d0ec",
  green: "#8ed6af",
  greenSoft: "#c4ebd5",
  violet: "#b49cff",
  violetSoft: "#d7c9ff",
  rose: "#f29fb4",
  roseSoft: "#fac9d3",
  teal: "#7fd6d4",
  grid: "rgba(255, 255, 255, 0.05)",
  gridStrong: "rgba(255, 255, 255, 0.1)"
};

// ====== State ======
const state = {
  auth: null,
  db: null,
  user: null,
  users: [],
  games: [],
  metrics: [],
  loadErrors: {
    users: null,
    games: null,
    metrics: null
  },
  charts: {},
  activeTab: "overview",
  trendMode: "users",
  topMode: "engagement"
};

const els = {};

// ====== Bootstrap ======
cacheEls();
wireEvents();
initializeDefaults();
setAuthGate("loading");

if (hasPlaceholderConfig()) {
  renderSetupState();
} else {
  initializeFirebase();
}

function cacheEls() {
  const ids = [
    "authGate", "authGateTitle", "authGateText",
    "authScreen", "configBanner", "sessionBadge", "sessionBadgeLabel",
    "logoutButton", "loginPanel", "appPanel", "loginForm",
    "loginButton", "loginEmail", "loginPassword", "authFeedback",
    "rangePreset", "rangeStart", "rangeEnd", "platformFilter", "segmentFilter", "countryFilter",
    "refreshButton", "dataFreshness", "dashboardNotice",
    // Overview KPIs
    "kpiTotalProfiles", "kpiTotalProfilesDelta",
    "kpiActiveProfiles", "kpiActiveProfilesDelta",
    "kpiAvgLevel", "kpiAvgLevelDelta",
    "kpiEngagement", "kpiEngagementDelta",
    "kpiRevenue", "kpiRevenueDelta",
    "summaryTableBody", "pulseList", "platformLegend", "topCountriesBody", "countryEmptyNote",
    // Users
    "retentionBody", "retentionNote",
    "segWhales", "segWhalesBar",
    "segPro", "segProBar",
    "segCasual", "segCasualBar",
    "segBeginner", "segBeginnerBar",
    "segChurn", "segChurnBar",
    "topPlayersTableBody",
    // Levels
    "kpiLvlAvg", "kpiLvlMedian", "kpiLvlP75", "kpiLvlMax",
    "progressionFunnel", "levelCohortBody",
    // Marketing
    "countryMarketingBody",
    "mkRevenue", "mkRevenueDelta",
    "mkSpend", "mkSpendDelta",
    "mkRoas", "mkRoasDelta",
    "mkDownloads", "mkDownloadsDelta",
    "mkCpi", "mkArpdau",
    "marketingPlatformBody", "gamesTableBody"
  ];
  ids.forEach((id) => { els[id] = document.getElementById(id); });
}

function wireEvents() {
  els.loginForm.addEventListener("submit", handleLoginSubmit);
  els.logoutButton.addEventListener("click", handleLogout);
  els.rangePreset.addEventListener("change", handlePresetChange);
  els.rangeStart.addEventListener("change", handleManualRangeChange);
  els.rangeEnd.addEventListener("change", handleManualRangeChange);
  els.platformFilter.addEventListener("change", renderDashboard);
  els.segmentFilter.addEventListener("change", renderDashboard);
  if (els.countryFilter) els.countryFilter.addEventListener("change", renderDashboard);
  els.refreshButton.addEventListener("click", () => {
    refreshAll().catch(handleDashboardError);
  });

  // Tab nav
  document.querySelectorAll(".tab-nav-item").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Chip groups
  document.querySelectorAll("#trendChips .chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      setActiveChip("#trendChips", btn);
      state.trendMode = btn.dataset.trend;
      renderTrendChart();
    });
  });
  document.querySelectorAll("#topPlayersChips .chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      setActiveChip("#topPlayersChips", btn);
      state.topMode = btn.dataset.top;
      renderTopPlayersTable();
    });
  });
}

function setActiveChip(scopeSelector, activeBtn) {
  document.querySelectorAll(`${scopeSelector} .chip`).forEach((b) => b.classList.remove("is-active"));
  activeBtn.classList.add("is-active");
}

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll(".tab-nav-item").forEach((btn) => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.querySelectorAll(".tab-pane").forEach((pane) => {
    const active = pane.dataset.pane === tab;
    pane.classList.toggle("is-active", active);
    pane.hidden = !active;
  });
  // Chart.js needs to resize after pane becomes visible
  setTimeout(() => {
    Object.values(state.charts).forEach((chart) => chart && chart.resize && chart.resize());
  }, 40);
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
      setAuthFeedback(`This account is not allowed. Sign in with ${config.adminEmail}.`, "error");
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
    await signInWithEmailAndPassword(state.auth, els.loginEmail.value.trim(), els.loginPassword.value);
    els.loginPassword.value = "";
  } catch (error) {
    setAuthFeedback(normalizeAuthError(error), "error");
  } finally {
    els.loginButton.disabled = false;
  }
}

async function handleLogout() {
  if (!state.auth) return;
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

// ====== Data loading ======
async function refreshAll() {
  if (!state.db) return;
  els.refreshButton.classList.add("is-loading");
  try {
    await Promise.all([loadUsers(), loadGames(), loadMetrics()]);
    populateCountryOptions();
    renderDashboard();
    els.dataFreshness.textContent = `Last synced ${formatDateTime(new Date())}`;
  } finally {
    els.refreshButton.classList.remove("is-loading");
  }
}

function populateCountryOptions() {
  if (!els.countryFilter) return;
  const previous = els.countryFilter.value || "all";
  const counts = new Map();
  state.users.forEach((u) => {
    const k = u.country || "unknown";
    counts.set(k, (counts.get(k) || 0) + 1);
  });
  const entries = Array.from(counts.entries())
    .filter(([code]) => code && code !== "unknown")
    .sort((a, b) => b[1] - a[1]);
  const unknownCount = counts.get("unknown") || 0;
  const options = [
    `<option value="all">All countries</option>`,
    ...entries.map(([code, count]) =>
      `<option value="${escapeHtml(code)}">${countryFlag(code)} ${escapeHtml(countryLabel(code))} · ${formatNumber(count)}</option>`
    )
  ];
  if (unknownCount > 0) {
    options.push(`<option value="unknown">🌍 Unknown · ${formatNumber(unknownCount)}</option>`);
  }
  els.countryFilter.innerHTML = options.join("");
  els.countryFilter.value = Array.from(counts.keys()).concat(["all"]).includes(previous) ? previous : "all";
}

function renderDashboardNotice() {
  if (!els.dashboardNotice) return;

  const notes = [];
  if (state.loadErrors.users) notes.push(state.loadErrors.users);
  if (state.loadErrors.games) notes.push(state.loadErrors.games);
  if (state.loadErrors.metrics) notes.push(state.loadErrors.metrics);

  const country = els.countryFilter ? els.countryFilter.value : "all";
  if (!state.loadErrors.metrics && country !== "all") {
    const coverage = getMetricCountryCoverage(getRangeBounds());
    if (coverage.total > 0) {
      if (coverage.known === 0) {
        notes.push("Country-scoped marketing is unavailable because no studioDailyMetrics rows in this window carry a country field yet.");
      } else if (coverage.known < coverage.total) {
        notes.push(`Country-scoped marketing is partial: ${formatNumber(coverage.known)} of ${formatNumber(coverage.total)} daily metric rows in this window include country.`);
      }
    }
  }

  if (!notes.length) {
    els.dashboardNotice.hidden = true;
    els.dashboardNotice.textContent = "";
    els.dashboardNotice.classList.remove("is-error");
    return;
  }

  els.dashboardNotice.hidden = false;
  els.dashboardNotice.textContent = notes.join(" ");
  els.dashboardNotice.classList.toggle("is-error", Boolean(state.loadErrors.users || state.loadErrors.games || state.loadErrors.metrics));
}

async function loadUsers() {
  const usersCollection = config.collections.users || "users";
  state.loadErrors.users = null;
  try {
    const snapshot = await getDocs(collection(state.db, usersCollection));
    state.users = snapshot.docs
      .map((snapshotDoc) => normalizeUser(snapshotDoc.id, snapshotDoc.data()))
      .sort((l, r) => compareDates(r.updatedAt, l.updatedAt));
  } catch (error) {
    state.users = [];
    state.loadErrors.users = formatCollectionLoadError(
      usersCollection,
      error,
      "Player analytics are unavailable until this collection becomes readable."
    );
    throw error;
  }
}

async function loadGames() {
  state.loadErrors.games = null;
  try {
    const name = config.collections.games || "studioGames";
    const snap = await getDocs(collection(state.db, name));
    state.games = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    state.games = [];
    state.loadErrors.games = formatCollectionLoadError(
      config.collections.games || "studioGames",
      error,
      "Game mix cards and tables may look empty until access is fixed."
    );
  }
}

async function loadMetrics() {
  state.loadErrors.metrics = null;
  try {
    const name = config.collections.dailyMetrics || "studioDailyMetrics";
    const snap = await getDocs(collection(state.db, name));
    state.metrics = snap.docs.map((d) => normalizeMetric(d.id, d.data()));
  } catch (error) {
    state.metrics = [];
    state.loadErrors.metrics = formatCollectionLoadError(
      config.collections.dailyMetrics || "studioDailyMetrics",
      error,
      "Marketing KPIs are unavailable until this collection becomes readable."
    );
  }
}

// ====== Normalization ======
function normalizeUser(id, payload = {}) {
  const level = readNumber(payload.level);
  const hintCount = readNumber(payload.hintCount);
  const shuffleCount = readNumber(payload.shuffleCount);
  const undoCount = readNumber(payload.undoCount);
  const toolsUnlockedCount = readNumber(payload.toolsUnlockedCount);
  const powerUses = hintCount + shuffleCount + undoCount;
  const rawCountry =
    payload.country ||
    payload.lastSeenCountry ||
    payload.countryCode ||
    (payload.geo && (payload.geo.country || payload.geo.countryCode));
  return {
    id,
    level,
    hintCount,
    shuffleCount,
    undoCount,
    toolsUnlockedCount,
    schemaVersion: readNumber(payload.schemaVersion),
    lastSeenPlatform: normalizePlatform(payload.lastSeenPlatform),
    country: normalizeCountry(rawCountry),
    updatedAt: parseDate(payload.updatedAt),
    createdAt: parseDate(payload.createdAt) || parseDate(payload.firstSeenAt) || parseDate(payload.installDate),
    powerUses,
    engagementScore: computeEngagement(level, powerUses, toolsUnlockedCount),
    segment: computeSegment(level, powerUses)
  };
}

function normalizeMetric(id, payload = {}) {
  return {
    id,
    gameId: payload.gameId || "",
    gameName: payload.gameName || "",
    gameSlug: payload.gameSlug || "",
    platform: normalizePlatform(payload.platform),
    country: normalizeCountry(payload.country || payload.countryCode),
    date: parseDate(payload.date),
    downloads: readNumber(payload.downloads),
    revenue: readNumber(payload.revenue),
    adRevenue: readNumber(payload.adRevenue),
    iapRevenue: readNumber(payload.iapRevenue),
    adSpend: readNumber(payload.adSpend),
    dau: readNumber(payload.dau),
    mau: readNumber(payload.mau),
    sessions: readNumber(payload.sessions),
    rating: readNumber(payload.rating),
    crashFreeUsers: readNumber(payload.crashFreeUsers)
  };
}

function computeEngagement(level, powerUses, toolsUnlocked) {
  // Weighted score: level dominant, power uses and tools as proxies for depth
  return Math.round((level * 2.5) + (powerUses * 0.6) + (toolsUnlocked * 4));
}

function computeSegment(level, powerUses) {
  if (level >= 50 && powerUses >= 20) return "whale";
  if (level >= 20) return "pro";
  if (level >= 5) return "casual";
  return "beginner";
}

function normalizePlatform(value) {
  if (!value) return "unknown";
  const s = String(value).toLowerCase();
  if (s.includes("android")) return "android";
  if (s.includes("ios") || s.includes("iphone") || s.includes("ipad")) return "ios";
  return s;
}

function normalizeCountry(value) {
  if (!value) return "unknown";
  const s = String(value).trim().toUpperCase();
  if (s.length === 2 && /^[A-Z]{2}$/.test(s)) return s;
  if (s.length === 3 && /^[A-Z]{3}$/.test(s)) {
    const map = { USA: "US", GBR: "GB", TUR: "TR", DEU: "DE", FRA: "FR", ESP: "ES", ITA: "IT", RUS: "RU", JPN: "JP", KOR: "KR", CHN: "CN", IND: "IN", BRA: "BR", MEX: "MX", CAN: "CA", AUS: "AU", NLD: "NL" };
    return map[s] || s.slice(0, 2);
  }
  return "unknown";
}

function countryFlag(code) {
  if (!code || code === "unknown" || code.length !== 2) return "🌍";
  const base = 127397;
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => base + c.charCodeAt(0)));
}

const COUNTRY_NAMES = {
  US: "United States", GB: "United Kingdom", TR: "Türkiye", DE: "Germany",
  FR: "France", ES: "Spain", IT: "Italy", NL: "Netherlands", PL: "Poland",
  RU: "Russia", JP: "Japan", KR: "Korea", CN: "China", IN: "India",
  BR: "Brazil", MX: "Mexico", CA: "Canada", AU: "Australia", SE: "Sweden",
  NO: "Norway", DK: "Denmark", FI: "Finland", CH: "Switzerland", AT: "Austria",
  BE: "Belgium", IE: "Ireland", PT: "Portugal", GR: "Greece", CZ: "Czechia",
  RO: "Romania", HU: "Hungary", UA: "Ukraine", IL: "Israel", SA: "Saudi Arabia",
  AE: "UAE", EG: "Egypt", ZA: "South Africa", AR: "Argentina", CL: "Chile",
  CO: "Colombia", ID: "Indonesia", TH: "Thailand", VN: "Vietnam", PH: "Philippines",
  MY: "Malaysia", SG: "Singapore", NZ: "New Zealand"
};

function countryLabel(code) {
  if (!code || code === "unknown") return "Unknown";
  return COUNTRY_NAMES[code] || code;
}

// ====== Range helpers ======
function getRangeBounds() {
  const start = new Date(`${els.rangeStart.value}T00:00:00`);
  const end = new Date(`${els.rangeEnd.value}T23:59:59.999`);
  return { start, end };
}

function getPreviousRangeBounds() {
  const { start, end } = getRangeBounds();
  const ms = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - ms);
  return { start: prevStart, end: prevEnd };
}

function isDateInRange(d, bounds) {
  if (!d || Number.isNaN(d.getTime())) return false;
  return d >= bounds.start && d <= bounds.end;
}

// ====== Filtering ======
function getUsersForPlatform() {
  const p = els.platformFilter.value;
  const c = els.countryFilter ? els.countryFilter.value : "all";
  return state.users.filter((u) => {
    if (p !== "all" && u.lastSeenPlatform !== p) return false;
    if (c !== "all" && u.country !== c) return false;
    return true;
  });
}

function applySegmentFilter(users) {
  const seg = els.segmentFilter.value;
  if (seg === "all") return users;
  const now = Date.now();
  if (seg === "active7") {
    return users.filter((u) => u.updatedAt && (now - u.updatedAt.getTime()) <= 7 * 864e5);
  }
  if (seg === "churnrisk") {
    return users.filter((u) => !u.updatedAt || (now - u.updatedAt.getTime()) > 14 * 864e5);
  }
  return users.filter((u) => u.segment === seg);
}

function getActiveUsers() {
  const scoped = applySegmentFilter(getUsersForPlatform());
  const bounds = getRangeBounds();
  return scoped.filter((u) => isDateInRange(u.updatedAt, bounds));
}

function getPreviousActiveUsers() {
  const scoped = applySegmentFilter(getUsersForPlatform());
  const bounds = getPreviousRangeBounds();
  return scoped.filter((u) => isDateInRange(u.updatedAt, bounds));
}

function getMetricsInRange(bounds) {
  const p = els.platformFilter.value;
  const c = els.countryFilter ? els.countryFilter.value : "all";
  return state.metrics.filter((m) => {
    if (!isDateInRange(m.date, bounds)) return false;
    if (p !== "all" && m.platform !== p) return false;
    if (c !== "all" && m.country !== c) return false;
    return true;
  });
}

function getMetricCountryCoverage(bounds) {
  const p = els.platformFilter.value;
  const relevant = state.metrics.filter((m) => {
    if (!isDateInRange(m.date, bounds)) return false;
    if (p !== "all" && m.platform !== p) return false;
    return true;
  });
  return {
    total: relevant.length,
    known: relevant.filter((m) => m.country && m.country !== "unknown").length
  };
}

// ====== Render ======
function renderDashboard() {
  const active = getActiveUsers();
  const prevActive = getPreviousActiveUsers();
  const scoped = applySegmentFilter(getUsersForPlatform());

  renderOverview(active, prevActive, scoped);
  renderUsersTab(active, scoped);
  renderLevelsTab(active);
  renderMarketingTab();
  renderDashboardNotice();
}

// ---- Overview ----
function renderOverview(active, prevActive, scoped) {
  const revBounds = getRangeBounds();
  const prevRevBounds = getPreviousRangeBounds();
  const metricsCurrent = getMetricsInRange(revBounds);
  const metricsPrev = getMetricsInRange(prevRevBounds);

  const total = scoped.length;
  const activeCount = active.length;
  const avgLevel = average(active.map((u) => u.level));
  const avgEng = average(active.map((u) => u.engagementScore));
  const revenue = sum(metricsCurrent.map((m) => m.revenue || (m.adRevenue + m.iapRevenue)));

  const prevTotal = state.users.length; // total profiles doesn't vary by window
  const prevActiveCount = prevActive.length;
  const prevAvgLevel = average(prevActive.map((u) => u.level));
  const prevAvgEng = average(prevActive.map((u) => u.engagementScore));
  const prevRevenue = sum(metricsPrev.map((m) => m.revenue || (m.adRevenue + m.iapRevenue)));

  setKpi(els.kpiTotalProfiles, els.kpiTotalProfilesDelta, total, prevTotal, "count");
  setKpi(els.kpiActiveProfiles, els.kpiActiveProfilesDelta, activeCount, prevActiveCount, "count");
  setKpi(els.kpiAvgLevel, els.kpiAvgLevelDelta, avgLevel, prevAvgLevel, "decimal");
  setKpi(els.kpiEngagement, els.kpiEngagementDelta, avgEng, prevAvgEng, "count");
  setKpi(els.kpiRevenue, els.kpiRevenueDelta, revenue, prevRevenue, "currency");

  const platformRows = buildPlatformRows(active);
  renderPlatformSummaryTable(platformRows);
  renderPlatformChart(platformRows);
  renderTrendChart();
  renderPulseList(active, scoped, metricsCurrent, metricsPrev);
  renderTopCountriesTable(active);
}

function renderTopCountriesTable(users) {
  if (!els.topCountriesBody) return;
  const rows = buildCountryRows(users);
  const total = users.length || 1;
  const hasKnown = rows.some((r) => r.country !== "unknown");

  if (!rows.length) {
    els.topCountriesBody.innerHTML = `<tr><td colspan="4" class="table-empty">No active users in this range.</td></tr>`;
    if (els.countryEmptyNote) els.countryEmptyNote.hidden = true;
    return;
  }
  if (!hasKnown && els.countryEmptyNote) {
    els.countryEmptyNote.hidden = false;
  } else if (els.countryEmptyNote) {
    els.countryEmptyNote.hidden = true;
  }

  const top = rows.slice(0, 8);
  els.topCountriesBody.innerHTML = top.map((r) => `
    <tr>
      <td><span class="country-cell">${countryFlag(r.country)} <strong>${escapeHtml(countryLabel(r.country))}</strong></span></td>
      <td class="num">${formatNumber(r.profiles)}</td>
      <td class="num">${((r.profiles / total) * 100).toFixed(1)}%</td>
      <td class="num">${formatDecimal(r.avgLevel)}</td>
    </tr>
  `).join("");
}

function setKpi(valueEl, deltaEl, curr, prev, kind) {
  if (valueEl) valueEl.textContent = formatValue(curr, kind);
  setDelta(deltaEl, curr, prev);
}

function setDelta(deltaEl, curr, prev) {
  if (!deltaEl) return;
  if (!prev || prev === 0) {
    if (curr > 0) {
      deltaEl.textContent = "new";
      deltaEl.className = "kpi-delta is-up";
    } else {
      deltaEl.textContent = "—";
      deltaEl.className = "kpi-delta";
    }
    return;
  }
  const pct = ((curr - prev) / prev) * 100;
  const abs = Math.abs(pct);
  const arrow = pct > 0 ? "▲" : pct < 0 ? "▼" : "•";
  deltaEl.textContent = `${arrow} ${abs.toFixed(abs >= 10 ? 0 : 1)}%`;
  deltaEl.classList.remove("is-up", "is-down");
  deltaEl.className = "kpi-delta " + (pct > 0.5 ? "is-up" : pct < -0.5 ? "is-down" : "");
}

function formatValue(v, kind) {
  if (kind === "currency") return formatCurrency(v);
  if (kind === "decimal") return formatDecimal(v);
  return formatNumber(v);
}

function renderPulseList(active, scoped, metricsCurrent, metricsPrev) {
  if (!els.pulseList) return;
  const now = Date.now();
  const churnCount = scoped.filter((u) => !u.updatedAt || (now - u.updatedAt.getTime()) > 14 * 864e5).length;
  const activeRate = scoped.length ? (active.length / scoped.length) * 100 : 0;
  const whales = scoped.filter((u) => u.segment === "whale").length;
  const revenue = sum(metricsCurrent.map((m) => m.revenue || (m.adRevenue + m.iapRevenue)));
  const spend = sum(metricsCurrent.map((m) => m.adSpend));
  const roas = spend > 0 ? revenue / spend : 0;
  const avgDau = average(metricsCurrent.map((m) => m.dau));
  const avgMau = average(metricsCurrent.map((m) => m.mau));
  const stickiness = avgMau > 0 ? (avgDau / avgMau) * 100 : 0;

  const items = [
    {
      icon: "📈",
      title: "Active rate",
      detail: `${formatNumber(active.length)} of ${formatNumber(scoped.length)} profiles active in window`,
      value: `${activeRate.toFixed(1)}%`,
      tone: activeRate >= 25 ? "is-positive" : activeRate >= 10 ? "is-warning" : "is-danger"
    },
    {
      icon: "👑",
      title: "Whale share",
      detail: "Premium-segment players (L50+, heavy)",
      value: `${formatNumber(whales)}`,
      tone: whales > 0 ? "is-positive" : "is-warning"
    },
    {
      icon: "⏳",
      title: "Churn risk",
      detail: "Profiles idle for 14+ days",
      value: `${formatNumber(churnCount)}`,
      tone: churnCount === 0 ? "is-positive" : churnCount > scoped.length * 0.4 ? "is-danger" : "is-warning"
    }
  ];

  if (state.metrics.length) {
    items.push({
      icon: "💎",
      title: "ROAS",
      detail: "Revenue divided by ad spend in window",
      value: roas > 0 ? `${roas.toFixed(2)}×` : "—",
      tone: roas >= 1.5 ? "is-positive" : roas >= 1 ? "is-warning" : "is-danger"
    });
    items.push({
      icon: "🔥",
      title: "Stickiness",
      detail: "DAU ÷ MAU over window",
      value: stickiness > 0 ? `${stickiness.toFixed(1)}%` : "—",
      tone: stickiness >= 20 ? "is-positive" : stickiness >= 10 ? "is-warning" : "is-danger"
    });
  }

  els.pulseList.innerHTML = items.map((i) => `
    <li class="pulse-item ${i.tone}">
      <span class="pulse-dot">${i.icon}</span>
      <div>
        <div class="pulse-title">${escapeHtml(i.title)}</div>
        <div class="pulse-detail">${escapeHtml(i.detail)}</div>
      </div>
      <span class="pulse-value">${escapeHtml(i.value)}</span>
    </li>
  `).join("");
}

// ---- Users tab ----
function renderUsersTab(active, scoped) {
  const segs = {
    whale: 0, pro: 0, casual: 0, beginner: 0, churn: 0
  };
  const now = Date.now();
  scoped.forEach((u) => {
    segs[u.segment]++;
    if (!u.updatedAt || (now - u.updatedAt.getTime()) > 14 * 864e5) segs.churn++;
  });
  const total = scoped.length || 1;
  const setSeg = (valueEl, barEl, count) => {
    if (valueEl) valueEl.textContent = formatNumber(count);
    if (barEl) barEl.style.width = `${Math.min(100, (count / total) * 100)}%`;
  };
  setSeg(els.segWhales, els.segWhalesBar, segs.whale);
  setSeg(els.segPro, els.segProBar, segs.pro);
  setSeg(els.segCasual, els.segCasualBar, segs.casual);
  setSeg(els.segBeginner, els.segBeginnerBar, segs.beginner);
  setSeg(els.segChurn, els.segChurnBar, segs.churn);

  renderPowerChart(active);
  renderToolsChart(active);
  renderRecencyChart(scoped);
  renderRetentionMatrix(scoped);
  renderTopPlayersTable();
}

function renderRetentionMatrix(users) {
  if (!els.retentionBody) return;
  const matrix = buildCohortMatrix(users, 8);
  const haveCreatedAtRatio = matrix.totalUsers > 0 ? matrix.withCreatedAt / matrix.totalUsers : 0;

  if (els.retentionNote) {
    if (matrix.withCreatedAt === 0) {
      els.retentionNote.textContent = "No createdAt / firstSeenAt values found on user documents. Write one of those fields on first session to enable cohort retention.";
      els.retentionNote.hidden = false;
    } else {
      const notes = [
        "Uses install date and the latest updatedAt timestamp only. Cells show the share of each cohort seen on or after D1 / D7 / D14 / D30, not exact same-day retention."
      ];
      if (haveCreatedAtRatio < 0.6) {
        notes.push(`Only ${Math.round(haveCreatedAtRatio * 100)}% of profiles carry an install date, so these cohorts are based on that subset.`);
      }
      els.retentionNote.textContent = notes.join(" ");
      els.retentionNote.hidden = false;
    }
  }

  const nonEmpty = matrix.rows.filter((r) => r.size > 0);
  if (!nonEmpty.length) {
    els.retentionBody.innerHTML = `<tr><td colspan="6" class="table-empty">No install cohorts found for the last 8 weeks.</td></tr>`;
    return;
  }

  els.retentionBody.innerHTML = matrix.rows.map((r) => {
    if (!r.size) {
      return `<tr class="retention-empty"><td>${escapeHtml(r.label)}</td><td class="num">0</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td></tr>`;
    }
    return `
      <tr>
        <td>${escapeHtml(r.label)}</td>
        <td class="num">${formatNumber(r.size)}</td>
        <td class="num">${retentionCell(r.d1)}</td>
        <td class="num">${retentionCell(r.d7)}</td>
        <td class="num">${retentionCell(r.d14)}</td>
        <td class="num">${retentionCell(r.d30)}</td>
      </tr>
    `;
  }).join("");
}

function retentionCell(metric) {
  if (!metric || metric.ratio == null) return "—";
  const ratio = metric.ratio;
  const pct = (ratio * 100);
  const label = `${pct.toFixed(pct >= 10 ? 0 : 1)}%`;
  const alpha = Math.min(0.62, 0.08 + ratio * 0.6).toFixed(3);
  const style = `background: rgba(142, 214, 175, ${alpha});`;
  const title = `${formatNumber(metric.retained)} of ${formatNumber(metric.eligible)} eligible profiles were seen on or after D${metric.days}.`;
  return `<span class="retention-chip" style="${style}" title="${escapeHtml(title)}">${label}</span>`;
}

function renderTopPlayersTable() {
  const users = getActiveUsers();
  const sorted = [...users].sort((a, b) => {
    if (state.topMode === "level") return b.level - a.level;
    if (state.topMode === "powers") return b.powerUses - a.powerUses;
    return b.engagementScore - a.engagementScore;
  }).slice(0, 30);

  if (!sorted.length) {
    els.topPlayersTableBody.innerHTML = `<tr><td colspan="11" class="table-empty">No players match this filter.</td></tr>`;
    return;
  }

  els.topPlayersTableBody.innerHTML = sorted.map((u) => `
    <tr>
      <td><code>${escapeHtml(truncateId(u.id))}</code></td>
      <td><span class="segment-pill ${u.segment}">${segmentLabel(u.segment)}</span></td>
      <td><span class="platform-pill ${u.lastSeenPlatform}">${platformLabel(u.lastSeenPlatform)}</span></td>
      <td><span class="country-cell" title="${escapeHtml(countryLabel(u.country))}">${countryFlag(u.country)} <strong>${escapeHtml(countryLabel(u.country))}</strong></span></td>
      <td class="num">${formatNumber(u.level)}</td>
      <td class="num">${formatNumber(u.hintCount)}</td>
      <td class="num">${formatNumber(u.shuffleCount)}</td>
      <td class="num">${formatNumber(u.undoCount)}</td>
      <td class="num">${formatNumber(u.toolsUnlockedCount)}</td>
      <td class="num">${formatNumber(u.engagementScore)}</td>
      <td>${formatDateTime(u.updatedAt)}</td>
    </tr>
  `).join("");
}

// ---- Levels tab ----
function renderLevelsTab(active) {
  const levels = active.map((u) => u.level).sort((a, b) => a - b);

  els.kpiLvlAvg.textContent = formatDecimal(average(levels));
  els.kpiLvlMedian.textContent = formatNumber(percentile(levels, 50));
  els.kpiLvlP75.textContent = formatNumber(percentile(levels, 75));
  els.kpiLvlMax.textContent = formatNumber(levels.length ? levels[levels.length - 1] : 0);

  const levelRows = buildLevelRows(active);
  renderLevelChart(levelRows);
  renderProgressionFunnel(active);
  renderPowerPerLevelChart(levelRows, active);
  renderLevelCohortTable(levelRows, active);
}

function buildLevelRows(users) {
  return LEVEL_BUCKETS.map((bucket) => {
    const members = users.filter((u) => u.level >= bucket.min && u.level <= bucket.max);
    return {
      label: bucket.label,
      count: members.length,
      avgPowers: average(members.map((u) => u.powerUses)),
      avgTools: average(members.map((u) => u.toolsUnlockedCount))
    };
  });
}

function renderProgressionFunnel(active) {
  const totalStarted = active.filter((u) => u.level >= 1).length || active.length || 1;
  const html = FUNNEL_STAGES.map((stage) => {
    const count = active.filter((u) => u.level >= stage.minLevel).length;
    const pct = totalStarted > 0 ? Math.min(100, (count / totalStarted) * 100) : 0;
    return `
      <div class="funnel-row">
        <span class="funnel-label">${escapeHtml(stage.label)}</span>
        <span class="funnel-bar"><span class="funnel-bar-fill" style="width:${pct}%"></span></span>
        <span class="funnel-count">${formatNumber(count)}</span>
      </div>
    `;
  }).join("");
  els.progressionFunnel.innerHTML = html;
}

function renderLevelCohortTable(levelRows, active) {
  const total = active.length || 1;
  if (!levelRows.some((r) => r.count > 0)) {
    els.levelCohortBody.innerHTML = `<tr><td colspan="5" class="table-empty">No active players in this window.</td></tr>`;
    return;
  }
  els.levelCohortBody.innerHTML = levelRows.map((row) => `
    <tr>
      <td>${escapeHtml(row.label)}</td>
      <td class="num">${formatNumber(row.count)}</td>
      <td class="num">${((row.count / total) * 100).toFixed(1)}%</td>
      <td class="num">${formatDecimal(row.avgPowers)}</td>
      <td class="num">${formatDecimal(row.avgTools)}</td>
    </tr>
  `).join("");
}

// ---- Marketing tab ----
function renderMarketingTab() {
  const bounds = getRangeBounds();
  const prevBounds = getPreviousRangeBounds();
  const current = getMetricsInRange(bounds);
  const previous = getMetricsInRange(prevBounds);

  const revenue = sum(current.map((m) => m.revenue || (m.adRevenue + m.iapRevenue)));
  const spend = sum(current.map((m) => m.adSpend));
  const downloads = sum(current.map((m) => m.downloads));
  const prevRev = sum(previous.map((m) => m.revenue || (m.adRevenue + m.iapRevenue)));
  const prevSpend = sum(previous.map((m) => m.adSpend));
  const prevDl = sum(previous.map((m) => m.downloads));
  const roas = spend > 0 ? revenue / spend : 0;
  const prevRoas = prevSpend > 0 ? prevRev / prevSpend : 0;
  const cpi = downloads > 0 ? spend / downloads : 0;
  const avgDau = average(current.map((m) => m.dau));
  const arpdau = avgDau > 0 ? revenue / (avgDau * Math.max(1, daysInRange(bounds))) : 0;

  setKpi(els.mkRevenue, els.mkRevenueDelta, revenue, prevRev, "currency");
  setKpi(els.mkSpend, els.mkSpendDelta, spend, prevSpend, "currency");
  setKpi(els.mkDownloads, els.mkDownloadsDelta, downloads, prevDl, "count");
  els.mkRoas.textContent = spend > 0 ? `${roas.toFixed(2)}×` : "—";
  setDelta(els.mkRoasDelta, roas, prevRoas);
  els.mkCpi.textContent = formatCurrency(cpi);
  els.mkArpdau.textContent = formatCurrency(arpdau);

  renderRevenueStackChart(current, bounds);
  renderSpendRevenueChart(current, bounds);
  renderStickinessChart(current, bounds);
  renderMarketingPlatformTable(current);
  renderCountryMarketingTable(current);
  renderGamesTable(current);
}

function renderCountryMarketingTable(metrics) {
  if (!els.countryMarketingBody) return;
  const selectedCountry = els.countryFilter ? els.countryFilter.value : "all";
  const coverage = getMetricCountryCoverage(getRangeBounds());
  const hasCountry = metrics.some((m) => m.country && m.country !== "unknown");
  if (selectedCountry !== "all" && coverage.total > 0 && coverage.known === 0) {
    els.countryMarketingBody.innerHTML = `<tr><td colspan="5" class="table-empty">Country filter is active, but no daily metric rows in this window carry <code>country</code> yet.</td></tr>`;
    return;
  }
  if (!hasCountry) {
    els.countryMarketingBody.innerHTML = `<tr><td colspan="5" class="table-empty">No country field on daily metrics yet. Add <code>country</code> to studioDailyMetrics docs to unlock per-country revenue/ROAS.</td></tr>`;
    return;
  }

  const rows = buildCountryMarketingRows(metrics).slice(0, 10);
  if (!rows.length) {
    els.countryMarketingBody.innerHTML = `<tr><td colspan="5" class="table-empty">${
      selectedCountry !== "all"
        ? `No country-scoped marketing data matched ${escapeHtml(countryLabel(selectedCountry))} in this window.`
        : "No marketing data in this window."
    }</td></tr>`;
    return;
  }

  els.countryMarketingBody.innerHTML = rows.map((r) => `
    <tr>
      <td><span class="country-cell">${countryFlag(r.country)} <strong>${escapeHtml(countryLabel(r.country))}</strong></span></td>
      <td class="num">${formatCurrency(r.revenue)}</td>
      <td class="num">${formatCurrency(r.spend)}</td>
      <td class="num">${r.spend > 0 ? r.roas.toFixed(2) + "×" : "—"}</td>
      <td class="num">${formatNumber(r.downloads)}</td>
    </tr>
  `).join("");
}

function renderMarketingPlatformTable(metrics) {
  const map = new Map();
  metrics.forEach((m) => {
    const key = m.platform || "unknown";
    const entry = map.get(key) || { platform: key, revenue: 0, spend: 0, downloads: 0 };
    entry.revenue += m.revenue || (m.adRevenue + m.iapRevenue);
    entry.spend += m.adSpend;
    entry.downloads += m.downloads;
    map.set(key, entry);
  });
  const rows = Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  if (!rows.length) {
    els.marketingPlatformBody.innerHTML = `<tr><td colspan="5" class="table-empty">No marketing data for this window.</td></tr>`;
    return;
  }
  els.marketingPlatformBody.innerHTML = rows.map((r) => `
    <tr>
      <td><span class="platform-pill ${r.platform}">${platformLabel(r.platform)}</span></td>
      <td class="num">${formatCurrency(r.revenue)}</td>
      <td class="num">${formatCurrency(r.spend)}</td>
      <td class="num">${r.spend > 0 ? (r.revenue / r.spend).toFixed(2) + "×" : "—"}</td>
      <td class="num">${formatNumber(r.downloads)}</td>
    </tr>
  `).join("");
}

function renderGamesTable(metrics) {
  const byGame = new Map();
  metrics.forEach((m) => {
    const key = m.gameId || m.gameName || "unknown";
    const entry = byGame.get(key) || {
      gameName: m.gameName || key,
      platforms: new Set(),
      downloads: 0, revenue: 0, adSpend: 0, dauSum: 0, dauDays: 0, ratingSum: 0, ratingDays: 0
    };
    entry.platforms.add(m.platform);
    entry.downloads += m.downloads;
    entry.revenue += m.revenue || (m.adRevenue + m.iapRevenue);
    entry.adSpend += m.adSpend;
    if (m.dau) { entry.dauSum += m.dau; entry.dauDays += 1; }
    if (m.rating) { entry.ratingSum += m.rating; entry.ratingDays += 1; }
    byGame.set(key, entry);
  });

  const games = Array.from(byGame.values()).sort((a, b) => b.revenue - a.revenue);
  if (!games.length) {
    els.gamesTableBody.innerHTML = `<tr><td colspan="8" class="table-empty">No game data in this window.</td></tr>`;
    return;
  }
  els.gamesTableBody.innerHTML = games.map((g) => {
    const roas = g.adSpend > 0 ? (g.revenue / g.adSpend).toFixed(2) + "×" : "—";
    const avgDau = g.dauDays > 0 ? g.dauSum / g.dauDays : 0;
    const avgRating = g.ratingDays > 0 ? g.ratingSum / g.ratingDays : 0;
    const platformPills = Array.from(g.platforms).map((p) => `<span class="platform-pill ${p}">${platformLabel(p)}</span>`).join(" ");
    return `
      <tr>
        <td><strong>${escapeHtml(g.gameName)}</strong></td>
        <td>${platformPills}</td>
        <td class="num">${formatNumber(g.downloads)}</td>
        <td class="num">${formatCurrency(g.revenue)}</td>
        <td class="num">${formatCurrency(g.adSpend)}</td>
        <td class="num">${roas}</td>
        <td class="num">${formatNumber(Math.round(avgDau))}</td>
        <td class="num">${avgRating > 0 ? avgRating.toFixed(2) : "—"}</td>
      </tr>
    `;
  }).join("");
}

// ====== Chart rendering ======
function renderTrendChart() {
  if (!window.Chart) return;
  const bounds = getRangeBounds();
  const days = iterateDays(bounds.start, bounds.end).map(toIsoDate);
  const active = getActiveUsers();
  const metrics = getMetricsInRange(bounds);

  let data, label, color, fillColor;
  if (state.trendMode === "revenue") {
    const byDay = groupSum(metrics, (m) => toIsoDate(m.date), (m) => m.revenue || (m.adRevenue + m.iapRevenue));
    data = days.map((d) => byDay.get(d) || 0);
    label = "Revenue";
    color = PALETTE.green;
    fillColor = "rgba(142, 214, 175, 0.18)";
  } else if (state.trendMode === "downloads") {
    const byDay = groupSum(metrics, (m) => toIsoDate(m.date), (m) => m.downloads);
    data = days.map((d) => byDay.get(d) || 0);
    label = "Downloads";
    color = PALETTE.blue;
    fillColor = "rgba(125, 176, 230, 0.2)";
  } else {
    const dayMap = new Map(days.map((d) => [d, 0]));
    active.forEach((u) => {
      const k = toIsoDate(u.updatedAt);
      if (dayMap.has(k)) dayMap.set(k, dayMap.get(k) + 1);
    });
    data = days.map((d) => dayMap.get(d) || 0);
    label = "Active players";
    color = PALETTE.gold;
    fillColor = "rgba(231, 201, 138, 0.22)";
  }

  upsertChart("trendChart", {
    type: "line",
    data: {
      labels: days.map(formatShortDate),
      datasets: [{
        label,
        data,
        borderColor: color,
        backgroundColor: createGradient("trendChart", fillColor),
        borderWidth: 2.4,
        fill: true,
        tension: 0.38,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointBackgroundColor: color,
        pointHoverBorderColor: "#fff",
        pointHoverBorderWidth: 2
      }]
    },
    options: lineChartOptions()
  });
}

function renderPlatformChart(rows) {
  if (!window.Chart) return;
  const colors = [PALETTE.gold, PALETTE.blue, PALETTE.green, PALETTE.violet, PALETTE.rose];
  const labels = rows.map((r) => platformLabel(r.platform));
  const data = rows.map((r) => r.profiles);

  upsertChart("platformChart", {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: "rgba(10, 18, 29, 0.8)",
        borderWidth: 2,
        hoverOffset: 8
      }]
    },
    options: {
      ...baseChartOptions(),
      cutout: "72%",
      plugins: {
        legend: { display: false },
        tooltip: tooltipStyle()
      }
    }
  });

  if (els.platformLegend) {
    const total = data.reduce((a, b) => a + b, 0) || 1;
    els.platformLegend.innerHTML = rows.map((r, i) => `
      <div class="legend-item">
        <span class="legend-name">
          <span class="legend-dot" style="background:${colors[i]}"></span>
          ${escapeHtml(platformLabel(r.platform))}
        </span>
        <span class="legend-value">${formatNumber(r.profiles)} · ${((r.profiles / total) * 100).toFixed(1)}%</span>
      </div>
    `).join("");
  }
}

function renderPowerChart(users) {
  if (!window.Chart) return;
  const hints = sum(users.map((u) => u.hintCount));
  const shuffles = sum(users.map((u) => u.shuffleCount));
  const undos = sum(users.map((u) => u.undoCount));
  upsertChart("powerChart", {
    type: "doughnut",
    data: {
      labels: ["Hints", "Shuffles", "Undos"],
      datasets: [{
        data: [hints, shuffles, undos],
        backgroundColor: [PALETTE.gold, PALETTE.violet, PALETTE.rose],
        borderColor: "rgba(10, 18, 29, 0.8)",
        borderWidth: 2
      }]
    },
    options: {
      ...baseChartOptions(),
      cutout: "68%",
      plugins: {
        legend: { position: "bottom", labels: { color: PALETTE.text, padding: 14, usePointStyle: true } },
        tooltip: tooltipStyle()
      }
    }
  });
}

function renderToolsChart(users) {
  if (!window.Chart) return;
  const buckets = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const counts = buckets.map((b) => users.filter((u) => u.toolsUnlockedCount === b).length);
  const overflow = users.filter((u) => u.toolsUnlockedCount > 8).length;
  if (overflow) { buckets.push("9+"); counts.push(overflow); }

  upsertChart("toolsChart", {
    type: "bar",
    data: {
      labels: buckets.map(String),
      datasets: [{
        label: "Players",
        data: counts,
        backgroundColor: gradientBars("toolsChart", PALETTE.violet, "rgba(180, 156, 255, 0.3)"),
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 34
      }]
    },
    options: barChartOptions()
  });
}

function renderRecencyChart(users) {
  if (!window.Chart) return;
  const now = Date.now();
  const counts = RECENCY_BUCKETS.map(() => 0);
  users.forEach((u) => {
    if (!u.updatedAt) { counts[counts.length - 1]++; return; }
    const days = (now - u.updatedAt.getTime()) / 864e5;
    for (let i = 0; i < RECENCY_BUCKETS.length; i++) {
      if (days <= RECENCY_BUCKETS[i].maxDays) { counts[i]++; break; }
    }
  });
  upsertChart("recencyChart", {
    type: "bar",
    data: {
      labels: RECENCY_BUCKETS.map((b) => b.label),
      datasets: [{
        label: "Profiles",
        data: counts,
        backgroundColor: gradientBars("recencyChart", PALETTE.blue, "rgba(125, 176, 230, 0.3)"),
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 34
      }]
    },
    options: barChartOptions()
  });
}

function renderLevelChart(rows) {
  if (!window.Chart) return;
  upsertChart("levelChart", {
    type: "bar",
    data: {
      labels: rows.map((r) => r.label),
      datasets: [{
        label: "Players",
        data: rows.map((r) => r.count),
        backgroundColor: gradientBars("levelChart", PALETTE.gold, "rgba(231, 201, 138, 0.28)"),
        borderRadius: 10,
        borderSkipped: false,
        maxBarThickness: 48
      }]
    },
    options: barChartOptions()
  });
}

function renderPowerPerLevelChart(rows) {
  if (!window.Chart) return;
  upsertChart("powerPerLevelChart", {
    type: "bar",
    data: {
      labels: rows.map((r) => r.label),
      datasets: [
        {
          label: "Avg power uses",
          data: rows.map((r) => Number(r.avgPowers.toFixed(1))),
          backgroundColor: "rgba(231, 201, 138, 0.8)",
          borderRadius: 8,
          maxBarThickness: 36
        },
        {
          label: "Avg tools unlocked",
          data: rows.map((r) => Number(r.avgTools.toFixed(1))),
          backgroundColor: "rgba(180, 156, 255, 0.8)",
          borderRadius: 8,
          maxBarThickness: 36
        }
      ]
    },
    options: {
      ...barChartOptions(),
      plugins: {
        ...barChartOptions().plugins,
        legend: { display: true, position: "bottom", labels: { color: PALETTE.text, padding: 14, usePointStyle: true } }
      }
    }
  });
}

function renderRevenueStackChart(metrics, bounds) {
  if (!window.Chart) return;
  const days = iterateDays(bounds.start, bounds.end).map(toIsoDate);
  const adByDay = groupSum(metrics, (m) => toIsoDate(m.date), (m) => m.adRevenue);
  const iapByDay = groupSum(metrics, (m) => toIsoDate(m.date), (m) => m.iapRevenue);

  upsertChart("revenueStackChart", {
    type: "bar",
    data: {
      labels: days.map(formatShortDate),
      datasets: [
        {
          label: "Ad revenue",
          data: days.map((d) => adByDay.get(d) || 0),
          backgroundColor: "rgba(231, 201, 138, 0.85)",
          borderRadius: 6,
          stack: "revenue"
        },
        {
          label: "IAP revenue",
          data: days.map((d) => iapByDay.get(d) || 0),
          backgroundColor: "rgba(180, 156, 255, 0.85)",
          borderRadius: 6,
          stack: "revenue"
        }
      ]
    },
    options: {
      ...barChartOptions(),
      scales: {
        x: barChartOptions().scales.x,
        y: { ...barChartOptions().scales.y, stacked: true }
      },
      plugins: {
        ...barChartOptions().plugins,
        legend: { display: true, position: "bottom", labels: { color: PALETTE.text, padding: 14, usePointStyle: true } }
      }
    }
  });
}

function renderSpendRevenueChart(metrics, bounds) {
  if (!window.Chart) return;
  const days = iterateDays(bounds.start, bounds.end).map(toIsoDate);
  const rev = groupSum(metrics, (m) => toIsoDate(m.date), (m) => m.revenue || (m.adRevenue + m.iapRevenue));
  const spend = groupSum(metrics, (m) => toIsoDate(m.date), (m) => m.adSpend);

  upsertChart("spendRevenueChart", {
    type: "line",
    data: {
      labels: days.map(formatShortDate),
      datasets: [
        {
          label: "Revenue",
          data: days.map((d) => rev.get(d) || 0),
          borderColor: PALETTE.green,
          backgroundColor: "rgba(142, 214, 175, 0.15)",
          borderWidth: 2.4,
          fill: true,
          tension: 0.35,
          pointRadius: 0
        },
        {
          label: "Ad spend",
          data: days.map((d) => spend.get(d) || 0),
          borderColor: PALETTE.rose,
          backgroundColor: "rgba(242, 159, 180, 0.12)",
          borderWidth: 2.4,
          borderDash: [5, 4],
          fill: true,
          tension: 0.35,
          pointRadius: 0
        }
      ]
    },
    options: {
      ...lineChartOptions(),
      plugins: {
        ...lineChartOptions().plugins,
        legend: { display: true, position: "bottom", labels: { color: PALETTE.text, padding: 14, usePointStyle: true } }
      }
    }
  });
}

function renderStickinessChart(metrics, bounds) {
  if (!window.Chart) return;
  const days = iterateDays(bounds.start, bounds.end).map(toIsoDate);
  const dauByDay = groupSum(metrics, (m) => toIsoDate(m.date), (m) => m.dau);
  const mauByDay = groupSum(metrics, (m) => toIsoDate(m.date), (m) => m.mau);

  upsertChart("stickinessChart", {
    type: "line",
    data: {
      labels: days.map(formatShortDate),
      datasets: [
        {
          label: "DAU",
          data: days.map((d) => dauByDay.get(d) || 0),
          borderColor: PALETTE.blue,
          backgroundColor: "rgba(125, 176, 230, 0.15)",
          borderWidth: 2.4,
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          yAxisID: "y"
        },
        {
          label: "MAU",
          data: days.map((d) => mauByDay.get(d) || 0),
          borderColor: PALETTE.violet,
          backgroundColor: "rgba(180, 156, 255, 0.12)",
          borderWidth: 2.4,
          fill: false,
          tension: 0.35,
          pointRadius: 0,
          yAxisID: "y"
        }
      ]
    },
    options: {
      ...lineChartOptions(),
      plugins: {
        ...lineChartOptions().plugins,
        legend: { display: true, position: "bottom", labels: { color: PALETTE.text, padding: 14, usePointStyle: true } }
      }
    }
  });
}

// ====== Chart helpers ======
function upsertChart(id, configObject) {
  const previous = state.charts[id];
  if (previous) previous.destroy();
  const el = document.getElementById(id);
  if (!el) return;
  state.charts[id] = new window.Chart(el, configObject);
}

function tooltipStyle() {
  return {
    backgroundColor: "rgba(7, 12, 22, 0.96)",
    titleColor: PALETTE.text,
    bodyColor: PALETTE.text,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    padding: 12,
    boxPadding: 6,
    cornerRadius: 10,
    titleFont: { weight: "700", family: "Inter, sans-serif" },
    bodyFont: { family: "Inter, sans-serif" },
    usePointStyle: true
  };
}

function baseChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 600, easing: "easeOutQuart" },
    plugins: {
      legend: { labels: { color: PALETTE.text, usePointStyle: true, padding: 14 } },
      tooltip: tooltipStyle()
    }
  };
}

function lineChartOptions() {
  return {
    ...baseChartOptions(),
    interaction: { mode: "index", intersect: false },
    plugins: {
      ...baseChartOptions().plugins,
      legend: { display: false }
    },
    scales: {
      x: {
        ticks: { color: PALETTE.muted, maxRotation: 0, autoSkipPadding: 18 },
        grid: { color: PALETTE.grid, drawTicks: false }
      },
      y: {
        beginAtZero: true,
        ticks: { color: PALETTE.muted, padding: 8 },
        grid: { color: PALETTE.grid, drawTicks: false }
      }
    }
  };
}

function barChartOptions() {
  return {
    ...baseChartOptions(),
    plugins: {
      ...baseChartOptions().plugins,
      legend: { display: false }
    },
    scales: {
      x: {
        ticks: { color: PALETTE.muted },
        grid: { display: false, drawBorder: false }
      },
      y: {
        beginAtZero: true,
        ticks: { color: PALETTE.muted, padding: 8 },
        grid: { color: PALETTE.grid, drawTicks: false }
      }
    }
  };
}

function createGradient(canvasId, fallbackColor) {
  return (ctx) => {
    const chart = ctx.chart;
    const { ctx: c, chartArea } = chart;
    if (!chartArea) return fallbackColor;
    const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    g.addColorStop(0, fallbackColor);
    g.addColorStop(1, "rgba(255, 255, 255, 0)");
    return g;
  };
}

function gradientBars(canvasId, top, bottom) {
  return (ctx) => {
    const chart = ctx.chart;
    const { ctx: c, chartArea } = chart;
    if (!chartArea) return top;
    const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    return g;
  };
}

// ====== Misc helpers ======
function buildCohortMatrix(users, weeksBack = 8) {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  const weeks = [];
  for (let i = weeksBack - 1; i >= 0; i--) {
    const end = new Date(now);
    end.setDate(end.getDate() - i * 7);
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    weeks.push({ start, end });
  }

  let withCreatedAt = 0;
  users.forEach((u) => { if (u.createdAt) withCreatedAt++; });

  const rows = weeks.map((week) => {
    const cohort = users.filter((u) => u.createdAt && u.createdAt >= week.start && u.createdAt <= week.end);
    const size = cohort.length;
    return {
      label: shortWeekLabel(week.start),
      start: week.start,
      end: week.end,
      size,
      d1: buildCohortMilestone(cohort, 1, now),
      d7: buildCohortMilestone(cohort, 7, now),
      d14: buildCohortMilestone(cohort, 14, now),
      d30: buildCohortMilestone(cohort, 30, now)
    };
  });

  return { rows, withCreatedAt, totalUsers: users.length };
}

function buildCohortMilestone(cohort, days, now) {
  const thresholdMs = days * 864e5;
  const eligible = cohort.filter((u) => u.createdAt && (now.getTime() - u.createdAt.getTime()) >= thresholdMs);
  if (!eligible.length) {
    return { days, eligible: 0, retained: 0, ratio: null };
  }

  const retained = eligible.filter((u) => u.updatedAt && (u.updatedAt.getTime() - u.createdAt.getTime()) >= thresholdMs).length;
  return {
    days,
    eligible: eligible.length,
    retained,
    ratio: retained / eligible.length
  };
}

function shortWeekLabel(start) {
  const d = new Date(start);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}/${day}`;
}

function buildCountryRows(users) {
  const map = new Map();
  users.forEach((u) => {
    const key = u.country || "unknown";
    const entry = map.get(key) || { country: key, profiles: 0, levelSum: 0, engSum: 0, whales: 0 };
    entry.profiles++;
    entry.levelSum += u.level;
    entry.engSum += u.engagementScore;
    if (u.segment === "whale") entry.whales++;
    map.set(key, entry);
  });
  return Array.from(map.values())
    .map((e) => ({
      country: e.country,
      profiles: e.profiles,
      avgLevel: e.profiles ? e.levelSum / e.profiles : 0,
      avgEngagement: e.profiles ? e.engSum / e.profiles : 0,
      whales: e.whales
    }))
    .sort((a, b) => b.profiles - a.profiles);
}

function buildCountryMarketingRows(metrics) {
  const map = new Map();
  metrics.forEach((m) => {
    const key = m.country || "unknown";
    const entry = map.get(key) || { country: key, revenue: 0, spend: 0, downloads: 0 };
    entry.revenue += m.revenue || (m.adRevenue + m.iapRevenue);
    entry.spend += m.adSpend;
    entry.downloads += m.downloads;
    map.set(key, entry);
  });
  return Array.from(map.values())
    .map((e) => ({ ...e, roas: e.spend > 0 ? e.revenue / e.spend : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
}

function buildPlatformRows(users) {
  const map = new Map();
  users.forEach((u) => {
    const key = u.lastSeenPlatform || "unknown";
    const entry = map.get(key) || { platform: key, profiles: 0, levelSum: 0, powerSum: 0, toolsSum: 0 };
    entry.profiles++;
    entry.levelSum += u.level;
    entry.powerSum += u.powerUses;
    entry.toolsSum += u.toolsUnlockedCount;
    map.set(key, entry);
  });
  return Array.from(map.values()).map((e) => ({
    platform: e.platform,
    profiles: e.profiles,
    avgLevel: e.profiles ? e.levelSum / e.profiles : 0,
    avgPowerUses: e.profiles ? e.powerSum / e.profiles : 0,
    avgToolsUnlocked: e.profiles ? e.toolsSum / e.profiles : 0
  })).sort((a, b) => b.profiles - a.profiles);
}

function renderPlatformSummaryTable(rows) {
  if (!rows.length) {
    els.summaryTableBody.innerHTML = `<tr><td colspan="6" class="table-empty">No active profiles in this range yet.</td></tr>`;
    return;
  }
  const total = rows.reduce((a, r) => a + r.profiles, 0) || 1;
  els.summaryTableBody.innerHTML = rows.map((r) => `
    <tr>
      <td><span class="platform-pill ${r.platform}">${platformLabel(r.platform)}</span></td>
      <td class="num">${formatNumber(r.profiles)}</td>
      <td class="num">${((r.profiles / total) * 100).toFixed(1)}%</td>
      <td class="num">${formatDecimal(r.avgLevel)}</td>
      <td class="num">${formatDecimal(r.avgPowerUses)}</td>
      <td class="num">${formatDecimal(r.avgToolsUnlocked)}</td>
    </tr>
  `).join("");
}

function groupSum(items, keyFn, valueFn) {
  const map = new Map();
  items.forEach((it) => {
    const k = keyFn(it);
    if (!k) return;
    map.set(k, (map.get(k) || 0) + (valueFn(it) || 0));
  });
  return map;
}

function sum(values) {
  return values.reduce((a, v) => a + (Number(v) || 0), 0);
}

function average(values) {
  if (!values.length) return 0;
  return sum(values) / values.length;
}

function percentile(sortedAsc, p) {
  if (!sortedAsc.length) return 0;
  const idx = Math.floor((p / 100) * (sortedAsc.length - 1));
  return sortedAsc[idx];
}

function iterateDays(start, end) {
  const days = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  while (cursor <= last) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function daysInRange(bounds) {
  return Math.max(1, Math.round((bounds.end.getTime() - bounds.start.getTime()) / 864e5));
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

function compareDates(l, r) {
  const lt = l instanceof Date && !Number.isNaN(l.getTime()) ? l.getTime() : 0;
  const rt = r instanceof Date && !Number.isNaN(r.getTime()) ? r.getTime() : 0;
  return lt - rt;
}

function isAllowedUser(email) {
  return Boolean(email) && email.toLowerCase() === config.adminEmail.toLowerCase();
}

function hasPlaceholderConfig() {
  const fb = config.firebase || {};
  return (
    !config.adminEmail ||
    config.adminEmail.startsWith("YOUR_") ||
    !fb.apiKey ||
    fb.apiKey.startsWith("YOUR_") ||
    !fb.projectId ||
    fb.projectId.startsWith("YOUR_")
  );
}

function setBadge(text, isLive = false) {
  els.sessionBadgeLabel.textContent = text;
  els.sessionBadge.classList.toggle("is-live", isLive);
}

function setAuthGate(stateName) {
  const states = {
    loading: { title: "Checking access", text: "Verifying your admin session." },
    setup: { title: "Setup required", text: "Firebase config is incomplete. Finish setup before this page can be used." }
  };
  if (stateName === "signed_in" || stateName === "hidden") {
    els.authGate.hidden = true;
    return;
  }
  const copy = states[stateName] || states.loading;
  els.authGateTitle.textContent = copy.title;
  els.authGateText.textContent = copy.text;
  els.authGate.hidden = false;
}

function setAuthFeedback(message, tone) {
  setFeedback(els.authFeedback, message, tone);
}

function setFeedback(element, message, tone) {
  if (!element) return;
  element.textContent = message;
  element.classList.remove("is-error", "is-success");
  if (tone === "error") element.classList.add("is-error");
  if (tone === "success") element.classList.add("is-success");
}

function handleDashboardError(error) {
  const msg = error.code === "permission-denied"
    ? "Firestore denied access. Update rules to allow the admin account to read users, studioGames and studioDailyMetrics."
    : error.message || "Unexpected Firebase error.";
  els.dataFreshness.textContent = msg;
  setAuthFeedback(msg, "error");
  if (els.dashboardNotice) {
    els.dashboardNotice.hidden = false;
    els.dashboardNotice.textContent = msg;
    els.dashboardNotice.classList.add("is-error");
  }
}

function formatCollectionLoadError(collectionName, error, fallback) {
  if (error?.code === "permission-denied") {
    return `Firestore blocked reads for ${collectionName}. ${fallback}`;
  }
  if (error?.code) {
    return `${collectionName} failed to load (${error.code}). ${fallback}`;
  }
  return `${collectionName} failed to load. ${fallback}`;
}

// ====== Formatting ======
function formatNumber(v) {
  return new Intl.NumberFormat().format(Math.round(v || 0));
}

function formatDecimal(v) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v || 0);
}

function formatCurrency(v) {
  const num = Number(v) || 0;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: config.dashboard.currency || "USD",
    maximumFractionDigits: num >= 1000 ? 0 : 2
  }).format(num);
}

function formatDateTime(date) {
  if (!date || Number.isNaN(date.getTime())) return "Not yet";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: config.dashboard.timezone || "UTC"
  }).format(date);
}

function formatShortDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}`;
}

function platformLabel(v) {
  if (v === "ios") return "iOS";
  if (v === "android") return "Android";
  if (v === "unknown") return "Unknown";
  return v || "Unknown";
}

function segmentLabel(seg) {
  const map = { whale: "Whale", pro: "Pro", casual: "Casual", beginner: "Beginner" };
  return map[seg] || "—";
}

function normalizeAuthError(error) {
  const map = {
    "auth/invalid-credential": "Invalid email or password.",
    "auth/invalid-email": "Email address is invalid.",
    "auth/missing-password": "Password is required.",
    "auth/too-many-requests": "Too many attempts. Try again later."
  };
  return map[error.code] || error.message || "Login failed.";
}

function truncateId(v) {
  if (!v || v.length <= 12) return v;
  return `${v.slice(0, 6)}…${v.slice(-4)}`;
}

function readNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(v) {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function toIsoDate(date) {
  if (!date || Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function escapeHtml(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
