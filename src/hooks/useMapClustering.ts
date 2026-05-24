import { useMemo } from 'react';
import Supercluster from 'supercluster';
import type { Region } from 'react-native-maps';

/**
 * JS-side map clustering via the supercluster algorithm.
 *
 * Why supercluster directly (and not react-native-map-clustering): the
 * wrapper library monkey-patches MapView and re-clones its children at
 * render time, which crashed natively at wide zoom levels under the
 * new architecture. Supercluster is the same algorithm under the hood
 * but exposes it as a pure JS index we drive ourselves -- no wrapper,
 * no native side, no Fabric incompatibility.
 *
 * Usage:
 *   const { clusters, getExpansionZoom } = useMapClustering(
 *     sales,
 *     region,
 *   );
 *
 *   {clusters.map((c) =>
 *     c.isCluster
 *       ? <Marker key={c.key} ...><ClusterPin count={c.count} /></Marker>
 *       : <Marker key={c.key} ...><MapPin status={c.point.status} /></Marker>
 *   )}
 *
 * Tap a cluster -> animate to getExpansionZoom(c.clusterId) so it
 * splits naturally.
 */

export interface ClusterablePoint {
  id: string;
  latitude: number;
  longitude: number;
}

export type ClusterFeature<T extends ClusterablePoint> =
  | {
      isCluster: true;
      key: string;
      latitude: number;
      longitude: number;
      count: number;
      clusterId: number;
    }
  | {
      isCluster: false;
      key: string;
      latitude: number;
      longitude: number;
      point: T;
    };

export interface ClusterOptions {
  /** Cluster radius in pixels. Higher = more aggressive grouping. */
  radius?: number;
  /** Don't cluster beyond this zoom level — show individual points. */
  maxZoom?: number;
  /** Minimum points to form a cluster. */
  minPoints?: number;
}

export function useMapClustering<T extends ClusterablePoint>(
  points: T[],
  region: Region | null | undefined,
  options: ClusterOptions = {},
) {
  const { radius = 60, maxZoom = 14, minPoints = 2 } = options;

  // Build the supercluster index. Re-run when the points list changes.
  const index = useMemo(() => {
    if (points.length === 0) return null;
    const sc = new Supercluster<{ source: T }>({
      radius,
      maxZoom,
      minPoints,
    });
    sc.load(
      points.map((p) => ({
        type: 'Feature' as const,
        properties: { source: p },
        geometry: {
          type: 'Point' as const,
          coordinates: [p.longitude, p.latitude],
        },
      })),
    );
    return sc;
  }, [points, radius, maxZoom, minPoints]);

  // Recompute the cluster set whenever the visible region changes.
  const clusters: ClusterFeature<T>[] = useMemo(() => {
    if (!index) return [];

    // No region yet (e.g. first render) -- render every point so the
    // map isn't empty during initial layout. Once a region change
    // arrives, clustering kicks in.
    if (!region) {
      return points.map<ClusterFeature<T>>((p) => ({
        isCluster: false,
        key: `point-${p.id}`,
        latitude: p.latitude,
        longitude: p.longitude,
        point: p,
      }));
    }

    const bbox: [number, number, number, number] = [
      region.longitude - region.longitudeDelta / 2,
      region.latitude - region.latitudeDelta / 2,
      region.longitude + region.longitudeDelta / 2,
      region.latitude + region.latitudeDelta / 2,
    ];
    // Approximate web-mercator zoom from longitudeDelta. Good enough
    // for clustering decisions; supercluster will clamp internally.
    const zoom = Math.max(
      0,
      Math.min(20, Math.round(Math.log2(360 / region.longitudeDelta))),
    );

    return index.getClusters(bbox, zoom).map<ClusterFeature<T>>((f) => {
      const [lng, lat] = f.geometry.coordinates as [number, number];
      const props = f.properties as
        | { cluster: true; cluster_id: number; point_count: number }
        | { source: T };
      if ('cluster' in props && props.cluster) {
        return {
          isCluster: true,
          key: `cluster-${props.cluster_id}`,
          latitude: lat,
          longitude: lng,
          count: props.point_count,
          clusterId: props.cluster_id,
        };
      }
      const point = (props as { source: T }).source;
      return {
        isCluster: false,
        key: `point-${point.id}`,
        latitude: lat,
        longitude: lng,
        point,
      };
    });
  }, [index, region, points]);

  /**
   * Given a cluster_id, return the zoom level at which the cluster
   * would split into its children. Pass to mapRef.animateToRegion.
   */
  const getExpansionZoom = (clusterId: number): number => {
    if (!index) return 14;
    return Math.min(20, index.getClusterExpansionZoom(clusterId));
  };

  return { clusters, getExpansionZoom };
}

/**
 * Convert a target zoom level (0-20) into a `latitudeDelta` /
 * `longitudeDelta` that MapView understands. The 360 constant is the
 * full-world longitude span at zoom 0.
 */
export function zoomToRegionDelta(zoom: number): number {
  return 360 / Math.pow(2, zoom);
}
