/**
 * Lightweight client feature flags.
 *
 * ROUTE_PLANNER_ENABLED — the multi-stop route planner (RoutePlanner +
 * ActiveRoute screens) is built and registered but hidden for now. All
 * of its entry points are gated on this flag, so flipping it to `true`
 * restores the "Plan route" pill on the map and the "Plan a route from
 * saved" banner + Routes segment on the Saved screen. The standalone
 * "Mark visited" action on Sale detail is the piece we surface in the
 * meantime.
 */
export const ROUTE_PLANNER_ENABLED = false;
