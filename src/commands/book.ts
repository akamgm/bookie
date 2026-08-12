import { api } from "@quiver/server";
import type { ActionContext, CommandResult } from "@quiver/server";

export default async function book(
  ctx: ActionContext,
  args: string,
): Promise<CommandResult> {
  const q = args.trim();
  if (!q) {
    return { message: { body: "Usage: `/book <title or author>`" } };
  }

  const results = await ctx.runAction(api.backend.functions.searchBooks, {
    query: q,
  });
  if (!results.length) {
    return { message: { body: `No books found for "${q}".` } };
  }

  const top = results[0];
  const authors = top.authors.join(", ");
  const lines = [
    top.coverUrl ? `![cover](${top.coverUrl})` : undefined,
    `📖 **${top.title}**${top.subtitle ? ` — ${top.subtitle}` : ""}`,
    authors ? `by ${authors}` : undefined,
    top.publishedDate ? `Published ${top.publishedDate.slice(0, 4)}` : undefined,
    "Open Bookie to add this to a shelf.",
  ].filter(Boolean);

  return { message: { body: lines.join("\n") } };
}
