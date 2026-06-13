import { create } from 'zustand';

export type CallConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface RemotePeerInfo {
  id: string;
  name: string;
  role: 'AGENT' | 'CUSTOMER';
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  senderId: string;
  senderName: string;
  senderRole: 'AGENT' | 'CUSTOMER';
  type: 'text' | 'file';
  text?: string;
  fileName?: string;
  fileUrl?: string;
  mimeType?: string;
  createdAt: string;
}

interface CallState {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  connectionState: CallConnectionState;
  audioMuted: boolean;
  videoStopped: boolean;
  isScreenSharing: boolean;
  remotePeer: RemotePeerInfo | null;
  localUserId: string | null;
  localUserName: string | null;
  localUserRole: 'AGENT' | 'CUSTOMER' | null;
  chatMessages: ChatMessage[];
  
  // Actions
  setLocalStream: (stream: MediaStream | null) => void;
  setRemoteStream: (stream: MediaStream | null) => void;
  setConnectionState: (state: CallConnectionState) => void;
  setAudioMuted: (muted: boolean) => void;
  setVideoStopped: (stopped: boolean) => void;
  setIsScreenSharing: (sharing: boolean) => void;
  setRemotePeer: (peer: RemotePeerInfo | null) => void;
  setLocalIdentity: (identity: {
    userId: string | null;
    name: string | null;
    role: 'AGENT' | 'CUSTOMER' | null;
  }) => void;
  setChatMessages: (messages: ChatMessage[]) => void;
  addChatMessage: (message: ChatMessage) => void;
  clearChatMessages: () => void;
  resetCall: () => void;
}

export const useCallStore = create<CallState>((set) => ({
  localStream: null,
  remoteStream: null,
  connectionState: 'disconnected',
  audioMuted: false,
  videoStopped: false,
  isScreenSharing: false,
  remotePeer: null,
  localUserId: null,
  localUserName: null,
  localUserRole: null,
  chatMessages: [],

  setLocalStream: (stream) => set({ localStream: stream }),
  setRemoteStream: (stream) => set({ remoteStream: stream }),
  setConnectionState: (state) => set({ connectionState: state }),
  setAudioMuted: (muted) => set({ audioMuted: muted }),
  setVideoStopped: (stopped) => set({ videoStopped: stopped }),
  setIsScreenSharing: (sharing) => set({ isScreenSharing: sharing }),
  setRemotePeer: (peer) => set({ remotePeer: peer }),
  setLocalIdentity: (identity) => set({
    localUserId: identity.userId,
    localUserName: identity.name,
    localUserRole: identity.role,
  }),
  setChatMessages: (messages) => set({ chatMessages: messages }),
  addChatMessage: (message) => set((state) => ({ chatMessages: [...state.chatMessages, message] })),
  clearChatMessages: () => set({ chatMessages: [] }),
  resetCall: () => set({
    localStream: null,
    remoteStream: null,
    connectionState: 'disconnected',
    audioMuted: false,
    videoStopped: false,
    isScreenSharing: false,
    remotePeer: null,
    localUserId: null,
    localUserName: null,
    localUserRole: null,
    chatMessages: [],
  }),
}));
