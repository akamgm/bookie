import type { MigrationContext } from "@quiver/server";

/**
 * Remove the old channel identity from `shelvings`. The persisted `handle`
 * remains in place and becomes the member-scope partition key.
 */
export default async function globalShelvings(ctx: MigrationContext) {
  const page = await ctx.migrationPage<{ _id: string }>("shelvings");

  for (const shelving of page.page) {
    await ctx.db.patch(shelving._id, { channelId: undefined });
  }

  return {
    done: page.isDone,
    cursor: page.isDone ? undefined : page.continueCursor,
  };
}
