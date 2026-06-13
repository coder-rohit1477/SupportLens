import { types } from 'mediasoup-client';

export type UserRole = 'AGENT' | 'CUSTOMER';

export interface PeerInfo {
  id: string;
  name: string;
  role: UserRole;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  type: 'text' | 'file';
  text?: string;
  fileName?: string;
  fileUrl?: string;
  mimeType?: string;
  createdAt: string;
}

export interface SendMessagePayload {
  sessionId: string;
  message: ChatMessage;
}

export interface MessageReceivedPayload {
  message: ChatMessage;
}

export interface JoinPayload {
  sessionId: string;
  userId: string;
  role: UserRole;
  name: string;
}

export interface JoinResponse {
  peers: PeerInfo[];
  messages: ChatMessage[];
}

export interface CreateTransportResponse {
  id: string;
  iceParameters: types.IceParameters;
  iceCandidates: types.IceCandidate[];
  dtlsParameters: types.DtlsParameters;
}

export interface ConnectTransportPayload {
  transportId: string;
  dtlsParameters: types.DtlsParameters;
}

export interface ProducePayload {
  transportId: string;
  kind: 'audio' | 'video';
  rtpParameters: types.RtpParameters;
  appData?: types.AppData;
}

export interface ProduceResponse {
  id: string; // producerId
}

export interface ConsumePayload {
  transportId: string;
  producerId: string;
  rtpCapabilities: types.RtpCapabilities;
}

export interface ConsumeResponse {
  id: string; // consumerId
  producerId: string;
  kind: 'audio' | 'video';
  rtpParameters: types.RtpParameters;
}

export interface NewProducerPayload {
  producerId: string;
  producerUserId: string;
  producerRole: UserRole;
  kind: 'audio' | 'video';
}

export interface ProducerClosedPayload {
  producerId: string;
}
