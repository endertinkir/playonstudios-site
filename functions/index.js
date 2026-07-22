const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const { logger } = require("firebase-functions");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");

admin.initializeApp();

const db = admin.firestore();
const DASHBOARD_TIME_ZONE = "Europe/Istanbul";

const AD_DELTA_FIELDS = [
  "interstitialAdWatchCount",
  "rewardedAdWatchCount",
  "interstitialPaidImpressionCount",
  "rewardedPaidImpressionCount",
  "interstitialAdRevenueMicros",
  "rewardedAdRevenueMicros",
  "interstitialAdTotalVisibleMs",
  "rewardedAdTotalVisibleMs",
  "interstitialAdShortCloseCount",
  "rewardedAdNoRewardCloseCount",
  "interstitialAdInterruptedCount",
  "rewardedAdInterruptedCount"
];

exports.rollupUserDailyAdMetrics = onDocumentWritten(
  {
    document: "users/{userId}",
    region: "europe-west1"
  },
  async (event) => {
    if (!event.data?.after.exists) return null;

    const userId = event.params.userId;
    const before = event.data.before.exists ? event.data.before.data() : {};
    const after = event.data.after.data() || {};
    const deltas = buildPositiveDeltas(before, after);

    if (!deltas.hasPositiveDelta) return null;
    if (isLegacyMigrationAdBaseline(event.data.before.exists, before, after, deltas)) {
      logger.info("Skipped legacy migration ad metric baseline", {
        userId,
        date: dateKeyForEvent(event.time),
        legacyUid: after.legacyUid || null
      });
      return null;
    }

    const eventDate = dateKeyForEvent(event.time);
    const platform = normalizePlatform(after.lastSeenPlatform);
    const country = normalizeCountry(
      after.installCountry ||
      after.downloadCountry ||
      after.storeCountry ||
      after.country ||
      after.countryCode ||
      after.lastSeenCountry
    );
    const buildNumber = normalizeBuildNumber(after.buildNumber);
    const installDateKey = dateKeyForUserInstall(after);
    const segment = computeSegment(readNumber(after.level), readNumber(after.hintCount) + readNumber(after.shuffleCount) + readNumber(after.undoCount));
    const docId = [
      eventDate,
      safeSegment(platform),
      safeSegment(country),
      safeSegment(buildNumber),
      safeSegment(segment),
      safeSegment(userId)
    ].join("__");

    const ref = db.collection("userDailyAdMetrics").doc(docId);
    const eventRef = db.collection("userDailyAdMetricRollupEvents").doc(safeSegment(event.id || `${userId}_${event.time}`));
    const increments = {};
    AD_DELTA_FIELDS.forEach((field) => {
      if (deltas[field] > 0) increments[field] = FieldValue.increment(deltas[field]);
    });

    await db.runTransaction(async (transaction) => {
      const existingEvent = await transaction.get(eventRef);
      if (existingEvent.exists) return;

      transaction.create(eventRef, {
        userId,
        date: eventDate,
        source: "users-delta-rollup",
        createdAt: FieldValue.serverTimestamp()
      });
      transaction.set(ref, {
        ...increments,
        uid: userId,
        date: eventDate,
        platform,
        country,
        buildNumber,
        installDateKey,
        segment,
        level: readNumber(after.level),
        powerUses: readNumber(after.hintCount) + readNumber(after.shuffleCount) + readNumber(after.undoCount),
        lastUserUpdatedAt: normalizeTimestamp(after.updatedAt),
        updatedAt: FieldValue.serverTimestamp(),
        source: "users-delta-rollup",
        timeZone: DASHBOARD_TIME_ZONE
      }, { merge: true });
    });

    logger.info("Rolled up user daily ad metrics", {
      userId,
      date: eventDate,
      platform,
      country,
      buildNumber,
      segment
    });
    return null;
  }
);

function buildPositiveDeltas(before, after) {
  const deltas = { hasPositiveDelta: false };
  AD_DELTA_FIELDS.forEach((field) => {
    const delta = readNumber(after[field]) - readNumber(before[field]);
    const positiveDelta = delta > 0 ? delta : 0;
    deltas[field] = positiveDelta;
    if (positiveDelta > 0) deltas.hasPositiveDelta = true;
  });
  return deltas;
}

function isLegacyMigrationAdBaseline(beforeExists, before, after, deltas) {
  if (!hasLegacyUid(after)) return false;
  if (!deltas.hasPositiveDelta) return false;
  if (!beforeExists) return true;
  if (hasAnyAdMetricField(before)) return false;
  return hasAnyAdMetricField(after);
}

function hasLegacyUid(payload = {}) {
  return typeof payload.legacyUid === "string" && payload.legacyUid.trim().length > 0;
}

function hasAnyAdMetricField(payload = {}) {
  return AD_DELTA_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(payload, field));
}

function dateKeyForEvent(eventTime) {
  const date = eventTime ? new Date(eventTime) : new Date();
  return dateKeyForDate(date);
}

function dateKeyForUserInstall(user) {
  const installDate =
    normalizeDate(user.createdAt) ||
    normalizeDate(user.firstSeenAt) ||
    normalizeDate(user.installDate);
  return installDate ? dateKeyForDate(installDate) : null;
}

function dateKeyForDate(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DASHBOARD_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function normalizeDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function normalizeTimestamp(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value;
  if (value instanceof Date) return admin.firestore.Timestamp.fromDate(value);
  return null;
}

function normalizePlatform(value) {
  if (!value) return "unknown";
  const s = String(value).toLowerCase();
  if (s.includes("android")) return "android";
  if (s.includes("ios") || s.includes("iphone") || s.includes("ipad")) return "ios";
  return s || "unknown";
}

function normalizeCountry(value) {
  if (!value) return "unknown";
  const s = String(value).trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(s)) return s;
  const map = {
    USA: "US",
    GBR: "GB",
    TUR: "TR",
    DEU: "DE",
    FRA: "FR",
    ESP: "ES",
    ITA: "IT",
    RUS: "RU",
    JPN: "JP",
    KOR: "KR",
    CHN: "CN",
    IND: "IN",
    BRA: "BR",
    MEX: "MX",
    CAN: "CA",
    AUS: "AU",
    NLD: "NL"
  };
  if (/^[A-Z]{3}$/.test(s)) return map[s] || s.slice(0, 2);
  return "unknown";
}

function normalizeBuildNumber(value) {
  if (value == null || value === "") return "unknown";
  return String(value).trim() || "unknown";
}

function computeSegment(level, powerUses) {
  if (level >= 50 && powerUses >= 20) return "whale";
  if (level >= 20) return "pro";
  if (level >= 5) return "casual";
  return "beginner";
}

function safeSegment(value) {
  return encodeURIComponent(String(value || "unknown")).replace(/\./g, "%2E");
}

function readNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}
