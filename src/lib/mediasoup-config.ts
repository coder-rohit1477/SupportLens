import { types } from 'mediasoup';

export interface MediasoupConfig {
  numWorkers: number;
  workerSettings: {
    logLevel: types.WorkerLogLevel;
    logTags: types.WorkerLogTag[];
    rtcMinPort: number;
    rtcMaxPort: number;
  };
  routerOptions: {
    mediaCodecs: types.RtpCodecCapability[];
  };
  webRtcTransportOptions: {
    listenIps: types.TransportListenIp[];
    initialAvailableOutgoingBitrate: number;
    minimumAvailableOutgoingBitrate: number;
    maxSctpMessageSize: number;
    enableSctp: boolean;
  };
}

export const mediasoupConfig: MediasoupConfig = {
  // Number of Mediasoup worker processes to spawn
  numWorkers: 1,

  // Worker configuration settings
  workerSettings: {
    logLevel: 'warn',
    logTags: [
      'info',
      'ice',
      'dtls',
      'rtp',
      'srtp',
      'rtcp',
    ],
    rtcMinPort: 10000,
    rtcMaxPort: 10100,
  },

  // Router codec capabilities
  routerOptions: {
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
        preferredPayloadType: 111,
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        preferredPayloadType: 96,
        parameters: {
          'x-google-start-bitrate': 1000,
        },
      },
    ],
  },

  // WebRtcTransport settings for peer media connection
  webRtcTransportOptions: {
    listenIps: [
      {
        ip: process.env.MEDIASOUP_LISTEN_IP || '127.0.0.1',
        announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || undefined,
      },
    ],
    initialAvailableOutgoingBitrate: 1000000,
    minimumAvailableOutgoingBitrate: 600000,
    maxSctpMessageSize: 262144,
    enableSctp: false, // We do not need data channels as chat/files route over Socket.IO
  },
};
