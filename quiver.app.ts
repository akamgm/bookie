// Starting point for a brand-new Quiver app. Fixie renders this into the
// new app's initial repository before publishing it to the catalog. Keep
// it valid and presentable: the user sees it while Fixie starts working.

import type { AppManifest } from "@quiver/system";

const manifest: AppManifest = {
  // The marker is rendered into a real name before the initial git commit.
  // Keep it a plain string literal so the embedded source stays valid even
  // outside that flow — Quiver's `manifest/starter-copy` check refuses a
  // push that still carries either this marker or the generic summary
  // below, so nothing ships wearing the starter's clothes.
  displayName: "Bookie",
  summary: "Start with a polished, live canvas for a new Quiver app.",
  entrypoints: {
    channel: "src/app.tsx",
  },
};

export default manifest;
