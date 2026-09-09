import { BUILD_VERSION } from "@/lib/pwa/build-version";

/**
 * The build the server is running. `registration.update()` re-fetches a
 * byte-identical `sw.js`, so a tab open across a deploy would never see it;
 * the page polls this instead and registers the new build's worker URL when
 * it differs (components/service-worker.tsx). `proxy.ts` exempts it, because
 * the sign-in screen has to be able to ask too.
 */
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(
    { version: BUILD_VERSION },
    {
      headers: {
        // A cached version string is indistinguishable from "already up to date".
        "Cache-Control": "no-store, must-revalidate",
      },
    },
  );
}
