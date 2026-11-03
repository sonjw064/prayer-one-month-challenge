import { and, eq } from "drizzle-orm";
import webPush from "web-push";
import { getDb } from "../../db/client";
import { pushSubscriptions } from "../../db/schema";
import { requireWebPushConfig } from "../../lib/env";

export type PushTarget = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushSummary = {
  attempted: number;
  sent: number;
  expired: number;
  failed: number;
};

export type BrowserPushSubscription = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

function statusCode(error: unknown): number | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof (error as { statusCode?: unknown }).statusCode === "number"
  ) {
    return (error as { statusCode: number }).statusCode;
  }
  return null;
}

export async function fanOutPush(
  subscriptions: PushTarget[],
  send: (target: PushTarget) => Promise<void>,
  removeExpired: (endpoint: string) => Promise<void>,
): Promise<PushSummary> {
  const summary: PushSummary = {
    attempted: subscriptions.length,
    sent: 0,
    expired: 0,
    failed: 0,
  };

  for (const target of subscriptions) {
    try {
      await send(target);
      summary.sent += 1;
    } catch (error) {
      const code = statusCode(error);
      if (code === 404 || code === 410) {
        await removeExpired(target.endpoint);
        summary.expired += 1;
      } else {
        summary.failed += 1;
      }
    }
  }

  return summary;
}

export async function savePushSubscription(
  userId: string,
  subscription: BrowserPushSubscription,
  userAgent: string | null,
): Promise<void> {
  const now = new Date();
  await getDb()
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent,
        lastSeenAt: now,
      },
    });
}

export async function removePushSubscription(
  userId: string,
  endpoint: string,
): Promise<void> {
  await getDb()
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.endpoint, endpoint),
      ),
    );
}

async function removeExpiredPushEndpoint(endpoint: string): Promise<void> {
  await getDb()
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint));
}

async function broadcastPush(payload: string): Promise<PushSummary> {
  const config = requireWebPushConfig();

  webPush.setVapidDetails(
    config.subject,
    config.publicKey,
    config.privateKey,
  );

  const rows = await getDb()
    .select({
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions);

  return fanOutPush(
    rows,
    async (target) => {
      await webPush.sendNotification(
        {
          endpoint: target.endpoint,
          keys: {
            p256dh: target.p256dh,
            auth: target.auth,
          },
        },
        payload,
      );
    },
    removeExpiredPushEndpoint,
  );
}

export async function sendNoticePush(notice: {
  id: string;
  title: string;
  body: string;
}): Promise<PushSummary> {
  return broadcastPush(
    JSON.stringify({
      title: notice.title,
      body: notice.body.slice(0, 120),
      url: `/notices/${notice.id}`,
      tag: `notice-${notice.id}`,
    }),
  );
}

export async function sendCalendarEventPush(event: {
  id: string;
  title: string;
  body: string;
  startDate: string;
}): Promise<PushSummary> {
  return broadcastPush(
    JSON.stringify({
      title: event.title,
      body: event.body.slice(0, 120),
      url: `/calendar?date=${event.startDate}`,
      tag: `calendar-${event.id}`,
    }),
  );
}
