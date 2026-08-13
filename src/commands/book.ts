import { api } from "@quiver/server";
import type { ActionContext, CommandResult } from "@quiver/server";

export default async function book(
  ctx: ActionContext,
  args: string,
): Promise<CommandResult | null> {
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
  const panelBase = await ctx.runQuery(api.backend.functions.getPanelBase, {});
  // searchBooks caches every result on search now, so top.bookId is a
  // real book row — link straight to its detail page.
  const titleText = panelBase
    ? `[${top.title}](${panelBase}/book/${top.bookId})`
    : `**${top.title}**`;
  const lines = [
    `📖 ${titleText}${top.subtitle ? ` — ${top.subtitle}` : ""}`,
    authors ? `by ${authors}` : undefined,
    top.publishedDate ? `Published ${top.publishedDate.slice(0, 4)}` : undefined,
    "Open Bookie to add this to a shelf.",
  ].filter(Boolean);

  const attachments = top.coverUrl
    ? [{ type: "image", src: top.coverUrl, alt: top.title }]
    : [];

  await ctx.platform.chat.send({
    body: lines.join("\n"),
    ...(attachments.length > 0 ? { attachments } : {}),
  });
  return null;
}
