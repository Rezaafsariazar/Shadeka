import * as maplibregl from 'maplibre-gl'
// Vite's `?worker&url` suffix bundles this file (and its sibling chunks) into
// one self-contained worker script and gives back its URL. Without this,
// maplibre-gl's default worker resolution under Vite loads an incomplete
// bundle (missing its shared chunk), so vector tiles silently never load.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

maplibregl.setWorkerUrl(maplibreWorkerUrl)
