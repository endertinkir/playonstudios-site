#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const admin = require("../functions/node_modules/firebase-admin");

const AD_FIELDS = [
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

const args = parseArgs(process.argv.slice(2));
const dates = normalizeDates(args.date || args.dates);
const apply = args.apply === true;
const projectId = args.project || process.env.GCLOUD_PROJECT || readFirebaseProjectId();

if (!dates.length) {
  fail("Pass --date=YYYY-MM-DD. Use --date=a,b for multiple dates.");
}

if (!projectId) {
  fail("Firebase project could not be resolved. Pass --project=PROJECT_ID.");
}

admin.initializeApp({ projectId });
const db = admin.firestore();

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const totals = {
    scannedRows: 0,
    candidateRows: 0,
    alreadyExcludedRows: 0,
    revenueMicros: 0,
    paidEvents: 0,
    adWatches: 0,
    interruptions: 0
  };

  for (const date of dates) {
    const rows = await loadDailyRows(date);
    totals.scannedRows += rows.length;
    const users = await loadUsers(rows.map((row) => row.data.uid).filter(Boolean));

    const candidates = rows.filter((row) => {
      const user = users.get(row.data.uid);
      if (!user || !hasLegacyUid(user)) return false;
      if (row.data.excludedFromDashboard === true) {
        totals.alreadyExcludedRows++;
        return false;
      }
      return hasPositiveAdMetric(row.data);
    });

    candidates.forEach((row) => addToTotals(totals, row.data));
    totals.candidateRows += candidates.length;

    console.log(`${date}: scanned ${rows.length}, legacy baseline candidates ${candidates.length}`);
    if (apply && candidates.length) {
      await markExcluded(candidates, date);
      console.log(`${date}: marked ${candidates.length} rows as excludedFromDashboard`);
    }
  }

  console.log(JSON.stringify({
    projectId,
    mode: apply ? "apply" : "dry-run",
    dates,
    ...totals,
    revenue: totals.revenueMicros / 1000000
  }, null, 2));
}

async function loadDailyRows(date) {
  const snap = await db.collection("userDailyAdMetrics").where("date", "==", date).get();
  return snap.docs.map((doc) => ({ ref: doc.ref, id: doc.id, data: doc.data() }));
}

async function loadUsers(userIds) {
  const unique = Array.from(new Set(userIds));
  const users = new Map();
  for (let i = 0; i < unique.length; i += 250) {
    const refs = unique.slice(i, i + 250).map((uid) => db.collection("users").doc(uid));
    const docs = await db.getAll(...refs);
    docs.forEach((doc) => {
      if (doc.exists) users.set(doc.id, doc.data());
    });
  }
  return users;
}

async function markExcluded(rows, date) {
  for (let i = 0; i < rows.length; i += 450) {
    const batch = db.batch();
    rows.slice(i, i + 450).forEach((row) => {
      batch.set(row.ref, {
        excludedFromDashboard: true,
        excludedReason: "legacy_migration_ad_baseline",
        excludedSource: "scripts/exclude-legacy-ad-baselines.js",
        excludedDate: date,
        excludedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });
    await batch.commit();
  }
}

function addToTotals(totals, data) {
  totals.revenueMicros += number(data.interstitialAdRevenueMicros) + number(data.rewardedAdRevenueMicros);
  totals.paidEvents += number(data.interstitialPaidImpressionCount) + number(data.rewardedPaidImpressionCount);
  totals.adWatches += number(data.interstitialAdWatchCount) + number(data.rewardedAdWatchCount);
  totals.interruptions += number(data.interstitialAdInterruptedCount) + number(data.rewardedAdInterruptedCount);
}

function hasLegacyUid(data = {}) {
  return typeof data.legacyUid === "string" && data.legacyUid.trim().length > 0;
}

function hasPositiveAdMetric(data = {}) {
  return AD_FIELDS.some((field) => number(data[field]) > 0);
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseArgs(argv) {
  return argv.reduce((parsed, arg) => {
    if (arg === "--apply") {
      parsed.apply = true;
      return parsed;
    }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) parsed[match[1]] = match[2];
    return parsed;
  }, {});
}

function normalizeDates(value = "") {
  return String(value)
    .split(",")
    .map((date) => date.trim())
    .filter(Boolean)
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
}

function readFirebaseProjectId() {
  try {
    const rc = JSON.parse(fs.readFileSync(path.join(__dirname, "..", ".firebaserc"), "utf8"));
    return rc.projects && rc.projects.default;
  } catch (error) {
    return "";
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
