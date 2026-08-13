import type { MigrationContext } from "@quiver/server";

/** Remove the old channel identity before `books` becomes quiver-scoped. */
export default async function globalBooks(ctx: MigrationContext) {
  const page = await ctx.migrationPage<{ _id: string }>("books");

  for (const book of page.page) {
    await ctx.db.patch(book._id, { channelId: undefined });
  }

  return {
    done: page.isDone,
    cursor: page.isDone ? undefined : page.continueCursor,
  };
}
