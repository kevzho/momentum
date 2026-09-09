import { BUILD_VERSION } from "@/lib/pwa/build-version";

/**
 * The build the server is running, as one string.
 *
 * This exists because of a gap the service worker cannot close on its own.
 * `registration.update()` re-fetches the URL the worker was registered under —
 * `/sw.js?v=<the build the page was served from>` — and `public/sw.js` is
 * byte-identical across builds, so that request answers "nothing has changed"
 * however many deploys have happened since. A tab left open for a day, moving
 * between routes through the client router (which fetches RSC payloads, not
 * documents), would go on running the build it was loaded with.
 *
 * So the page asks the *server* what it is serving instead. When the answer
 * differs from the build stamped into the page, the client registers that
 * build's worker URL, which starts the ordinary install → prompt → reload path
 * (components/service-worker.tsx). One string, no caching, no session.
 *
 * A route handler is the right shape here for the reason docs/ARCHITECTURE.md §6
 * gives: it exists for a non-RSC consumer. `proxy.ts` exempts it, because a page
 * on the sign-in screen has to be able to ask too.
 */
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(
    { version: BUILD_VERSION },
    {
      headers: {
        // The one answer that must never come from a cache: a cached version
        // string is indistinguishable from "you are already up to date".
        "Cache-Control": "no-store, must-revalidate",
      },
    },
  );
}
