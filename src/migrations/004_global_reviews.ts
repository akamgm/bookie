import type { MigrationContext } from "@quiver/server";

/**
 * Remove the old channel identity from `reviews`. The persisted `handle`
 * remains in place and becomes the member-scope partition key.
 */
export default async function globalReviews(ctx: MigrationContext) {
  const page = await ctx.migrationPage<{ _id: string }>("reviews");

  for (const review of page.page) {
    await ctx.db.patch(review._id, { channelId: undefined });
  }

  return {
    done: page.isDone,
    cursor: page.isDone ? undefined : page.continueCursor,
  };
}
