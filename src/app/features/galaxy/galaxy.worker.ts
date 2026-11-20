import { GalaxyRequest, handleGalaxyRequest } from './analysis/galaxy-analysis';

// Finds topics and lays out the galaxy off the main thread, so the page stays responsive.
addEventListener('message', ({ data }: MessageEvent<GalaxyRequest>) => {
  postMessage(handleGalaxyRequest(data));
});
