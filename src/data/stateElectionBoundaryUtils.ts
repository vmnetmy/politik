import { geoMercator, geoPath } from "d3-geo";
import type { ElectionAtlasStateBoundaries } from "./types/atlas";
import type { DunBoundaryData } from "./types/stateElection";

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 720;
const MAP_PADDING = 28;

export function projectAtlasStateBoundaries(boundaries: ElectionAtlasStateBoundaries): DunBoundaryData {
  const projection = geoMercator().fitExtent(
    [[MAP_PADDING, MAP_PADDING], [MAP_WIDTH - MAP_PADDING, MAP_HEIGHT - MAP_PADDING]],
    boundaries.layers.dun,
  );
  const pathGenerator = geoPath(projection);

  return {
    version: boundaries.version,
    metadata: {
      title: boundaries.metadata.title,
      stateId: boundaries.state.id,
      boundaryVersion: boundaries.metadata.boundaryVersion,
      coordinateReference: boundaries.metadata.coordinateReference,
      sourceUrl: boundaries.metadata.sourceUrl,
      sourceSha256: boundaries.metadata.sourceSha256,
      retrievedAt: boundaries.metadata.retrievedAt,
      featureCount: boundaries.layers.dun.features.length,
      viewBox: { width: MAP_WIDTH, height: MAP_HEIGHT },
      simplificationTolerancePx: 0,
    },
    features: boundaries.layers.dun.features.map((feature) => {
      const [[minX, minY], [maxX, maxY]] = pathGenerator.bounds(feature);
      const [centroidX, centroidY] = pathGenerator.centroid(feature);
      return {
        id: feature.properties.id,
        code: feature.properties.code,
        name: feature.properties.name,
        parliamentCode: feature.properties.parliamentCode ?? "",
        path: pathGenerator(feature) ?? "",
        centroid: [centroidX, centroidY],
        bounds: [minX, minY, maxX, maxY],
        areaKm2: feature.properties.areaKm2,
      };
    }),
  };
}
