// Turning an OAuth profile into an app_user.
//
// The identity table is what we key on, never the email: a provider's `sub` is
// stable for the life of the account, while an email can be renamed or (for
// custom domains) handed to a different person entirely. Email is used for one
// thing only — recognising that a *new* provider identity belongs to an account
// we already have, so signing in with Google today and something else tomorrow
// lands on the same account instead of silently forking it.

import { sql } from 'kysely';
import { db } from '../db/connection.js';
import type { OAuthProfile } from './providers.js';
import type { SessionUser } from './session.js';

interface UserRow {
  id: number;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
}

function toSessionUser(row: UserRow): SessionUser {
  return { id: row.id, email: row.email, name: row.name, avatarUrl: row.avatar_url };
}

export async function findOrCreateUser(
  providerId: string,
  profile: OAuthProfile,
): Promise<SessionUser> {
  return db.transaction().execute(async (trx) => {
    const emailLower = profile.email ? profile.email.toLowerCase() : null;

    // 1. Known identity — this is a returning visitor.
    const identity = await trx
      .selectFrom('user_identity')
      .select('user_id')
      .where('provider', '=', providerId)
      .where('provider_user_id', '=', profile.providerUserId)
      .executeTakeFirst();

    if (identity) {
      // Refresh the cached profile: people rename themselves and change
      // pictures. The email is only moved over if no *other* account holds it,
      // since one address can't belong to two accounts.
      const emailFree =
        emailLower === null
          ? false
          : !(await trx
              .selectFrom('app_user')
              .select('id')
              .where(sql<boolean>`lower(email) = ${emailLower}`)
              .where('id', '!=', identity.user_id)
              .executeTakeFirst());

      const updated = await trx
        .updateTable('app_user')
        .set({
          name: profile.name,
          avatar_url: profile.avatarUrl,
          ...(emailFree ? { email: profile.email } : {}),
          updated_at: new Date(),
        })
        .where('id', '=', identity.user_id)
        .returning(['id', 'email', 'name', 'avatar_url'])
        .executeTakeFirstOrThrow();

      return toSessionUser(updated);
    }

    // 2. New identity, but a verified email we already know: link it to that
    //    account. Unverified emails are never matched — anyone can claim one.
    if (emailLower && profile.emailVerified) {
      const existing = await trx
        .selectFrom('app_user')
        .select(['id', 'email', 'name', 'avatar_url'])
        .where(sql<boolean>`lower(email) = ${emailLower}`)
        .executeTakeFirst();

      if (existing) {
        await linkIdentity(trx, providerId, profile.providerUserId, existing.id);
        return toSessionUser(existing);
      }
    }

    // 3. Nobody we know: create the account.
    const created = await trx
      .insertInto('app_user')
      .values({
        // Only a verified address is stored; an unverified one would squat the
        // unique index and block the real owner from ever linking.
        email: profile.emailVerified ? profile.email : null,
        name: profile.name,
        avatar_url: profile.avatarUrl,
      })
      .returning(['id', 'email', 'name', 'avatar_url'])
      .executeTakeFirstOrThrow();

    await linkIdentity(trx, providerId, profile.providerUserId, created.id);
    return toSessionUser(created);
  });
}

type Trx = Parameters<Parameters<ReturnType<typeof db.transaction>['execute']>[0]>[0];

// ON CONFLICT DO NOTHING makes a double-submitted callback (two tabs, a retry) a
// no-op instead of a unique-violation 500.
async function linkIdentity(
  trx: Trx,
  providerId: string,
  providerUserId: string,
  userId: number,
): Promise<void> {
  await trx
    .insertInto('user_identity')
    .values({ provider: providerId, provider_user_id: providerUserId, user_id: userId })
    .onConflict((oc) => oc.columns(['provider', 'provider_user_id']).doNothing())
    .execute();
}
