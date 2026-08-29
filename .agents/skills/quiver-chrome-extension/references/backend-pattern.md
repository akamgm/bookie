# Quiver backend pattern

Use this shape when an external Chrome extension ultimately updates
member-scoped data.

## Schema

```ts
export default defineSchema({
  credentials: defineTable({
    member: v.string(),
    tokenHash: v.string(),
    createdAt: v.number(),
  })
    .scope("quiver")
    .index("by_member", ["member"])
    .index("by_tokenHash", ["tokenHash"]),

  imports: defineTable({
    member: v.string(),
    itemId: v.id("items"),
    requestedState: v.string(),
    createdAt: v.number(),
  })
    .scope("quiver")
    .index("by_member", ["member"])
    .index("by_member_itemId", ["member", "itemId"]),

  privateState: defineTable({
    itemId: v.id("items"),
    state: v.string(),
    updatedAt: v.number(),
  })
    .scope("member")
    .index("by_itemId", ["itemId"]),
});
```

The handoff may contain a canonical quiver-scoped ID and requested operation.
It must not duplicate private member content.

## Token lifecycle

Generate at least 192 random bits:

```ts
function makeToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return "myapp_" +
    Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
```

Hash before storage:

```ts
async function hashToken(token: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
```

Return the usable token once. Rotation patches the stored hash. Validate the
token's full prefix, length, and alphabet before hashing an external request.

## Public action

The route should:

1. Require an external request envelope.
2. Parse `Authorization: Bearer ...` case-insensitively.
3. Bound body size before JSON parsing.
4. Hash and look up the token.
5. Normalize and bound all extracted fields.
6. Resolve a canonical item using a server-scoped provider token.
7. Call an undeclared mutation that touches only quiver-scoped tables.
8. Return `202` after queueing.

Do not call a member-scoped mutation from this action.

## Queue mutation

The queue mutation should:

- Upsert the canonical quiver-scoped item.
- Deduplicate by `(member, itemId)`.
- Patch repeated requests to the newest requested state.
- Cap pending imports per member, such as 100.
- Drop the oldest row when enforcing the cap.

Keep it out of the manifest because only the public action should call it.

## Authenticated claim

Declare the claim mutation in the manifest and opt into trusted caller
injection:

```ts
export const claimImports = mutation({
  args: { caller: v.string() },
  handler: async (ctx, { caller }) => {
    const rows = await ctx.db
      .query("imports")
      .withIndex("by_member", (q) => q.eq("member", caller))
      .collect();

    rows.sort((a, b) => a.createdAt - b.createdAt);
    for (const row of rows.slice(0, 25)) {
      const item = await ctx.db.get(row.itemId);
      if (item) await applyExistingMemberMutationRule(ctx, caller, item, row);
      await ctx.db.delete(row._id);
    }
  },
});
```

Extract `applyExistingMemberMutationRule` as a plain helper and call it from
both the ordinary UI mutation and claim mutation. Do not copy the upsert logic
into a second implementation.

Only delete a valid handoff after the member operation succeeds. A missing
canonical item may be discarded because the reference is no longer usable.

## Iframe claim loop

Claim on mount, every few seconds while visible, and when visibility returns:

```tsx
useEffect(() => {
  if (!context) return;
  let stopped = false;

  const claim = () => {
    if (stopped || document.visibilityState === "hidden") return;
    claimImports({}).catch(console.error);
  };

  claim();
  const interval = window.setInterval(claim, 5_000);
  document.addEventListener("visibilitychange", claim);
  return () => {
    stopped = true;
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", claim);
  };
}, [context?.handle]);
```

Queries observing member data should update reactively after the claim
mutation commits.
