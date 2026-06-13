import React from 'react';
import { useCallStore } from '../store/useCallStore';

interface ControlPanelProps {
  sessionId: string;
  toggleMute: () => void;
  toggleVideo: () => void;
  endCall: (sessionId: string) => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({ sessionId, toggleMute, toggleVideo, endCall }) => {
  const { audioMuted, videoStopped, connectionState } = useCallStore();

  if (connectionState === 'disconnected') return null;

  return (
    <div className="w-full flex flex-col items-center justify-center gap-4 py-6 px-4 bg-zinc-950/40 backdrop-blur-xl border-t border-zinc-900 shadow-2xl">
      {/* Reconnection Banner / Call Status */}
      <div className="text-sm font-semibold tracking-wider uppercase flex items-center gap-2">
        {connectionState === 'connecting' && (
          <div className="flex items-center gap-2 text-amber-500 animate-pulse">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
            Connecting call...
          </div>
        )}
        {connectionState === 'reconnecting' && (
          <div className="flex items-center gap-2 text-rose-500 animate-pulse">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
            Participant disconnected. Waiting to reconnect...
          </div>
        )}
        {connectionState === 'connected' && (
          <div className="flex items-center gap-2 text-emerald-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Call Securely Routed (SFU)
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-6">
        {/* Mic Button */}
        <button
          onClick={toggleMute}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg border ${
            audioMuted
              ? 'bg-rose-500/20 border-rose-500 text-rose-500 hover:bg-rose-500/30'
              : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-700'
          }`}
          title={audioMuted ? 'Unmute Microphone' : 'Mute Microphone'}
        >
          {audioMuted ? (
            // Mic Off Icon
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : (
            // Mic On Icon
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          )}
        </button>

        {/* Video Toggle Button */}
        <button
          onClick={toggleVideo}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg border ${
            videoStopped
              ? 'bg-rose-500/20 border-rose-500 text-rose-500 hover:bg-rose-500/30'
              : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-700'
          }`}
          title={videoStopped ? 'Start Camera' : 'Stop Camera'}
        >
          {videoStopped ? (
            // Camera Off Icon
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
            </svg>
          ) : (
            // Camera On Icon
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          )}
        </button>

        {/* End Call Button */}
        <button
          onClick={() => endCall(sessionId)}
          className="w-16 h-16 rounded-full bg-rose-600 border border-rose-500 hover:bg-rose-500 hover:border-rose-400 text-white flex items-center justify-center transition-all duration-300 shadow-xl shadow-rose-950/20 active:scale-95"
          title="Hang Up / End Call"
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M16 8l2 2m0 0l2-2m-2 2l-2 2m2-2l2 2M5 3a2 2 0 00-2 2v2a2 2 0 00.222.928l2.947 5.894a8 8 0 005.67 4.566L17 19a2 2 0 002-2v-2a2 2 0 00-2-2h-1.928a2 2 0 00-1.789 1.106l-.736 1.472a12.042 12.042 0 01-5.657-5.657l1.472-.736A2 2 0 009.68 10.378V8.452a2 2 0 00-2-2H5z"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};
