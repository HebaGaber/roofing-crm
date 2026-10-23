// T022: the home screen, gated behind the Cognito session from SignIn (T020). Renders CrmMap and
// calls health.ping on load (public route, no authorizer) so AC-2/NFR-001's X-Ray trace exists.
import { useEffect, type ReactElement } from "react";
import { CrmMap } from "../../components/Map/CrmMap.js";
import styles from "./Map.module.css";

export function Component(): ReactElement {
  useEffect(() => {
    // Fire-and-forget: contracts/health.md's health.ping, same-origin via the Amplify /api/*
    // rewrite. Its own X-Ray trace (not this call's result) is what AC-2/NFR-001 checks.
    void fetch("/api/trpc/health.ping").catch(() => {
      // No UI consequence: health.ping failing does not block the map (it's an observability
      // probe, not a data dependency of this screen).
    });
  }, []);

  return (
    <section aria-label="Map" data-route="map" className={styles.page}>
      <CrmMap />
    </section>
  );
}
