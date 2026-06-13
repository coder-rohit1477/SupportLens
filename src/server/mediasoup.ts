import * as mediasoup from 'mediasoup';
import { types } from 'mediasoup';
import { mediasoupConfig } from '../lib/mediasoup-config';

let worker: types.Worker | null = null;

/**
 * Initializes the singleton Mediasoup worker.
 */
export async function initializeMediasoup(): Promise<types.Worker> {
  if (worker) return worker;

  worker = await mediasoup.createWorker({
    logLevel: mediasoupConfig.workerSettings.logLevel,
    logTags: mediasoupConfig.workerSettings.logTags,
    rtcMinPort: mediasoupConfig.workerSettings.rtcMinPort,
    rtcMaxPort: mediasoupConfig.workerSettings.rtcMaxPort,
  });

  worker.on('died', () => {
    console.error('mediasoup worker died, exiting in 2 seconds...');
    setTimeout(() => process.exit(1), 2000);
  });

  console.log(`mediasoup worker created successfully (pid: ${worker.pid})`);
  return worker;
}

/**
 * Gets the active Mediasoup worker. Throws an error if not initialized.
 */
export function getWorker(): types.Worker {
  if (!worker) {
    throw new Error('Mediasoup worker has not been initialized. Call initializeMediasoup() first.');
  }
  return worker;
}

/**
 * Creates a new Mediasoup Router on the running worker.
 */
export async function createRouter(): Promise<types.Router> {
  const activeWorker = getWorker();
  return activeWorker.createRouter({
    mediaCodecs: mediasoupConfig.routerOptions.mediaCodecs,
  });
}

/**
 * Creates a WebRtcTransport on a given Router.
 */
export async function createWebRtcTransport(router: types.Router): Promise<types.WebRtcTransport> {
  const {
    listenIps,
    initialAvailableOutgoingBitrate,
    minimumAvailableOutgoingBitrate,
    maxSctpMessageSize,
    enableSctp,
  } = mediasoupConfig.webRtcTransportOptions;

  const transport = await router.createWebRtcTransport({
    listenIps,
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate,
    enableSctp,
    maxSctpMessageSize,
  });

  // Apply minimum outgoing bitrate constraint if supported
  if (minimumAvailableOutgoingBitrate && transport.setMaxOutgoingBitrate) {
    try {
      await transport.setMaxOutgoingBitrate(initialAvailableOutgoingBitrate);
    } catch (error) {
      console.warn('Failed to set max outgoing bitrate on transport:', error);
    }
  }

  return transport;
}
