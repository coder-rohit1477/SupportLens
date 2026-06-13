import React, { useEffect, useRef } from 'react';
import { useCallStore } from '../store/useCallStore';

interface VideoStreamProps {
  stream: MediaStream | null;
  muted?: boolean;
  label: string;
}

const VideoStream: React.FC<VideoStreamProps> = ({ stream, muted = false, label }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isLocal = label.toLowerCase().includes('local') || label.toLowerCase().includes('you');

  useEffect(() => {
    if (videoRef.current) {
      // If we are switching from no stream to a stream, or vice versa
      videoRef.current.srcObject = stream;
      
      if (stream) {
        // Try to play immediately
        videoRef.current.play().catch(err => {
          console.warn(`Initial play attempt failed for ${label}:`, err);
        });

        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(err => console.error(`Error playing video on metadata load (${label}):`, err));
        };
      }
    }
  }, [stream, label]);

  return (
    <div className="relative w-full aspect-video rounded-3xl bg-zinc-950 overflow-hidden shadow-2xl border border-zinc-800 transition-all duration-300 hover:border-zinc-700">
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className={`w-full h-full object-cover ${isLocal ? 'scale-x-[-1]' : ''}`}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 gap-3">
          <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-inner">
            <svg
              className="w-8 h-8 text-zinc-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 3l18 18"
              />
            </svg>
          </div>
          <p className="text-sm font-medium text-zinc-400">{label} is offline</p>
        </div>
      )}
      <div className="absolute bottom-4 left-4 bg-zinc-950/80 backdrop-blur-md px-3.5 py-1.5 rounded-full text-xs font-semibold text-zinc-200 border border-zinc-800 flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${stream ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
        {label}
      </div>
    </div>
  );
};

export const CallWindow: React.FC = () => {
  const { localStream, remoteStream, remotePeer } = useCallStore();

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center justify-center">
        {/* Local Stream (Muted locally to prevent loopback) */}
        <VideoStream
          stream={localStream}
          muted={true}
          label="You (Local)"
        />

        {/* Remote Stream */}
        <VideoStream
          stream={remoteStream}
          muted={false}
          label={remotePeer ? `${remotePeer.name} (${remotePeer.role.toLowerCase()})` : 'Waiting for participant...'}
        />
      </div>
    </div>
  );
};
