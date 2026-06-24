// Workspace plan definitions + quota check helpers.
//
// Plans are hardcoded constants — for a real deploy you'd wire these to a billing
// provider (Stripe price IDs, etc.). The `Infinity` value disables a quota.
//
// Limits are enforced at write time by callers:
//   import { assertQuota, planFor, hasFeature } from './plans.js';
//   const plan = await planFor(workspaceId);
//   await assertQuota(workspaceId, 'records');     // throws QuotaError if at limit
//   if (!hasFeature(plan, 'passkeys')) throw new Error('upgrade required');
import { db } from '../db/index.js';
import { workspaces, moduleData, users, dashboardWidgets, scheduledReports, oauthProviders, tideTopics } from '../db/schema.js';
import { and, eq, isNull, count } from 'drizzle-orm';

export const PLANS = {
  free: {
    label: 'Free',
    priceMo: 0,
    limits: {
      records:           500,
      users:             3,
      scheduledReports:  1,
      dashboardWidgets:  5,
      oauthProviders:    0,
      tideTopics:        3,
    },
    features: {
      passkeys:    false,
      sso:         false,
      perRecordShares: true,
      i18n:        true,
    },
  },
  pro: {
    label: 'Pro',
    priceMo: 49,
    limits: {
      records:           50_000,
      users:             50,
      scheduledReports:  25,
      dashboardWidgets:  50,
      oauthProviders:    3,
      tideTopics:        25,
    },
    features: {
      passkeys:    true,
      sso:         true,
      perRecordShares: true,
      i18n:        true,
    },
  },
  enterprise: {
    label: 'Enterprise',
    priceMo: 499,
    limits: {
      records:           Infinity,
      users:             Infinity,
      scheduledReports:  Infinity,
      dashboardWidgets:  Infinity,
      oauthProviders:    Infinity,
      tideTopics:        Infinity,
    },
    features: {
      passkeys:    true,
      sso:         true,
      perRecordShares: true,
      i18n:        true,
    },
  },
};

export const PLAN_KEYS = Object.keys(PLANS);

export class QuotaError extends Error {
  constructor(quota, limit, current) {
    super(`Plan limit reached for ${quota}: ${current}/${limit === Infinity ? '∞' : limit}. Upgrade to add more.`);
    this.code = 'QUOTA_EXCEEDED';
    this.status = 402;   // 402 Payment Required is the right HTTP semantic
    this.quota = quota;
    this.limit = limit;
    this.current = current;
  }
}

export class FeatureGateError extends Error {
  constructor(feature, plan) {
    super(`Feature "${feature}" requires a higher plan (current: ${plan}). Upgrade to enable.`);
    this.code = 'FEATURE_GATED';
    this.status = 402;
    this.feature = feature;
    this.plan = plan;
  }
}

export async function planFor(workspaceId) {
  const ws = (await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1))[0];
  const planKey = (ws?.plan && PLANS[ws.plan]) ? ws.plan : 'free';
  return { key: planKey, ...PLANS[planKey] };
}

export function hasFeature(plan, feature) {
  return !!plan?.features?.[feature];
}

// Compute current usage of a single quota.
async function currentUsage(workspaceId, quota) {
  switch (quota) {
    case 'records': {
      const r = await db.select({ c: count() }).from(moduleData).where(and(
        eq(moduleData.workspaceId, workspaceId),
        isNull(moduleData.deletedAt),
      ));
      return r[0]?.c ?? 0;
    }
    case 'users': {
      const r = await db.select({ c: count() }).from(users).where(eq(users.workspaceId, workspaceId));
      return r[0]?.c ?? 0;
    }
    case 'scheduledReports': {
      const r = await db.select({ c: count() }).from(scheduledReports).where(eq(scheduledReports.workspaceId, workspaceId));
      return r[0]?.c ?? 0;
    }
    case 'dashboardWidgets': {
      // Per-user widgets, but plan limit is workspace-wide
      const r = await db.select({ c: count() }).from(dashboardWidgets).where(eq(dashboardWidgets.workspaceId, workspaceId));
      return r[0]?.c ?? 0;
    }
    case 'oauthProviders': {
      const r = await db.select({ c: count() }).from(oauthProviders).where(eq(oauthProviders.workspaceId, workspaceId));
      return r[0]?.c ?? 0;
    }
    case 'tideTopics': {
      const r = await db.select({ c: count() }).from(tideTopics).where(eq(tideTopics.workspaceId, workspaceId));
      return r[0]?.c ?? 0;
    }
    default: return 0;
  }
}

// Throws QuotaError if creating one more `quota` item would exceed the plan limit.
export async function assertQuota(workspaceId, quota) {
  const plan = await planFor(workspaceId);
  const limit = plan.limits[quota];
  if (limit === undefined) return;             // unknown quota — not enforced
  if (limit === Infinity) return;              // unlimited
  const current = await currentUsage(workspaceId, quota);
  if (current >= limit) throw new QuotaError(quota, limit, current);
}

// Snapshot all current usages — used by the plan-status endpoint and admin UI.
export async function usageSnapshot(workspaceId) {
  const out = {};
  for (const q of Object.keys(PLANS.free.limits)) {
    out[q] = await currentUsage(workspaceId, q);
  }
  return out;
}
