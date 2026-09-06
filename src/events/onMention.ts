import { api } from "@quiver/server";
import type { ActionContext } from "@quiver/server";

type MessagePostedPayload = {
  body?: string;
  author?: string;
  mentions?: string[];
  kind?: string;
  replyTo?: string;
};

type MessagePostedEventArgs = {
  payload: MessagePostedPayload;
  emittedBy?: string;
  eventId?: string;
  isRetry?: boolean;
};

const HELP_PATTERNS = [
  /\bhow do (i|you) (use|work)\b/i,
  /\bhow does (this|it|bookie) work\b/i,
  /\bwhat (can|do) (you|bookie) do\b/i,
  /\bhelp\b/i,
  /\busage\b/i,
  /\bgetting started\b/i,
  /\bwhat are you\b/i,
  /\bwho are you\b/i,
  /\bcommands?\b/i,
];

function isHelpQuestion(body: string): boolean {
  return HELP_PATTERNS.some((pattern) => pattern.test(body));
}

export default async function onMention(
  ctx: ActionContext,
  { payload }: MessagePostedEventArgs,
): Promise<void> {
  // Ignore platform diagnostics and our own messages to avoid loops.
  if (payload.kind && payload.kind !== "message") return;
  if (payload.author === ctx.appId) return;

  const body = (payload.body ?? "").trim();
  if (!body) return;

  // Only respond to help-oriented questions. Other @-mentions (e.g. someone
  // naming Bookie in passing) stay quiet.
  if (!isHelpQuestion(body)) return;

  const panelBase = await ctx.runQuery(api.backend.functions.getPanelBase, {});
  const openLine = panelBase
    ? `Open the [Bookie panel](${panelBase}) to get started.`
    : `Open the Bookie panel to get started.`;

  const lines = [
    `Hi! I'm **Bookie**, your personal reading tracker. Your library follows you across every Quiver channel.`,
    ``,
    `Here's what I can do:`,
    `• **Search books** — use \`/book <title or author>\` to post a book card, or search inside the panel.`,
    `• **Shelve books** — mark books as *Want to Read*, *Reading*, *Read*, or *Haven't Finished*. Your shelves are private to you.`,
    `• **Rate & review** — give books a star rating and write a review; keep private notes too.`,
    `• **Track progress** — update reading progress and see your shelf activity history.`,
    `• **Browse members** — see other members' public shelves in the *Users* tab.`,
    `• **Share to chat** — when you finish a book, share it to the channel from its detail page.`,
    `• **Browser extension** — add books straight from Amazon, Goodreads, and other book pages.`,
    ``,
    openLine,
  ];

  await ctx.platform.chat.send({ body: lines.join("\n") });
}
