// A compose request is one user intent ("open the composer, here are my
// attachments") that outlives the screen that created it. The feed is the only
// place a top-level post can be written, so a request made from the left rail,
// the mobile button, another community screen, or the home page has to survive
// the navigation - and the session load - that happens before the feed mounts.
//
// Modelling it as a pending item with an id, instead of a counter the feed
// compares against its own first-render value, is what makes "mounted later"
// and "handled exactly once" different questions: the page keeps the request
// until the feed says it opened the composer with it.

export interface ComposeRequest {
  /** Identifies one intent. Monotonic so a newer request never looks older. */
  id: number;
  /** Attachments picked before the composer existed; handed over on open. */
  files?: File[];
}

let lastComposeRequestId = 0;
let queuedRequest: ComposeRequest | null = null;

/** Retain home-page intent while the community's lazy chunk is loading. */
export function queueComposeRequest(files?: File[]): void {
  queuedRequest = createComposeRequest(files);
  window.dispatchEvent(new CustomEvent('community:compose', { detail: { files } }));
}

export function takeQueuedComposeRequest(): ComposeRequest | null {
  const request = queuedRequest;
  queuedRequest = null;
  return request;
}

export function createComposeRequest(files?: File[]): ComposeRequest {
  lastComposeRequestId += 1;
  return { id: lastComposeRequestId, files };
}

/**
 * Page side: drop the request the feed acknowledged, releasing its files.
 * Id-matched so a repeated acknowledgement (StrictMode runs mount effects
 * twice) is a no-op, and a newer request that arrived in between survives.
 */
export function releaseComposeRequest(
  current: ComposeRequest | null,
  handledId: number,
): ComposeRequest | null {
  return current && current.id === handledId ? null : current;
}

/**
 * Feed side: what this render should do about the pending request, given the
 * last id this feed instance already opened. Returns null when there is
 * nothing new - a fresh mount with no request, or a request already consumed
 * by this instance.
 */
export function consumeComposeRequest(
  request: ComposeRequest | null | undefined,
  handledId: number | null,
): { handledId: number; files?: File[] } | null {
  if (!request || request.id === handledId) {
    return null;
  }
  return { handledId: request.id, files: request.files };
}

/**
 * Feed side: the id to acknowledge after a commit, or null when the pending
 * request (if any) has not been opened by this instance yet.
 */
export function acknowledgeableComposeRequestId(
  request: ComposeRequest | null | undefined,
  handledId: number | null,
): number | null {
  return request && request.id === handledId ? request.id : null;
}
