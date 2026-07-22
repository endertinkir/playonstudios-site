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
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  where
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

const ACTIVE_30M_WINDOW_MS = 30 * 60 * 1000;
const AD_REVENUE_MICROS_DIVISOR = 1000000;

const RECENCY_BUCKETS = [
  { label: "Today",     maxDays: 1   },
  { label: "2–7 days",  maxDays: 7   },
  { label: "8–14 days", maxDays: 14  },
  { label: "15–30 days", maxDays: 30 },
  { label: "31–90 days", maxDays: 90 },
  { label: "90+ days",  maxDays: Infinity }
];

const USER_TABLE_SORTS = {
  players: [
    { label: "Engagement", mode: "engagement" },
    { label: "Level", mode: "level" },
    { label: "Recent", mode: "recent" }
  ],
  monetization: [
    { label: "Ad Revenue", mode: "adRevenue" },
    { label: "Paid Events", mode: "paidEvents" },
    { label: "Ad Watches", mode: "adExposure" }
  ],
  adHealth: [
    { label: "Interruptions", mode: "interruptions" },
    { label: "Missing Paid", mode: "missingPaid" },
    { label: "Reward Drop-off", mode: "rewardDropOff" }
  ],
  progression: [
    { label: "Level", mode: "level" },
    { label: "Powers", mode: "powers" },
    { label: "Engagement", mode: "engagement" }
  ]
};

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
  userDailyAdMetrics: [],
  selectedUserId: null,
  selectedUser: null,
  loadErrors: {
    users: null,
    games: null,
    metrics: null,
    userDailyAdMetrics: null
  },
  charts: {},
  activeTab: "overview",
  trendMode: "users",
  userTableScope: "event",
  userTableView: "players",
  topMode: "engagement",
  levelFunnelMode: "overall"
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
    "rangePreset", "rangeStart", "rangeEnd",
    "installCohortPreset", "installStart", "installEnd",
    "platformFilter", "segmentFilter", "countryFilter", "buildFilter",
    "refreshButton", "dataFreshness", "dashboardNotice", "filterContext",
    // Overview KPIs
    "kpiTotalProfiles", "kpiTotalProfilesDelta",
    "kpiActiveProfiles", "kpiActiveProfilesDelta",
    "kpiActive30m", "kpiActive30mDelta",
    "kpiAvgLevel", "kpiAvgLevelDelta",
    "kpiEngagement", "kpiEngagementDelta",
    "kpiRevenue", "kpiRevenueDelta", "kpiRevenueCaption",
    "adTotalRevenue", "adPaidImpressions", "adInterstitialWatches", "adRewardedCompleted", "adInterruptions",
    "adBreakdownBody", "adHealthList",
    "summaryTableBody", "pulseList", "platformLegend", "trendTitle", "topCountriesBody", "countryEmptyNote", "buildHealthBody",
    // Users
    "retentionBody", "retentionNote",
    "segWhales", "segWhalesBar",
    "segPro", "segProBar",
    "segCasual", "segCasualBar",
    "segBeginner", "segBeginnerBar",
    "segChurn", "segChurnBar",
    "userLookupInput", "userLookupButton", "userLookupFeedback", "userLookupResults", "userDetailBody",
    "userScopeChips", "userViewChips", "topPlayersChips", "topPlayersTableHead", "topPlayersTableBody", "topPlayersTitle", "topPlayersNote",
    // Levels
    "kpiLvlAvg", "kpiLvlMedian", "kpiLvlP75", "kpiLvlMax",
    "progressionFunnel", "levelCohortBody",
    // Marketing
    "countryMarketingBody",
    "mkRevenue", "mkRevenueDelta",
    "mkSpend", "mkSpendDelta",
    "mkRoas", "mkRoasDelta",
    "mkDownloads", "mkDownloadsDelta",
    "mkCpi", "mkArpdau", "marketingScopeNote",
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
  if (els.installCohortPreset) els.installCohortPreset.addEventListener("change", handleInstallCohortPresetChange);
  if (els.installStart) els.installStart.addEventListener("change", handleInstallCohortManualRangeChange);
  if (els.installEnd) els.installEnd.addEventListener("change", handleInstallCohortManualRangeChange);
  els.platformFilter.addEventListener("change", renderDashboard);
  els.segmentFilter.addEventListener("change", renderDashboard);
  if (els.countryFilter) els.countryFilter.addEventListener("change", renderDashboard);
  if (els.buildFilter) els.buildFilter.addEventListener("change", renderDashboard);
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
  if (els.userViewChips) {
    els.userViewChips.addEventListener("click", handleUserViewChipClick);
  }
  if (els.userScopeChips) {
    els.userScopeChips.addEventListener("click", handleUserScopeChipClick);
  }
  if (els.topPlayersChips) {
    els.topPlayersChips.addEventListener("click", handleTopPlayersSortChipClick);
  }
  if (els.topPlayersTableBody) {
    els.topPlayersTableBody.addEventListener("click", handleTopPlayersTableClick);
  }
  if (els.userDetailBody) {
    els.userDetailBody.addEventListener("click", handleTopPlayersTableClick);
  }
  if (els.userLookupButton) {
    els.userLookupButton.addEventListener("click", () => handleUserLookupSubmit().catch(handleDashboardError));
  }
  if (els.userLookupInput) {
    els.userLookupInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleUserLookupSubmit().catch(handleDashboardError);
      }
    });
  }
  if (els.userLookupResults) {
    els.userLookupResults.addEventListener("click", handleUserLookupResultClick);
  }
  document.querySelectorAll("#levelFunnelChips .chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      setActiveChip("#levelFunnelChips", btn);
      state.levelFunnelMode = btn.dataset.funnel;
      renderProgressionFunnel(getActiveUsers());
    });
  });
}

function setActiveChip(scopeSelector, activeBtn) {
  document.querySelectorAll(`${scopeSelector} .chip`).forEach((b) => b.classList.remove("is-active"));
  activeBtn.classList.add("is-active");
}

function handleUserViewChipClick(event) {
  const button = event.target.closest("[data-user-view]");
  if (!button) return;
  state.userTableView = button.dataset.userView || "players";
  state.topMode = defaultTopModeForView(state.userTableView);
  setActiveChip("#userViewChips", button);
  renderUserSortChips();
  renderTopPlayersTable();
}

function handleUserScopeChipClick(event) {
  const button = event.target.closest("[data-user-scope]");
  if (!button) return;
  state.userTableScope = button.dataset.userScope || "event";
  setActiveChip("#userScopeChips", button);
  renderTopPlayersTable();
}

function handleTopPlayersSortChipClick(event) {
  const button = event.target.closest("[data-top]");
  if (!button) return;
  state.topMode = button.dataset.top;
  setActiveChip("#topPlayersChips", button);
  renderTopPlayersTable();
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
  syncInstallCohortControls();
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
    await Promise.all([loadUsers(), loadGames(), loadMetrics(), loadUserDailyAdMetrics()]);
    populateCountryOptions();
    populateBuildOptions();
    renderDashboard();
    els.dataFreshness.textContent = `Last synced ${formatDateTime(new Date())}`;
  } finally {
    els.refreshButton.classList.remove("is-loading");
  }
}

async function refreshWindowMetricsForRange() {
  if (!state.db || !state.user) {
    renderDashboard();
    return;
  }
  els.refreshButton.classList.add("is-loading");
  try {
    await Promise.all([loadMetrics(), loadUserDailyAdMetrics()]);
    renderDashboard();
    els.dataFreshness.textContent = `Window data synced ${formatDateTime(new Date())}`;
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

function populateBuildOptions() {
  if (!els.buildFilter) return;
  const previous = els.buildFilter.value || "all";
  const counts = new Map();
  state.users.forEach((u) => {
    const k = u.buildNumber || "unknown";
    counts.set(k, (counts.get(k) || 0) + 1);
  });
  const entries = Array.from(counts.entries())
    .sort((a, b) => {
      if (a[0] === "unknown") return 1;
      if (b[0] === "unknown") return -1;
      return Number(b[0]) - Number(a[0]) || String(b[0]).localeCompare(String(a[0]));
    });
  els.buildFilter.innerHTML = [
    `<option value="all">All builds</option>`,
    ...entries.map(([build, count]) =>
      `<option value="${escapeHtml(build)}">${build === "unknown" ? "Unknown build" : `Build ${escapeHtml(build)}`} · ${formatNumber(count)}</option>`
    )
  ].join("");
  els.buildFilter.value = Array.from(counts.keys()).concat(["all"]).includes(previous) ? previous : "all";
}

function renderDashboardNotice() {
  if (!els.dashboardNotice) return;

  const notes = [];
  if (state.loadErrors.users) notes.push(state.loadErrors.users);
  if (state.loadErrors.games) notes.push(state.loadErrors.games);
  if (state.loadErrors.metrics) notes.push(state.loadErrors.metrics);
  if (state.loadErrors.userDailyAdMetrics) notes.push(state.loadErrors.userDailyAdMetrics);

  const build = els.buildFilter ? els.buildFilter.value : "all";
  if (!state.loadErrors.metrics && build !== "all") {
    notes.push("Build filter scopes user analytics only; Marketing metrics stay unfiltered until studioDailyMetrics rows include buildNumber.");
  }
  const segment = els.segmentFilter ? els.segmentFilter.value : "all";
  if (["active30m", "active7", "churnrisk"].includes(segment) && state.userDailyAdMetrics.length > 0) {
    notes.push("Daily ad rollups use stored player segments, so activity/churn cohort filters apply only to user profile sections.");
  }
  if (els.installCohortPreset && els.installCohortPreset.value !== "all" && state.userDailyAdMetrics.length > 0) {
    notes.push("Daily ad metrics are filtered by event date first, then by the selected install cohort.");
  }

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
  els.dashboardNotice.classList.toggle(
    "is-error",
    Boolean(state.loadErrors.users || state.loadErrors.games || state.loadErrors.metrics || state.loadErrors.userDailyAdMetrics)
  );
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
    const bounds = getMetricsLoadBounds();
    const snap = await getDocs(query(
      collection(state.db, name),
      where("date", ">=", toIsoDate(bounds.start)),
      where("date", "<=", toIsoDate(bounds.end))
    ));
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

async function loadUserDailyAdMetrics() {
  state.loadErrors.userDailyAdMetrics = null;
  try {
    const name = config.collections.userDailyAdMetrics || "userDailyAdMetrics";
    const bounds = getRangeBounds();
    const snap = await getDocs(query(
      collection(state.db, name),
      where("date", ">=", toIsoDate(bounds.start)),
      where("date", "<=", toIsoDate(bounds.end))
    ));
    state.userDailyAdMetrics = snap.docs.map((d) => normalizeUserDailyAdMetric(d.id, d.data()));
  } catch (error) {
    state.userDailyAdMetrics = [];
    state.loadErrors.userDailyAdMetrics = formatCollectionLoadError(
      config.collections.userDailyAdMetrics || "userDailyAdMetrics",
      error,
      "Daily ad deltas are unavailable until the rollup function is deployed and this collection is readable."
    );
  }
}

// ====== Normalization ======
// Country trust tiers:
//   "verified"  → field written once on first launch from the store context (installCountry / storeCountry / downloadCountry)
//   "inferred"  → only a generic `country` / `countryCode` field, may drift with VPN/roaming
//   "unknown"   → nothing usable
function normalizeUser(id, payload = {}) {
  const level = readNumber(payload.level);
  const hintCount = readNumber(payload.hintCount);
  const shuffleCount = readNumber(payload.shuffleCount);
  const undoCount = readNumber(payload.undoCount);
  const powerUses = hintCount + shuffleCount + undoCount;
  const buildNumber = normalizeBuildNumber(payload.buildNumber);
  const ads = normalizeUserAdStats(payload);

  const verifiedRaw =
    payload.installCountry ||
    payload.downloadCountry ||
    payload.storeCountry ||
    (payload.install && (payload.install.country || payload.install.countryCode));
  const inferredRaw =
    payload.country ||
    payload.lastSeenCountry ||
    payload.countryCode ||
    (payload.geo && (payload.geo.country || payload.geo.countryCode));

  let country = "unknown";
  let countryTrust = "unknown";
  if (verifiedRaw) {
    country = normalizeCountry(verifiedRaw);
    if (country !== "unknown") countryTrust = "verified";
  }
  if (countryTrust === "unknown" && inferredRaw) {
    country = normalizeCountry(inferredRaw);
    if (country !== "unknown") countryTrust = "inferred";
  }

  return {
    id,
    level,
    hintCount,
    shuffleCount,
    undoCount,
    buildNumber,
    schemaVersion: readNumber(payload.schemaVersion),
    lastSeenPlatform: normalizePlatform(payload.lastSeenPlatform),
    country,
    countryTrust,
    updatedAt: parseDate(payload.updatedAt),
    createdAt: parseDate(payload.createdAt) || parseDate(payload.firstSeenAt) || parseDate(payload.installDate),
    lastOpenAt: parseDate(payload.lastOpenAt),
    lastSessionEndedAt: parseDate(payload.lastSessionEndedAt),
    revenueCatPremiumObservedAt: parseDate(payload.revenueCatPremiumObservedAt),
    installId: payload.installId || "",
    deviceStableId: payload.deviceStableId || "",
    deviceModelCode: payload.deviceModelCode || "",
    osVersion: payload.osVersion || "",
    isPhysicalDevice: payload.isPhysicalDevice,
    timeZone: payload.timeZone || "",
    sessionCount: readNumber(payload.sessionCount),
    totalPlayTimeSeconds: readNumber(payload.totalPlayTimeSeconds),
    lastSessionDurationSeconds: readNumber(payload.lastSessionDurationSeconds),
    revenueCatPremiumObserved: Boolean(payload.revenueCatPremiumObserved),
    revenueCatPremiumObservedSource: payload.revenueCatPremiumObservedSource || "",
    powerUses,
    ads,
    engagementScore: computeEngagement(level, powerUses),
    segment: computeSegment(level, powerUses)
  };
}

function normalizeMetric(id, payload = {}) {
  // Prefer store-reported country (Play Console / App Store Connect export) over generic "country".
  const verifiedRaw = payload.downloadCountry || payload.storeCountry || payload.installCountry;
  const inferredRaw = payload.country || payload.countryCode;
  const rawCountry = verifiedRaw || inferredRaw;
  const countryTrust = verifiedRaw ? "verified" : (inferredRaw ? "inferred" : "unknown");
  return {
    id,
    gameId: payload.gameId || "",
    gameName: payload.gameName || "",
    gameSlug: payload.gameSlug || "",
    platform: normalizePlatform(payload.platform),
    country: normalizeCountry(rawCountry),
    countryTrust,
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

function normalizeUserDailyAdMetric(id, payload = {}) {
  return {
    id,
    uid: payload.uid || "",
    date: parseDate(payload.date),
    dateKey: payload.date || "",
    lastUserUpdatedAt: parseDate(payload.lastUserUpdatedAt),
    updatedAt: parseDate(payload.updatedAt),
    installDate: parseDate(payload.installDateKey || payload.installDate),
    lastSeenPlatform: normalizePlatform(payload.platform),
    country: normalizeCountry(payload.country),
    buildNumber: normalizeBuildNumber(payload.buildNumber),
    segment: payload.segment || "beginner",
    level: readNumber(payload.level),
    powerUses: readNumber(payload.powerUses),
    excludedFromDashboard: payload.excludedFromDashboard === true,
    excludedReason: payload.excludedReason || "",
    excludedAt: parseDate(payload.excludedAt),
    ads: normalizeUserAdStats(payload)
  };
}

function computeEngagement(level, powerUses) {
  return Math.round((level * 2.5) + (powerUses * 0.6));
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

function normalizeBuildNumber(value) {
  if (value == null || value === "") return "unknown";
  return String(value).trim() || "unknown";
}

function normalizeUserAdStats(payload = {}) {
  const interstitialWatchCount = readNumber(payload.interstitialAdWatchCount);
  const rewardedWatchCount = readNumber(payload.rewardedAdWatchCount);
  const interstitialPaidImpressions = readNumber(payload.interstitialPaidImpressionCount);
  const rewardedPaidImpressions = readNumber(payload.rewardedPaidImpressionCount);
  const interstitialRevenue = microsToRevenue(payload.interstitialAdRevenueMicros);
  const rewardedRevenue = microsToRevenue(payload.rewardedAdRevenueMicros);
  const interstitialVisibleMs = readNumber(payload.interstitialAdTotalVisibleMs);
  const rewardedVisibleMs = readNumber(payload.rewardedAdTotalVisibleMs);
  const interstitialShortCloseCount = readNumber(payload.interstitialAdShortCloseCount);
  const rewardedNoRewardCloseCount = readNumber(payload.rewardedAdNoRewardCloseCount);
  const interstitialInterruptedCount = readNumber(payload.interstitialAdInterruptedCount);
  const rewardedInterruptedCount = readNumber(payload.rewardedAdInterruptedCount);

  const totalWatchCount = interstitialWatchCount + rewardedWatchCount;
  const totalPaidImpressions = interstitialPaidImpressions + rewardedPaidImpressions;
  const totalRevenue = interstitialRevenue + rewardedRevenue;
  const totalInterruptedCount = interstitialInterruptedCount + rewardedInterruptedCount;
  const rewardedStarts = rewardedWatchCount + rewardedNoRewardCloseCount;
  const totalAdCompletionsOrCloses = totalWatchCount + rewardedNoRewardCloseCount;

  return {
    interstitialWatchCount,
    rewardedWatchCount,
    interstitialPaidImpressions,
    rewardedPaidImpressions,
    interstitialRevenue,
    rewardedRevenue,
    interstitialVisibleMs,
    rewardedVisibleMs,
    interstitialShortCloseCount,
    rewardedNoRewardCloseCount,
    interstitialInterruptedCount,
    rewardedInterruptedCount,
    totalWatchCount,
    totalPaidImpressions,
    totalRevenue,
    totalInterruptedCount,
    avgInterstitialVisibleSeconds: interstitialWatchCount > 0 ? (interstitialVisibleMs / interstitialWatchCount) / 1000 : 0,
    avgRewardedVisibleSeconds: rewardedStarts > 0 ? (rewardedVisibleMs / rewardedStarts) / 1000 : 0,
    rewardedNoRewardCloseRate: rewardedStarts > 0 ? rewardedNoRewardCloseCount / rewardedStarts : 0,
    interruptedRate: totalAdCompletionsOrCloses > 0 ? totalInterruptedCount / totalAdCompletionsOrCloses : 0
  };
}

function hasMissingPaidEvent(source = {}) {
  const ads = source.ads || source;
  return readNumber(ads.totalWatchCount) > 0 && readNumber(ads.totalPaidImpressions) === 0;
}

function computeEcpm(ads = {}) {
  const paidImpressions = readNumber(ads.totalPaidImpressions);
  if (paidImpressions <= 0) return 0;
  return (readNumber(ads.totalRevenue) / paidImpressions) * 1000;
}

function microsToRevenue(value) {
  return readNumber(value) / AD_REVENUE_MICROS_DIVISOR;
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

function getUserById(userId) {
  if (!userId) return null;
  return state.users.find((u) => u.id === userId) || null;
}

// ====== Range helpers ======
function getRangeBounds() {
  const start = new Date(`${els.rangeStart.value}T00:00:00`);
  const end = new Date(`${els.rangeEnd.value}T23:59:59.999`);
  return { start, end };
}

function getInstallCohortBounds() {
  if (!els.installCohortPreset) return null;
  const preset = els.installCohortPreset.value;
  if (preset === "all") return null;
  if (preset === "same") return getRangeBounds();
  if (preset === "custom") {
    if (!els.installStart.value || !els.installEnd.value) return null;
    return {
      start: new Date(`${els.installStart.value}T00:00:00`),
      end: new Date(`${els.installEnd.value}T23:59:59.999`)
    };
  }
  const days = Number(preset);
  if (!Number.isFinite(days) || days <= 0) return null;
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function syncInstallCohortControls() {
  if (!els.installCohortPreset || !els.installStart || !els.installEnd) return;
  const preset = els.installCohortPreset.value;
  const custom = preset === "custom";
  const bounds = getInstallCohortBounds();

  els.installStart.disabled = !custom;
  els.installEnd.disabled = !custom;

  if (preset === "all") {
    els.installStart.value = "";
    els.installEnd.value = "";
    return;
  }

  if (bounds && !custom) {
    els.installStart.value = toIsoDate(bounds.start);
    els.installEnd.value = toIsoDate(bounds.end);
  } else if (custom && !els.installStart.value && !els.installEnd.value) {
    const eventBounds = getRangeBounds();
    els.installStart.value = toIsoDate(eventBounds.start);
    els.installEnd.value = toIsoDate(eventBounds.end);
  }
}

function getPreviousRangeBounds() {
  const { start, end } = getRangeBounds();
  const ms = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - ms);
  return { start: prevStart, end: prevEnd };
}

function getMetricsLoadBounds() {
  const current = getRangeBounds();
  const previous = getPreviousRangeBounds();
  return {
    start: minDate(current.start, previous.start),
    end: maxDate(current.end, previous.end)
  };
}

function isDateInRange(d, bounds) {
  if (!d || Number.isNaN(d.getTime())) return false;
  return d >= bounds.start && d <= bounds.end;
}

// ====== Filtering ======
function getUsersForPlatform() {
  const p = els.platformFilter.value;
  const c = els.countryFilter ? els.countryFilter.value : "all";
  const b = els.buildFilter ? els.buildFilter.value : "all";
  return state.users.filter((u) => {
    if (p !== "all" && u.lastSeenPlatform !== p) return false;
    if (c !== "all" && u.country !== c) return false;
    if (b !== "all" && u.buildNumber !== b) return false;
    return true;
  });
}

function applySegmentFilter(users, referenceTime = Date.now()) {
  const seg = els.segmentFilter.value;
  if (seg === "all") return users;
  if (seg === "active30m") {
    return getUsersActiveBetween(users, referenceTime - ACTIVE_30M_WINDOW_MS, referenceTime);
  }
  if (seg === "active7") {
    return users.filter((u) => u.updatedAt && (referenceTime - u.updatedAt.getTime()) <= 7 * 864e5);
  }
  if (seg === "churnrisk") {
    return users.filter((u) => !u.updatedAt || (referenceTime - u.updatedAt.getTime()) > 14 * 864e5);
  }
  return users.filter((u) => u.segment === seg);
}

function getProfileFilteredUsers(referenceTime = Date.now()) {
  return applySegmentFilter(getUsersForPlatform(), referenceTime);
}

function applyInstallCohortFilter(users) {
  const bounds = getInstallCohortBounds();
  if (!bounds) return users;
  return users.filter((u) => isDateInRange(u.createdAt, bounds));
}

function getScopedUsers(referenceTime = Date.now()) {
  return applyInstallCohortFilter(getProfileFilteredUsers(referenceTime));
}

function getActiveUsers(bounds = getRangeBounds()) {
  return getScopedUsers().filter((u) => isDateInRange(u.updatedAt, bounds));
}

function getPreviousActiveUsers() {
  return getActiveUsers(getPreviousRangeBounds());
}

function getInstalledUsers(bounds = getRangeBounds()) {
  return getProfileFilteredUsers().filter((u) => isDateInRange(u.createdAt, bounds));
}

function getDownloadUsers(bounds = getRangeBounds()) {
  return getUsersForPlatform().filter((u) => isDateInRange(u.createdAt, bounds));
}

function getUsersActiveBetween(users, startTime, endTime) {
  return users.filter((u) => {
    if (!u.updatedAt) return false;
    const updatedAt = u.updatedAt.getTime();
    return updatedAt > startTime && updatedAt <= endTime;
  });
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

function getUserDailyAdMetricsInRange(bounds = getRangeBounds()) {
  return state.userDailyAdMetrics.filter((m) =>
    !m.excludedFromDashboard && isUserDailyAdMetricInCurrentScope(m, bounds)
  );
}

function getExcludedUserDailyAdMetricsInRange(bounds = getRangeBounds()) {
  return state.userDailyAdMetrics.filter((m) =>
    m.excludedFromDashboard && isUserDailyAdMetricInCurrentScope(m, bounds)
  );
}

function isUserDailyAdMetricInCurrentScope(metric, bounds) {
  const p = els.platformFilter.value;
  const c = els.countryFilter ? els.countryFilter.value : "all";
  const b = els.buildFilter ? els.buildFilter.value : "all";
  const seg = els.segmentFilter.value;
  const segmentScoped = ["whale", "pro", "casual", "beginner"].includes(seg);
  if (!isDateInRange(metric.date, bounds)) return false;
  if (!isMetricInInstallCohort(metric)) return false;
  if (p !== "all" && metric.lastSeenPlatform !== p) return false;
  if (c !== "all" && metric.country !== c) return false;
  if (b !== "all" && metric.buildNumber !== b) return false;
  if (segmentScoped && metric.segment !== seg) return false;
  return true;
}

function isMetricInInstallCohort(metric) {
  const bounds = getInstallCohortBounds();
  if (!bounds) return true;
  const user = getUserById(metric.uid);
  const installDate = user?.createdAt || metric.installDate;
  return isDateInRange(installDate, bounds);
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
  const scoped = getScopedUsers();

  renderFilterContext(active, scoped);
  renderOverview(active, prevActive, scoped);
  renderUsersTab(active, scoped);
  renderLevelsTab(active);
  renderMarketingTab();
  renderDashboardNotice();
}

function renderFilterContext(active, scoped) {
  if (!els.filterContext) return;
  const bounds = getRangeBounds();
  const installed = getInstalledUsers(bounds);
  const installBounds = getInstallCohortBounds();
  const build = els.buildFilter ? els.buildFilter.value : "all";
  const platform = els.platformFilter.value;
  const country = els.countryFilter ? els.countryFilter.value : "all";
  const segment = els.segmentFilter.value;
  const excludedAdRows = getExcludedUserDailyAdMetricsInRange(bounds).length;
  const chips = [
    { label: "Event window", value: formatRangeLabel(bounds) },
    { label: "Install cohort", value: installBounds ? formatRangeLabel(installBounds) : "All installs" },
    { label: "Scoped profiles", value: formatNumber(scoped.length) },
    { label: "Active events", value: formatNumber(active.length) },
    { label: "Installs in event", value: formatNumber(installed.length) },
    { label: "Platform", value: platform === "all" ? "All" : platformLabel(platform) },
    { label: "Country", value: country === "all" ? "All" : countryLabel(country) },
    { label: "Build", value: build === "all" ? "All" : (build === "unknown" ? "Unknown" : build) },
    { label: "Cohort", value: segmentFilterLabel(segment) }
  ];
  if (excludedAdRows > 0) {
    chips.push({ label: "Excluded ad baselines", value: formatNumber(excludedAdRows) });
  }

  els.filterContext.innerHTML = chips.map((chip) => `
    <span class="scope-pill">
      <span>${escapeHtml(chip.label)}</span>
      <strong>${escapeHtml(chip.value)}</strong>
    </span>
  `).join("");
}

// ---- Overview ----
function renderOverview(active, prevActive, scoped) {
  const revBounds = getRangeBounds();
  const prevRevBounds = getPreviousRangeBounds();
  const metricsCurrent = getMetricsInRange(revBounds);
  const metricsPrev = getMetricsInRange(prevRevBounds);
  const dailyAdsCurrent = getUserDailyAdMetricsInRange(revBounds);

  const total = scoped.length;
  const activeCount = active.length;
  const now = Date.now();
  const active30mCount = getUsersActiveBetween(scoped, now - ACTIVE_30M_WINDOW_MS, now).length;
  const prev30mScoped = getScopedUsers(now - ACTIVE_30M_WINDOW_MS);
  const prevActive30mCount = getUsersActiveBetween(prev30mScoped, now - (2 * ACTIVE_30M_WINDOW_MS), now - ACTIVE_30M_WINDOW_MS).length;
  const avgLevel = average(active.map((u) => u.level));
  const avgEng = average(active.map((u) => u.engagementScore));
  const revenue = sum(metricsCurrent.map((m) => m.revenue || (m.adRevenue + m.iapRevenue)));

  const prevActiveCount = prevActive.length;
  const prevAvgLevel = average(prevActive.map((u) => u.level));
  const prevAvgEng = average(prevActive.map((u) => u.engagementScore));
  const prevRevenue = sum(metricsPrev.map((m) => m.revenue || (m.adRevenue + m.iapRevenue)));

  setScopedProfilesKpi(total);
  setKpi(els.kpiActiveProfiles, els.kpiActiveProfilesDelta, activeCount, prevActiveCount, "count");
  setKpi(els.kpiActive30m, els.kpiActive30mDelta, active30mCount, prevActive30mCount, "count");
  setKpi(els.kpiAvgLevel, els.kpiAvgLevelDelta, avgLevel, prevAvgLevel, "decimal");
  setKpi(els.kpiEngagement, els.kpiEngagementDelta, avgEng, prevAvgEng, "count");
  setKpi(els.kpiRevenue, els.kpiRevenueDelta, revenue, prevRevenue, "currency");
  setText(
    els.kpiRevenueCaption,
    (els.buildFilter && els.buildFilter.value !== "all") ? "Daily metrics, not build-scoped" : "Ad + IAP in window"
  );
  renderAdOverview(dailyAdsCurrent);

  const platformRows = buildPlatformRows(active);
  renderPlatformSummaryTable(platformRows);
  renderPlatformChart(platformRows);
  renderTrendChart();
  renderPulseList(active, scoped, metricsCurrent, metricsPrev);
  renderTopCountriesTable(active);
  renderBuildHealthTable(active, dailyAdsCurrent);
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

function renderBuildHealthTable(users, dailyAdRows = []) {
  if (!els.buildHealthBody) return;
  const rows = buildBuildRows(users, dailyAdRows).slice(0, 8);
  if (!rows.length) {
    els.buildHealthBody.innerHTML = `<tr><td colspan="6" class="table-empty">No active profiles in this range.</td></tr>`;
    return;
  }

  els.buildHealthBody.innerHTML = rows.map((r) => `
    <tr>
      <td><strong>${escapeHtml(r.build === "unknown" ? "Unknown" : r.build)}</strong></td>
      <td class="num">${formatNumber(r.profiles)}</td>
      <td class="num">${formatDecimal(r.avgLevel)}</td>
      <td class="num">${formatAdRevenue(r.adRevenue)}</td>
      <td class="num">${formatNumber(r.paidEvents)}</td>
      <td class="num">${formatNumber(r.interruptions)}</td>
    </tr>
  `).join("");
}

function renderAdOverview(users) {
  const summary = buildAdSummary(users);
  setText(els.adTotalRevenue, formatAdRevenue(summary.totalRevenue));
  setText(els.adPaidImpressions, formatNumber(summary.totalPaidImpressions));
  setText(els.adInterstitialWatches, formatNumber(summary.interstitialWatchCount));
  setText(els.adRewardedCompleted, formatNumber(summary.rewardedWatchCount));
  setText(els.adInterruptions, formatNumber(summary.totalInterruptedCount));
  renderAdBreakdownTable(summary);
  renderAdHealthList(summary);
}

function renderAdBreakdownTable(summary) {
  if (!els.adBreakdownBody) return;
  if (summary.userCount === 0) {
    els.adBreakdownBody.innerHTML = `<tr><td colspan="7" class="table-empty">No daily ad deltas in this range yet.</td></tr>`;
    return;
  }

  const rows = [
    {
      type: "Interstitial",
      revenue: summary.interstitialRevenue,
      paidImpressions: summary.interstitialPaidImpressions,
      completions: summary.interstitialWatchCount,
      avgVisibleSeconds: summary.avgInterstitialVisibleSeconds,
      frictionLabel: "Short closes",
      frictionCount: summary.interstitialShortCloseCount,
      interruptions: summary.interstitialInterruptedCount
    },
    {
      type: "Rewarded",
      revenue: summary.rewardedRevenue,
      paidImpressions: summary.rewardedPaidImpressions,
      completions: summary.rewardedWatchCount,
      avgVisibleSeconds: summary.avgRewardedVisibleSeconds,
      frictionLabel: "No reward closes",
      frictionCount: summary.rewardedNoRewardCloseCount,
      interruptions: summary.rewardedInterruptedCount
    }
  ];

  els.adBreakdownBody.innerHTML = rows.map((r) => `
    <tr>
      <td><strong>${escapeHtml(r.type)}</strong></td>
      <td class="num">${formatAdRevenue(r.revenue)}</td>
      <td class="num">${formatNumber(r.paidImpressions)}</td>
      <td class="num">${formatNumber(r.completions)}</td>
      <td class="num">${r.avgVisibleSeconds > 0 ? `${formatDecimal(r.avgVisibleSeconds)}s` : "—"}</td>
      <td class="num" title="${escapeHtml(r.frictionLabel)}">${formatNumber(r.frictionCount)}</td>
      <td class="num">${formatNumber(r.interruptions)}</td>
    </tr>
  `).join("");
}

function renderAdHealthList(summary) {
  if (!els.adHealthList) return;
  const hasRewardedExposure = summary.rewardedStarts > 0;
  const hasAdExposure = summary.totalAdCompletionsOrCloses > 0;
  const items = [
    {
      label: "Estimated eCPM",
      value: summary.ecpm > 0 ? formatAdRevenue(summary.ecpm) : "—",
      detail: "Revenue per 1,000 paid impressions",
      tone: summary.ecpm > 0 ? "is-positive" : "is-neutral"
    },
    {
      label: "Revenue / paid impression",
      value: summary.revenuePerPaidImpression > 0 ? formatAdRevenue(summary.revenuePerPaidImpression) : "—",
      detail: "Micros revenue divided by paid impression count",
      tone: summary.revenuePerPaidImpression > 0 ? "is-positive" : "is-neutral"
    },
    {
      label: "Reward drop-off",
      value: hasRewardedExposure ? formatPercent(summary.rewardedNoRewardCloseRate) : "—",
      detail: `${formatNumber(summary.rewardedNoRewardCloseCount)} rewarded closes before reward`,
      tone: !hasRewardedExposure ? "is-neutral" : summary.rewardedNoRewardCloseRate >= 0.2 ? "is-danger" : summary.rewardedNoRewardCloseRate > 0 ? "is-warning" : "is-positive"
    },
    {
      label: "Ad interruptions",
      value: hasAdExposure ? formatPercent(summary.interruptedRate) : "—",
      detail: `${formatNumber(summary.totalInterruptedCount)} sessions resumed after an unfinished ad`,
      tone: !hasAdExposure ? "is-neutral" : summary.interruptedRate >= 0.05 ? "is-danger" : summary.interruptedRate > 0 ? "is-warning" : "is-positive"
    },
    {
      label: "Missing paid events",
      value: formatNumber(summary.paidImpressionMissingUsers),
      detail: "User-days with ad watches but no paid impression event",
      tone: summary.paidImpressionMissingUsers > 0 ? "is-warning" : (summary.totalWatchCount > 0 ? "is-positive" : "is-neutral")
    }
  ];

  els.adHealthList.innerHTML = items.map((item) => `
    <li class="ad-health-item ${item.tone}">
      <span>
        <strong>${escapeHtml(item.label)}</strong>
        <em>${escapeHtml(item.detail)}</em>
      </span>
      <b>${escapeHtml(item.value)}</b>
    </li>
  `).join("");
}

function setKpi(valueEl, deltaEl, curr, prev, kind) {
  if (valueEl) valueEl.textContent = formatValue(curr, kind);
  setDelta(deltaEl, curr, prev);
}

function setScopedProfilesKpi(scopedCount) {
  if (els.kpiTotalProfiles) els.kpiTotalProfiles.textContent = formatNumber(scopedCount);
  if (!els.kpiTotalProfilesDelta) return;
  const allCount = state.users.length;
  let note = "—";
  if (allCount > 0) {
    note = scopedCount === allCount ? "all" : `${formatPercent(scopedCount / allCount)} of all`;
  }
  els.kpiTotalProfilesDelta.textContent = note;
  els.kpiTotalProfilesDelta.className = "kpi-delta is-neutral";
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
  const dauByDay = groupSum(metricsCurrent, (m) => toIsoDate(m.date), (m) => m.dau);
  const mauByDay = groupSum(metricsCurrent, (m) => toIsoDate(m.date), (m) => m.mau);
  const avgDau = average(Array.from(dauByDay.values()));
  const avgMau = average(Array.from(mauByDay.values()));
  const stickiness = avgMau > 0 ? (avgDau / avgMau) * 100 : 0;

  const items = [
    {
      icon: "📈",
      title: "Active rate",
      detail: `${formatNumber(active.length)} of ${formatNumber(scoped.length)} profiles active in window`,
      value: `${activeRate.toFixed(1)}%`,
      tone: scoped.length === 0 ? "is-neutral" : activeRate >= 25 ? "is-positive" : activeRate >= 10 ? "is-warning" : "is-danger"
    },
    {
      icon: "👑",
      title: "Whale share",
      detail: "Premium-segment players (L50+, heavy)",
      value: `${formatNumber(whales)}`,
      tone: whales > 0 ? "is-positive" : "is-neutral"
    },
    {
      icon: "⏳",
      title: "Churn risk",
      detail: "Profiles idle for 14+ days",
      value: `${formatNumber(churnCount)}`,
      tone: scoped.length === 0 ? "is-neutral" : churnCount === 0 ? "is-positive" : churnCount > scoped.length * 0.4 ? "is-danger" : "is-warning"
    }
  ];

  if (state.metrics.length) {
    items.push({
      icon: "💎",
      title: "ROAS",
      detail: "Revenue divided by ad spend in window",
      value: roas > 0 ? `${roas.toFixed(2)}×` : "—",
      tone: spend <= 0 ? "is-neutral" : roas >= 1.5 ? "is-positive" : roas >= 1 ? "is-warning" : "is-danger"
    });
    items.push({
      icon: "🔥",
      title: "Stickiness",
      detail: "DAU ÷ MAU over window",
      value: stickiness > 0 ? `${stickiness.toFixed(1)}%` : "—",
      tone: avgMau <= 0 ? "is-neutral" : stickiness >= 20 ? "is-positive" : stickiness >= 10 ? "is-warning" : "is-danger"
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
  renderRecencyChart(scoped);
  renderRetentionMatrix(scoped);
  renderSelectedUserDetail();
  renderUserSortChips();
  renderTopPlayersTable();
}

async function handleUserLookupSubmit() {
  if (!els.userLookupInput) return;
  const queryText = normalizeLookupText(els.userLookupInput.value);
  if (!queryText) {
    state.selectedUserId = null;
    state.selectedUser = null;
    renderUserLookupFeedback("Enter a full or partial Firebase user ID.", false);
    renderSelectedUserDetail();
    return;
  }

  const localMatches = findUsersByLookup(queryText);
  const exactLocal = localMatches.find((u) => u.id.toLowerCase() === queryText.toLowerCase());
  if (exactLocal) {
    selectUserDetail(exactLocal, "Loaded from current user snapshot.");
    return;
  }

  if (localMatches.length === 1) {
    selectUserDetail(localMatches[0], "Matched one loaded user.");
    return;
  }

  if (localMatches.length > 1) {
    renderUserLookupMatches(localMatches, queryText);
    renderUserLookupFeedback(`${formatNumber(localMatches.length)} loaded users match. Pick one below.`, false);
    return;
  }

  if (queryText.length < 12) {
    renderUserLookupFeedback("No loaded user matched. Paste the full user ID to fetch one exact document.", true);
    return;
  }

  const fetched = await fetchUserById(queryText);
  if (fetched) {
    selectUserDetail(fetched, "Fetched exact user document from Firestore.");
  } else {
    renderUserLookupFeedback("No user document found for that exact ID.", true);
  }
}

function handleUserLookupResultClick(event) {
  const button = event.target.closest("[data-user-detail-id]");
  if (!button) return;
  const user = getUserById(button.dataset.userDetailId);
  if (!user) return;
  if (els.userLookupInput) els.userLookupInput.value = user.id;
  selectUserDetail(user, "Loaded from current user snapshot.");
}

async function fetchUserById(userId) {
  const usersCollection = config.collections.users || "users";
  const snapshot = await getDoc(doc(state.db, usersCollection, userId));
  if (!snapshot.exists()) return null;
  return normalizeUser(snapshot.id, snapshot.data());
}

function selectUserDetail(user, message) {
  state.selectedUserId = user.id;
  state.selectedUser = user;
  renderUserLookupMatches([], "");
  renderUserLookupFeedback(message, false);
  renderSelectedUserDetail();
}

function renderSelectedUserDetail() {
  if (!els.userDetailBody) return;
  if (!state.selectedUserId) {
    els.userDetailBody.className = "user-detail-body user-detail-empty";
    els.userDetailBody.textContent = "No user selected.";
    return;
  }
  const user = getUserById(state.selectedUserId) || state.selectedUser;
  if (!user) {
    els.userDetailBody.className = "user-detail-body user-detail-empty";
    els.userDetailBody.textContent = "Selected user is not available in the current snapshot.";
    return;
  }

  const dailyRows = getUserDailyAdMetricsInRange(getRangeBounds()).filter((m) => m.uid === user.id);
  const dailySummary = buildAdSummary(dailyRows);
  const lifetimeAds = user.ads || normalizeUserAdStats();
  els.userDetailBody.className = "user-detail-body";
  els.userDetailBody.innerHTML = `
    <div class="user-detail-header">
      <div>
        <span class="section-kicker">Selected User</span>
        <strong>${escapeHtml(truncateId(user.id))}</strong>
      </div>
      <button type="button" class="copy-id-button user-detail-copy" data-copy-user-id="${escapeHtml(user.id)}" title="Copy full user ID">
        <code>${escapeHtml(user.id)}</code>
      </button>
    </div>
    <div class="user-detail-grid">
      ${renderUserDetailSection("Profile", [
        ["Segment", segmentLabel(user.segment)],
        ["Platform", platformLabel(user.lastSeenPlatform)],
        ["Country", countryLabel(user.country)],
        ["Build", user.buildNumber === "unknown" ? "Unknown" : user.buildNumber],
        ["Level", formatNumber(user.level)],
        ["Score", formatNumber(user.engagementScore)],
        ["Install date", formatDateTime(user.createdAt)],
        ["Last active", formatDateTime(user.updatedAt)]
      ])}
      ${renderUserDetailSection("Device & Session", [
        ["Device", user.deviceModelCode || "Unknown"],
        ["OS", user.osVersion || "Unknown"],
        ["Physical", formatBoolean(user.isPhysicalDevice)],
        ["Time zone", user.timeZone || "Unknown"],
        ["Sessions", formatNumber(user.sessionCount)],
        ["Total playtime", formatDuration(user.totalPlayTimeSeconds)],
        ["Last session", formatDuration(user.lastSessionDurationSeconds)],
        ["Last open", formatDateTime(user.lastOpenAt)]
      ])}
      ${renderUserDetailSection("Lifetime Ads", [
        ["Ad revenue", formatAdRevenue(lifetimeAds.totalRevenue)],
        ["Paid events", formatNumber(lifetimeAds.totalPaidImpressions)],
        ["Ad watches", formatNumber(lifetimeAds.totalWatchCount)],
        ["Interruptions", formatNumber(lifetimeAds.totalInterruptedCount)],
        ["Reward drop-off", formatNumber(lifetimeAds.rewardedNoRewardCloseCount)],
        ["eCPM", lifetimeAds.totalPaidImpressions > 0 ? formatAdRevenue(computeEcpm(lifetimeAds)) : "—"],
        ["Premium observed", user.revenueCatPremiumObserved ? "Yes" : "No"],
        ["Premium source", user.revenueCatPremiumObservedSource || "None"]
      ])}
      ${renderUserDetailSection("Event Window Ads", [
        ["Daily rows", formatNumber(dailyRows.length)],
        ["Ad revenue", formatAdRevenue(dailySummary.totalRevenue)],
        ["Paid events", formatNumber(dailySummary.totalPaidImpressions)],
        ["Ad watches", formatNumber(dailySummary.totalWatchCount)],
        ["Interruptions", formatNumber(dailySummary.totalInterruptedCount)],
        ["Reward drop-off", formatNumber(dailySummary.rewardedNoRewardCloseCount)],
        ["Window eCPM", dailySummary.totalPaidImpressions > 0 ? formatAdRevenue(dailySummary.ecpm) : "—"],
        ["Window", formatRangeLabel(getRangeBounds())]
      ])}
      ${renderUserDetailSection("Identifiers", [
        ["User ID", user.id],
        ["Install ID", user.installId || "Unknown"],
        ["Stable device ID", user.deviceStableId || "Unknown"],
        ["Schema", user.schemaVersion ? formatNumber(user.schemaVersion) : "Unknown"]
      ])}
    </div>
  `;
}

function renderUserDetailSection(title, rows) {
  return `
    <section class="user-detail-section">
      <h3>${escapeHtml(title)}</h3>
      <dl>
        ${rows.map(([label, value]) => `
          <div>
            <dt>${escapeHtml(label)}</dt>
            <dd>${escapeHtml(value)}</dd>
          </div>
        `).join("")}
      </dl>
    </section>
  `;
}

function renderUserLookupMatches(matches, queryText) {
  if (!els.userLookupResults) return;
  if (!matches.length) {
    els.userLookupResults.innerHTML = "";
    return;
  }
  els.userLookupResults.innerHTML = matches.slice(0, 8).map((user) => `
    <button type="button" class="lookup-result-button" data-user-detail-id="${escapeHtml(user.id)}">
      <code>${escapeHtml(truncateId(user.id))}</code>
      <span>${escapeHtml(segmentLabel(user.segment))} · ${escapeHtml(platformLabel(user.lastSeenPlatform))} · ${escapeHtml(formatDate(user.createdAt))}</span>
    </button>
  `).join("");
  if (matches.length > 8) {
    els.userLookupResults.innerHTML += `<span class="lookup-overflow">${formatNumber(matches.length - 8)} more matches hidden. Narrow "${escapeHtml(queryText)}".</span>`;
  }
}

function renderUserLookupFeedback(message, isError) {
  if (!els.userLookupFeedback) return;
  els.userLookupFeedback.textContent = message;
  els.userLookupFeedback.classList.toggle("is-error", Boolean(isError));
}

function findUsersByLookup(queryText) {
  const q = normalizeLookupText(queryText).toLowerCase();
  if (!q) return [];
  if (q.includes("...") || q.includes("…")) {
    const [start, end] = q.replace("…", "...").split("...");
    return state.users.filter((u) => {
      const id = u.id.toLowerCase();
      return (!start || id.startsWith(start)) && (!end || id.endsWith(end));
    });
  }
  return state.users.filter((u) => u.id.toLowerCase().includes(q));
}

function normalizeLookupText(value) {
  return String(value || "").trim();
}

function renderRetentionMatrix(users) {
  if (!els.retentionBody) return;
  const matrix = buildCohortMatrix(users, getRetentionInstallBounds(users));
  const haveCreatedAtRatio = matrix.totalUsers > 0 ? matrix.withCreatedAt / matrix.totalUsers : 0;

  if (els.retentionNote) {
    if (matrix.withCreatedAt === 0) {
      els.retentionNote.textContent = "No createdAt / firstSeenAt values found on user documents. Write one of those fields on first session to enable cohort retention.";
      els.retentionNote.hidden = false;
    } else {
      const notes = [
        "Uses the selected install cohort and the latest updatedAt timestamp only. Cells show the share of each cohort still seen on or after D1 / D3 / D7 / D14 / D30 — rolling retention, not exact same-day retention."
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
    els.retentionBody.innerHTML = `<tr><td colspan="7" class="table-empty">No install cohorts found for this filter window.</td></tr>`;
    return;
  }

  els.retentionBody.innerHTML = [
    ...matrix.rows.map(renderRetentionRow),
    renderRetentionRow(matrix.overall, "retention-overall")
  ].join("");
}

function getRetentionInstallBounds(users) {
  const explicitBounds = getInstallCohortBounds();
  if (explicitBounds) return explicitBounds;
  const installs = users
    .map((u) => u.createdAt)
    .filter((date) => date && !Number.isNaN(date.getTime()))
    .sort(compareDates);
  if (!installs.length) return getRangeBounds();
  return { start: installs[0], end: installs[installs.length - 1] };
}

function renderRetentionRow(row, className = "") {
  if (!row.size) {
    return `<tr class="${className || "retention-empty"}"><td>${escapeHtml(row.label)}</td><td class="num">0</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td></tr>`;
  }
  return `
    <tr class="${escapeHtml(className)}">
      <td>${escapeHtml(row.label)}</td>
      <td class="num">${formatNumber(row.size)}</td>
      <td class="num">${retentionCell(row.d1)}</td>
      <td class="num">${retentionCell(row.d3)}</td>
      <td class="num">${retentionCell(row.d7)}</td>
      <td class="num">${retentionCell(row.d14)}</td>
      <td class="num">${retentionCell(row.d30)}</td>
    </tr>
  `;
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

function renderTopPlayersTable(activeUsers = getActiveUsers(), scopedUsers = getScopedUsers()) {
  const users = getUserTableScopeUsers(activeUsers, scopedUsers);
  const rows = buildUserTableRows(users);
  const mode = getTopPlayersModeCopy(state.topMode, state.userTableScope);
  const scope = getUserTableScopeCopy(state.userTableScope);
  setText(els.topPlayersTitle, mode.title);
  setText(els.topPlayersNote, `${mode.note} ${scope.note}`);

  const columns = getUserTableColumns(state.userTableView, state.userTableScope);
  if (els.topPlayersTableHead) {
    els.topPlayersTableHead.innerHTML = `
      <tr>${columns.map((column) => `<th class="${column.num ? "num" : ""}">${escapeHtml(column.label)}</th>`).join("")}</tr>
    `;
  }

  const sorted = [...rows].sort(compareUsersForTopMode).slice(0, 30);

  if (!sorted.length) {
    els.topPlayersTableBody.innerHTML = `<tr><td colspan="${columns.length}" class="table-empty">${escapeHtml(scope.empty)}</td></tr>`;
    return;
  }

  els.topPlayersTableBody.innerHTML = sorted.map((u) => `
    <tr>
      ${columns.map((column) => `<td class="${column.num ? "num" : ""}">${column.render(u)}</td>`).join("")}
    </tr>
  `).join("");
}

function getUserTableScopeUsers(activeUsers, scopedUsers) {
  if (state.userTableScope === "profile") return scopedUsers;
  return activeUsers;
}

function buildUserTableRows(users) {
  if (state.userTableScope !== "event") return users;
  const eventAdSummaries = buildUserEventAdSummaryMap();
  return users.map((user) => ({
    ...user,
    ads: eventAdSummaries.get(user.id) || normalizeUserAdStats()
  }));
}

function buildUserEventAdSummaryMap() {
  const buckets = new Map();
  getUserDailyAdMetricsInRange(getRangeBounds()).forEach((metric) => {
    if (!metric.uid) return;
    if (!buckets.has(metric.uid)) buckets.set(metric.uid, []);
    buckets.get(metric.uid).push(metric);
  });

  const summaries = new Map();
  buckets.forEach((rows, uid) => {
    summaries.set(uid, buildAdSummary(rows));
  });
  return summaries;
}

function renderUserSortChips() {
  if (!els.topPlayersChips) return;
  const sorts = USER_TABLE_SORTS[state.userTableView] || USER_TABLE_SORTS.players;
  if (!sorts.some((sort) => sort.mode === state.topMode)) {
    state.topMode = sorts[0].mode;
  }
  els.topPlayersChips.innerHTML = sorts.map((sort) => `
    <button type="button" class="chip ${sort.mode === state.topMode ? "is-active" : ""}" data-top="${escapeHtml(sort.mode)}">${escapeHtml(sort.label)}</button>
  `).join("");
}

function defaultTopModeForView(view) {
  const sorts = USER_TABLE_SORTS[view] || USER_TABLE_SORTS.players;
  return sorts[0].mode;
}

function compareUsersForTopMode(a, b) {
  if (state.topMode === "level") return b.level - a.level;
  if (state.topMode === "powers") return b.powerUses - a.powerUses;
  if (state.topMode === "adRevenue") return b.ads.totalRevenue - a.ads.totalRevenue;
  if (state.topMode === "paidEvents") return b.ads.totalPaidImpressions - a.ads.totalPaidImpressions;
  if (state.topMode === "adExposure") return b.ads.totalWatchCount - a.ads.totalWatchCount;
  if (state.topMode === "interruptions") return b.ads.totalInterruptedCount - a.ads.totalInterruptedCount;
  if (state.topMode === "missingPaid") {
    const missingDiff = Number(hasMissingPaidEvent(b)) - Number(hasMissingPaidEvent(a));
    return missingDiff || (b.ads.totalWatchCount - a.ads.totalWatchCount);
  }
  if (state.topMode === "rewardDropOff") return b.ads.rewardedNoRewardCloseCount - a.ads.rewardedNoRewardCloseCount;
  if (state.topMode === "recent") return compareDates(b.updatedAt, a.updatedAt);
  return b.engagementScore - a.engagementScore;
}

function getUserTableColumns(view, scope = state.userTableScope) {
  const eventScope = scope === "event";
  const adLabelPrefix = eventScope ? "Event " : "Lifetime ";
  const common = {
    userId: { label: "User ID", render: renderUserIdCell },
    segment: { label: "Segment", render: (u) => `<span class="segment-pill ${u.segment}">${segmentLabel(u.segment)}</span>` },
    platform: { label: "Platform", render: (u) => `<span class="platform-pill ${u.lastSeenPlatform}">${platformLabel(u.lastSeenPlatform)}</span>` },
    country: { label: "Country", render: (u) => `<span class="country-cell" title="${escapeHtml(countryLabel(u.country))}">${countryFlag(u.country)} <strong>${escapeHtml(countryLabel(u.country))}</strong></span>` },
    build: { label: "Build", num: true, render: (u) => u.buildNumber === "unknown" ? "—" : escapeHtml(u.buildNumber) },
    level: { label: "Level", num: true, render: (u) => formatNumber(u.level) },
    score: { label: "Score", num: true, render: (u) => formatNumber(u.engagementScore) },
    lastActive: { label: "Last Active", render: (u) => formatDateTime(u.updatedAt) },
    installDate: { label: "Install Date", render: (u) => formatDate(u.createdAt) }
  };

  if (view === "monetization") {
    return [
      common.userId, common.platform, common.country, common.build, common.level,
      { label: `${adLabelPrefix}Ad Revenue`, num: true, render: (u) => formatAdRevenue(u.ads.totalRevenue) },
      { label: `${adLabelPrefix}Paid Events`, num: true, render: (u) => formatNumber(u.ads.totalPaidImpressions) },
      { label: `${adLabelPrefix}Ad Watches`, num: true, render: (u) => formatNumber(u.ads.totalWatchCount) },
      { label: `${eventScope ? "Event" : "Lifetime"} eCPM`, num: true, render: (u) => formatAdRevenue(computeEcpm(u.ads)) },
      { label: "Flags", render: renderAdFlags },
      common.lastActive
    ];
  }

  if (view === "adHealth") {
    return [
      common.userId, common.build,
      { label: `${adLabelPrefix}Interruptions`, num: true, render: (u) => formatNumber(u.ads.totalInterruptedCount) },
      { label: `${adLabelPrefix}Reward Drop-off`, num: true, render: (u) => formatNumber(u.ads.rewardedNoRewardCloseCount) },
      { label: `${adLabelPrefix}Short Closes`, num: true, render: (u) => formatNumber(u.ads.interstitialShortCloseCount) },
      { label: "Missing Paid", render: (u) => hasMissingPaidEvent(u) ? `<span class="ad-flag warning">Yes</span>` : `<span class="ad-flag-empty">—</span>` },
      { label: "Avg Interstitial", num: true, render: (u) => u.ads.avgInterstitialVisibleSeconds > 0 ? `${formatDecimal(u.ads.avgInterstitialVisibleSeconds)}s` : "—" },
      { label: "Avg Rewarded", num: true, render: (u) => u.ads.avgRewardedVisibleSeconds > 0 ? `${formatDecimal(u.ads.avgRewardedVisibleSeconds)}s` : "—" },
      { label: "Flags", render: renderAdFlags },
      common.lastActive
    ];
  }

  if (view === "progression") {
    return [
      common.userId, common.segment, common.level,
      { label: "Hints", num: true, render: (u) => formatNumber(u.hintCount) },
      { label: "Shuffles", num: true, render: (u) => formatNumber(u.shuffleCount) },
      { label: "Undos", num: true, render: (u) => formatNumber(u.undoCount) },
      common.score, common.installDate, common.lastActive
    ];
  }

  return [
    common.userId, common.segment, common.platform, common.country, common.build,
    common.level, common.score, common.lastActive
  ];
}

function renderUserIdCell(user) {
  return `
    <button
      type="button"
      class="copy-id-button"
      data-copy-user-id="${escapeHtml(user.id)}"
      title="Copy full user ID"
      aria-label="Copy full user ID ${escapeHtml(truncateId(user.id))}"
    >
      <code>${escapeHtml(truncateId(user.id))}</code>
    </button>
  `;
}

function getTopPlayersModeCopy(mode, scope = state.userTableScope) {
  const eventScope = scope === "event";
  const copy = {
    level: {
      title: eventScope ? "Highest level in event window" : "Highest level by install date",
      note: "Sorted by current user profile level."
    },
    powers: {
      title: eventScope ? "Highest power usage in event window" : "Highest power usage by install date",
      note: "Sorted by cumulative hints, shuffles, and undos on user profiles."
    },
    adRevenue: {
      title: eventScope ? "Highest event-window ad revenue" : "Highest lifetime ad revenue by install date",
      note: eventScope
        ? "Sorted by daily ad revenue deltas from RevenueMicros / 1,000,000."
        : "Sorted by cumulative user ad revenue from RevenueMicros / 1,000,000."
    },
    paidEvents: {
      title: eventScope ? "Highest event-window paid ad events" : "Highest lifetime paid ad events by install date",
      note: eventScope
        ? "Sorted by daily AdMob paid impression deltas."
        : "Sorted by cumulative AdMob paid impression callbacks on user profiles."
    },
    adExposure: {
      title: eventScope ? "Highest event-window ad exposure" : "Highest lifetime ad exposure by install date",
      note: eventScope
        ? "Sorted by daily interstitial watches plus rewarded completions."
        : "Sorted by cumulative interstitial watches plus rewarded completions."
    },
    interruptions: {
      title: eventScope ? "Most event-window ad interruptions" : "Most lifetime ad interruptions by install date",
      note: eventScope
        ? "Sorted by daily unfinished ad session deltas."
        : "Sorted by cumulative unfinished ad sessions detected on the next app open."
    },
    missingPaid: {
      title: eventScope ? "Event-window missing paid-event users" : "Missing paid-event users by install date",
      note: eventScope
        ? "Shows event-active users with ad watches but no paid impression callbacks in the selected window first."
        : "Shows cumulative user profiles with ad watches but no paid impression callbacks first."
    },
    rewardDropOff: {
      title: eventScope ? "Highest event-window rewarded drop-off" : "Highest lifetime rewarded drop-off by install date",
      note: eventScope
        ? "Sorted by daily rewarded ads closed before reward."
        : "Sorted by cumulative rewarded ads closed before reward."
    },
    recent: {
      title: eventScope ? "Recently active players in event window" : "Recently active players by install date",
      note: "Sorted by latest profile update."
    },
    engagement: {
      title: eventScope ? "Highest engagement in event window" : "Highest engagement by install date",
      note: "Sorted by weighted level and power usage."
    }
  };
  return copy[mode] || copy.engagement;
}

function getUserTableScopeCopy(scope = state.userTableScope) {
  if (scope === "profile") {
    return {
      note: "All profiles shows loaded users matching the selected install cohort, profile cohort, platform, country, and build; ad columns use lifetime user fields.",
      empty: "No players match this install cohort and profile filter set."
    };
  }
  return {
    note: "Event-active shows users whose latest profile update is inside the selected event window after install cohort, profile cohort, platform, country, and build filters; ad columns use event-window daily deltas.",
    empty: "No players were active in this event window after the selected install cohort and profile filters."
  };
}

function renderAdFlags(user) {
  const ads = user.ads || normalizeUserAdStats();
  const flags = [];
  if (ads.totalRevenue > 0) flags.push({ label: "Revenue", tone: "success", title: "RevenueMicros is above zero" });
  if (ads.totalWatchCount >= 5) flags.push({ label: "High exposure", tone: "neutral", title: "Five or more completed/closed ad watches" });
  if (hasMissingPaidEvent(ads)) flags.push({ label: "No paid event", tone: "warning", title: "Ad watch exists but paid impression count is zero" });
  if (ads.rewardedNoRewardCloseCount > 0) flags.push({ label: "Reward drop-off", tone: "warning", title: "Rewarded ad closed before reward" });
  if (ads.totalInterruptedCount > 0) flags.push({ label: "Interrupted", tone: "danger", title: "App resumed after an unfinished ad" });
  if (!flags.length) return `<span class="ad-flag-empty">—</span>`;
  return `<span class="ad-flag-list">${flags.map((flag) =>
    `<span class="ad-flag ${flag.tone}" title="${escapeHtml(flag.title)}">${escapeHtml(flag.label)}</span>`
  ).join("")}</span>`;
}

async function handleTopPlayersTableClick(event) {
  const button = event.target.closest("[data-copy-user-id]");
  if (!button) return;

  const userId = button.dataset.copyUserId;
  if (!userId) return;

  const copied = await copyText(userId);
  const originalTitle = button.title || "Copy full user ID";
  button.classList.toggle("is-copied", copied);
  button.title = copied ? "Copied" : "Copy failed";

  window.setTimeout(() => {
    button.classList.remove("is-copied");
    button.title = originalTitle;
  }, 1200);
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
      avgPowers: average(members.map((u) => u.powerUses))
    };
  });
}

function renderProgressionFunnel(active) {
  if (!els.progressionFunnel) return;

  if (!active.length) {
    els.progressionFunnel.classList.remove("is-detailed");
    els.progressionFunnel.innerHTML = `<div class="funnel-empty">No active players in this window.</div>`;
    return;
  }

  if (state.levelFunnelMode === "detailed") {
    renderDetailedProgressionFunnel(active);
    return;
  }

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
  els.progressionFunnel.classList.remove("is-detailed");
  els.progressionFunnel.innerHTML = html;
}

function renderDetailedProgressionFunnel(active) {
  const counts = new Map();
  active.forEach((u) => {
    const level = Math.max(0, Math.floor(u.level || 0));
    counts.set(level, (counts.get(level) || 0) + 1);
  });

  const maxLevel = Math.max(0, ...counts.keys());
  const peakCount = Math.max(1, ...counts.values());
  const total = active.length || 1;
  const rows = [];

  for (let level = 0; level <= maxLevel; level++) {
    const count = counts.get(level) || 0;
    const width = peakCount > 0 ? (count / peakCount) * 100 : 0;
    const share = total > 0 ? (count / total) * 100 : 0;
    rows.push(`
      <div class="funnel-row">
        <span class="funnel-label">L${level}</span>
        <span class="funnel-bar"><span class="funnel-bar-fill" style="width:${width}%"></span></span>
        <span class="funnel-count">${formatNumber(count)} · ${share.toFixed(1)}%</span>
      </div>
    `);
  }

  els.progressionFunnel.classList.add("is-detailed");
  els.progressionFunnel.innerHTML = rows.join("");
}

function renderLevelCohortTable(levelRows, active) {
  const total = active.length || 1;
  if (!levelRows.some((r) => r.count > 0)) {
    els.levelCohortBody.innerHTML = `<tr><td colspan="4" class="table-empty">No active players in this window.</td></tr>`;
    return;
  }
  els.levelCohortBody.innerHTML = levelRows.map((row) => `
    <tr>
      <td>${escapeHtml(row.label)}</td>
      <td class="num">${formatNumber(row.count)}</td>
      <td class="num">${((row.count / total) * 100).toFixed(1)}%</td>
      <td class="num">${formatDecimal(row.avgPowers)}</td>
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
  const dauByDay = groupSum(current, (m) => toIsoDate(m.date), (m) => m.dau);
  const dauDays = sum(Array.from(dauByDay.values()));
  const arpdau = dauDays > 0 ? revenue / dauDays : 0;

  setKpi(els.mkRevenue, els.mkRevenueDelta, revenue, prevRev, "currency");
  setKpi(els.mkSpend, els.mkSpendDelta, spend, prevSpend, "currency");
  setKpi(els.mkDownloads, els.mkDownloadsDelta, downloads, prevDl, "count");
  els.mkRoas.textContent = spend > 0 ? `${roas.toFixed(2)}×` : "—";
  setDelta(els.mkRoasDelta, roas, prevRoas);
  els.mkCpi.textContent = formatCurrency(cpi);
  els.mkArpdau.textContent = formatCurrency(arpdau);
  renderMarketingScopeNote(current);

  renderRevenueStackChart(current, bounds);
  renderSpendRevenueChart(current, bounds);
  renderStickinessChart(current, bounds);
  renderMarketingPlatformTable(current);
  renderCountryMarketingTable(current);
  renderGamesTable(current);
}

function renderMarketingScopeNote(metrics) {
  if (!els.marketingScopeNote) return;
  const notes = [];
  const build = els.buildFilter ? els.buildFilter.value : "all";
  const country = els.countryFilter ? els.countryFilter.value : "all";

  if (build !== "all") {
    notes.push("Build filter is user-scoped; these Marketing KPIs still use all build rows because studioDailyMetrics has no buildNumber field.");
  }
  if (country !== "all" && !metrics.some((m) => m.country && m.country !== "unknown")) {
    notes.push("Country filter is active, but daily metric rows in this window do not carry country yet.");
  }

  els.marketingScopeNote.hidden = notes.length === 0;
  els.marketingScopeNote.textContent = notes.join(" ");
}

function renderCountryMarketingTable(metrics) {
  if (!els.countryMarketingBody) return;
  const selectedCountry = els.countryFilter ? els.countryFilter.value : "all";
  const coverage = getMetricCountryCoverage(getRangeBounds());
  const hasCountry = metrics.some((m) => m.country && m.country !== "unknown");

  if (selectedCountry !== "all" && coverage.total > 0 && coverage.known === 0) {
    els.countryMarketingBody.innerHTML = `<tr><td colspan="5" class="table-empty">Country filter is active, but no daily metric rows in this window carry <code>downloadCountry</code> / <code>country</code> yet.</td></tr>`;
    return;
  }
  if (!hasCountry) {
    els.countryMarketingBody.innerHTML = `<tr><td colspan="5" class="table-empty">No country field on daily metrics yet. Add <code>downloadCountry</code> (from Play Console or App Store Connect exports) to studioDailyMetrics docs to unlock per-country revenue/ROAS.</td></tr>`;
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
    setText(els.trendTitle, "Daily revenue");
    color = PALETTE.green;
    fillColor = "rgba(142, 214, 175, 0.18)";
  } else if (state.trendMode === "downloads") {
    const byDay = groupSum(getDownloadUsers(bounds), (u) => toIsoDate(u.createdAt), () => 1);
    data = days.map((d) => byDay.get(d) || 0);
    label = "Installs";
    setText(els.trendTitle, "Daily installs");
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
    setText(els.trendTitle, "Daily active players");
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
      datasets: [{
        label: "Avg power uses",
        data: rows.map((r) => Number(r.avgPowers.toFixed(1))),
        backgroundColor: "rgba(231, 201, 138, 0.8)",
        borderRadius: 8,
        maxBarThickness: 36
      }]
    },
    options: barChartOptions()
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
function buildCohortMatrix(users, bounds) {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  const rangeStart = startOfDay(bounds.start);
  const rangeEnd = endOfDay(bounds.end);
  const firstWeekStart = startOfWeek(rangeStart);
  const weeks = [];
  for (let start = firstWeekStart; start <= rangeEnd; start = addDays(start, 7)) {
    const end = endOfDay(addDays(start, 6));
    weeks.push({ start, end });
  }

  let withCreatedAt = 0;
  users.forEach((u) => { if (u.createdAt) withCreatedAt++; });

  const rows = weeks.map((week) => {
    const cohortStart = maxDate(week.start, rangeStart);
    const cohortEnd = minDate(week.end, rangeEnd);
    const cohort = users.filter((u) => u.createdAt && u.createdAt >= cohortStart && u.createdAt <= cohortEnd);
    return buildRetentionRow(shortWeekLabel(week.start), cohort, week.start, week.end, now);
  });

  const overallCohort = users.filter((u) => u.createdAt && u.createdAt >= rangeStart && u.createdAt <= rangeEnd);
  const overall = buildRetentionRow("Overall", overallCohort, rangeStart, rangeEnd, now);

  return { rows, overall, withCreatedAt, totalUsers: users.length };
}

function buildRetentionRow(label, cohort, start, end, now) {
  const size = cohort.length;
  return {
    label,
    start,
    end,
    size,
    d1: buildCohortMilestone(cohort, 1, now),
    d3: buildCohortMilestone(cohort, 3, now),
    d7: buildCohortMilestone(cohort, 7, now),
    d14: buildCohortMilestone(cohort, 14, now),
    d30: buildCohortMilestone(cohort, 30, now)
  };
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeek(date) {
  const d = startOfDay(date);
  const day = d.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - daysSinceMonday);
  return d;
}

function maxDate(a, b) {
  return a > b ? a : b;
}

function minDate(a, b) {
  return a < b ? a : b;
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

function buildBuildRows(users, dailyAdRows = []) {
  const map = new Map();
  const activeBuildByUserId = new Map();
  users.forEach((u) => {
    const key = u.buildNumber || "unknown";
    activeBuildByUserId.set(u.id, key);
    const entry = map.get(key) || {
      build: key,
      profiles: 0,
      levelSum: 0,
      adRevenue: 0,
      paidEvents: 0,
      interruptions: 0
    };
    entry.profiles++;
    entry.levelSum += u.level;
    map.set(key, entry);
  });

  dailyAdRows.forEach((metric) => {
    if (!metric.uid || !activeBuildByUserId.has(metric.uid)) return;
    const key = activeBuildByUserId.get(metric.uid) || metric.buildNumber || "unknown";
    const entry = map.get(key);
    if (!entry) return;
    const ads = metric.ads || normalizeUserAdStats();
    entry.adRevenue += ads.totalRevenue;
    entry.paidEvents += ads.totalPaidImpressions;
    entry.interruptions += ads.totalInterruptedCount;
  });

  return Array.from(map.values())
    .map((e) => ({
      ...e,
      avgLevel: e.profiles ? e.levelSum / e.profiles : 0
    }))
    .sort((a, b) => {
      if (a.build === "unknown") return 1;
      if (b.build === "unknown") return -1;
      return Number(b.build) - Number(a.build) || b.build.localeCompare(a.build);
    });
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
    const entry = map.get(key) || { platform: key, profiles: 0, levelSum: 0, powerSum: 0 };
    entry.profiles++;
    entry.levelSum += u.level;
    entry.powerSum += u.powerUses;
    map.set(key, entry);
  });
  return Array.from(map.values()).map((e) => ({
    platform: e.platform,
    profiles: e.profiles,
    avgLevel: e.profiles ? e.levelSum / e.profiles : 0,
    avgPowerUses: e.profiles ? e.powerSum / e.profiles : 0
  })).sort((a, b) => b.profiles - a.profiles);
}

function buildAdSummary(users) {
  const summary = {
    userCount: users.length,
    interstitialWatchCount: 0,
    rewardedWatchCount: 0,
    interstitialPaidImpressions: 0,
    rewardedPaidImpressions: 0,
    interstitialRevenue: 0,
    rewardedRevenue: 0,
    interstitialVisibleMs: 0,
    rewardedVisibleMs: 0,
    interstitialShortCloseCount: 0,
    rewardedNoRewardCloseCount: 0,
    interstitialInterruptedCount: 0,
    rewardedInterruptedCount: 0,
    paidImpressionMissingUsers: 0
  };

  users.forEach((u) => {
    const ads = u.ads || normalizeUserAdStats();
    summary.interstitialWatchCount += ads.interstitialWatchCount;
    summary.rewardedWatchCount += ads.rewardedWatchCount;
    summary.interstitialPaidImpressions += ads.interstitialPaidImpressions;
    summary.rewardedPaidImpressions += ads.rewardedPaidImpressions;
    summary.interstitialRevenue += ads.interstitialRevenue;
    summary.rewardedRevenue += ads.rewardedRevenue;
    summary.interstitialVisibleMs += ads.interstitialVisibleMs;
    summary.rewardedVisibleMs += ads.rewardedVisibleMs;
    summary.interstitialShortCloseCount += ads.interstitialShortCloseCount;
    summary.rewardedNoRewardCloseCount += ads.rewardedNoRewardCloseCount;
    summary.interstitialInterruptedCount += ads.interstitialInterruptedCount;
    summary.rewardedInterruptedCount += ads.rewardedInterruptedCount;
    if (hasMissingPaidEvent(ads)) {
      summary.paidImpressionMissingUsers++;
    }
  });

  summary.totalWatchCount = summary.interstitialWatchCount + summary.rewardedWatchCount;
  summary.totalPaidImpressions = summary.interstitialPaidImpressions + summary.rewardedPaidImpressions;
  summary.totalRevenue = summary.interstitialRevenue + summary.rewardedRevenue;
  summary.totalInterruptedCount = summary.interstitialInterruptedCount + summary.rewardedInterruptedCount;
  summary.avgInterstitialVisibleSeconds = summary.interstitialWatchCount > 0
    ? (summary.interstitialVisibleMs / summary.interstitialWatchCount) / 1000
    : 0;
  summary.rewardedStarts = summary.rewardedWatchCount + summary.rewardedNoRewardCloseCount;
  summary.avgRewardedVisibleSeconds = summary.rewardedStarts > 0
    ? (summary.rewardedVisibleMs / summary.rewardedStarts) / 1000
    : 0;
  summary.rewardedNoRewardCloseRate = summary.rewardedStarts > 0
    ? summary.rewardedNoRewardCloseCount / summary.rewardedStarts
    : 0;
  summary.totalAdCompletionsOrCloses = summary.totalWatchCount + summary.rewardedNoRewardCloseCount;
  summary.interruptedRate = summary.totalAdCompletionsOrCloses > 0
    ? summary.totalInterruptedCount / summary.totalAdCompletionsOrCloses
    : 0;
  summary.revenuePerPaidImpression = summary.totalPaidImpressions > 0
    ? summary.totalRevenue / summary.totalPaidImpressions
    : 0;
  summary.ecpm = computeEcpm(summary);

  return summary;
}

function renderPlatformSummaryTable(rows) {
  if (!rows.length) {
    els.summaryTableBody.innerHTML = `<tr><td colspan="5" class="table-empty">No active profiles in this range yet.</td></tr>`;
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

function handlePresetChange() {
  setDateRangeFromPreset(Number(els.rangePreset.value));
  syncInstallCohortControls();
  refreshWindowMetricsForRange().catch(handleDashboardError);
}

function handleManualRangeChange() {
  els.rangePreset.value = "";
  syncInstallCohortControls();
  refreshWindowMetricsForRange().catch(handleDashboardError);
}

function handleInstallCohortPresetChange() {
  syncInstallCohortControls();
  renderDashboard();
}

function handleInstallCohortManualRangeChange() {
  if (els.installCohortPreset) els.installCohortPreset.value = "custom";
  syncInstallCohortControls();
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

function setText(element, value) {
  if (element) element.textContent = value;
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

function formatPercent(ratio) {
  const pct = (Number(ratio) || 0) * 100;
  return `${pct.toFixed(pct >= 10 ? 0 : 1)}%`;
}

function formatBoolean(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "Unknown";
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (!total) return "0s";
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function formatCurrency(v) {
  const num = Number(v) || 0;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: config.dashboard.currency || "USD",
    maximumFractionDigits: num >= 1000 ? 0 : 2
  }).format(num);
}

function formatAdRevenue(v) {
  const num = Number(v) || 0;
  const maximumFractionDigits = num > 0 && num < 0.01 ? 6 : (num >= 1000 ? 0 : 2);
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: config.dashboard.currency || "USD",
    maximumFractionDigits
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

function formatDate(date) {
  if (!date || Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeZone: config.dashboard.timezone || "UTC"
  }).format(date);
}

function formatRangeLabel(bounds) {
  return `${formatShortDate(toIsoDate(bounds.start))} - ${formatShortDate(toIsoDate(bounds.end))}`;
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

function segmentFilterLabel(seg) {
  const map = {
    all: "All",
    whale: "Whales",
    pro: "Pro",
    casual: "Casual",
    beginner: "Beginner",
    active30m: "Active 30m",
    active7: "Active 7d",
    churnrisk: "Churn risk"
  };
  return map[seg] || seg || "All";
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

async function copyText(value) {
  if (!value) return false;
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall through to the legacy copy path.
    }
  }

  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "absolute";
  input.style.left = "-9999px";
  document.body.appendChild(input);
  input.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }

  document.body.removeChild(input);
  return copied;
}
