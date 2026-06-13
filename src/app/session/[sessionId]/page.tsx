'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useCallStore } from '../../../store/useCallStore';
import { useMediasoupClient } from '../../../hooks/useMediasoupClient';
import { CallWindow } from '../../../components/CallWindow';
import { ChatPanel } from '../../../components/ChatPanel';
import { ControlPanel } from '../../../components/ControlPanel';

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default function SessionPage({ params }: PageProps) {
  const unwrappedParams = React.use(params);
  const sessionId = unwrappedParams.sessionId;
  const searchParams = useSearchParams();
  const roleStorageKey = `supportlens:role:${sessionId}`;

  const { connectionState, remotePeer } = useCallStore();
  const { startCall, endCall, sendMessage, sendFileMessage, toggleMute, toggleVideo } = useMediasoupClient();

  // Lobby/Registration States
  const [joined, setJoined] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<'AGENT' | 'CUSTOMER' | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [mediaDevicesError, setMediaDevicesError] = useState<string | null>(null);
  const [lobbyStream, setLobbyStream] = useState<MediaStream | null>(null);
  const lobbyVideoRef = useRef<HTMLVideoElement>(null);

  // Handle demo authentication
  const handleLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError('');

    if (username === 'agent' && password === 'agent123') {
      setRole('AGENT');
    } else if (username === 'customer' && password === 'customer123') {
      setRole('CUSTOMER');
    } else {
      setAuthError('Invalid username or password');
    }
  };

  // Parse URL parameters for automatic name population
  useEffect(() => {
    const urlName = searchParams.get('name');
    if (urlName) {
      setName(urlName);
    }
  }, [searchParams]);

  // Activate local camera preview in the lobby
  useEffect(() => {
    if (joined) return;

    let activeStream: MediaStream | null = null;

    async function startLobbyPreview() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
        setMediaDevicesError('Camera/Mic access requires a Secure Context (HTTPS or localhost).');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false, // mute in preview to prevent feedback
        });
        activeStream = stream;
        setLobbyStream(stream);
        if (lobbyVideoRef.current) {
          lobbyVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.warn('Lobby camera preview not available:', err);
      }
    }

    startLobbyPreview();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [joined]);

  // Handle joining the actual WebRTC call session
  const handleJoin = () => {
    if (!name.trim() || !role) return;

    // Stop lobby camera preview before joining call
    if (lobbyStream) {
      lobbyStream.getTracks().forEach((track) => track.stop());
      setLobbyStream(null);
    }

    // Reuse the same identity across refreshes so reconnect logic can match the same peer.
    const userIdKey = `supportlens:userId:${sessionId}:${role.toLowerCase()}`;
    let userId = localStorage.getItem(userIdKey);
    if (!userId) {
      userId = `${role.toLowerCase()}-${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem(userIdKey, userId);
    }
    
    setJoined(true);
    startCall(sessionId, userId, name, role);
  };

  // Lobby UI View
  if (!joined) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col justify-center items-center text-zinc-100 p-6">
        <div className="w-full max-w-xl bg-zinc-900/60 backdrop-blur-2xl p-8 rounded-3xl border border-zinc-800 shadow-2xl flex flex-col gap-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">
              SupportLens Lobby
            </h1>
            <p className="text-sm text-zinc-500 mt-2">
              Verify your setup and authenticate to join session <span className="font-mono text-zinc-400">{sessionId}</span>
            </p>
          </div>

          {/* Camera Preview */}
          <div className="relative w-full aspect-video bg-zinc-950 rounded-2xl overflow-hidden border border-zinc-800 shadow-inner">
            {lobbyStream ? (
              <video
                ref={lobbyVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 gap-2">
                <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center animate-pulse">
                  <svg className="w-6 h-6 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3l18 18" />
                  </svg>
                </div>
                <p className="text-sm font-medium px-6 text-center">{mediaDevicesError || 'Camera is disabled or loading'}</p>
                {mediaDevicesError && (
                  <p className="text-[10px] text-zinc-600 mt-2 px-8 text-center uppercase tracking-tight font-bold">
                    Switch to a Secure Context or use a desktop browser
                  </p>
                )}
              </div>
            )}
            <div className="absolute bottom-4 left-4 bg-zinc-950/80 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-semibold text-zinc-300 border border-zinc-800">
              Camera Preview
            </div>
          </div>

          {/* Form Controls */}
          <div className="flex flex-col gap-4">
            {!role ? (
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Demo Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="agent or customer"
                    className="w-full bg-zinc-950 border border-zinc-850 rounded-xl px-4 py-3 text-zinc-150 placeholder-zinc-600 focus:outline-none focus:border-zinc-700 transition duration-200"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Demo Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full bg-zinc-950 border border-zinc-850 rounded-xl px-4 py-3 text-zinc-150 placeholder-zinc-600 focus:outline-none focus:border-zinc-700 transition duration-200"
                    required
                  />
                </div>
                {authError && <p className="text-rose-500 text-xs font-semibold">{authError}</p>}
                <button
                  type="button"
                  onClick={handleLogin}
                  className="w-full bg-zinc-100 hover:bg-zinc-200 text-zinc-950 py-3 rounded-xl font-bold text-sm transition-all shadow-lg"
                >
                  Verify Credentials
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Authenticated as</p>
                    <p className="text-sm font-bold text-zinc-100">{role}</p>
                  </div>
                  <button 
                    onClick={() => { setRole(null); setPassword(''); }}
                    className="text-[10px] font-bold text-zinc-500 hover:text-zinc-300 uppercase underline"
                  >
                    Change
                  </button>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Display Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full bg-zinc-950 border border-zinc-850 rounded-xl px-4 py-3 text-zinc-150 placeholder-zinc-600 focus:outline-none focus:border-zinc-700 transition duration-200"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleJoin}
                  disabled={!name.trim()}
                  className="w-full bg-gradient-to-r from-zinc-100 to-zinc-300 hover:from-zinc-200 hover:to-zinc-400 text-zinc-950 py-3.5 rounded-xl font-bold text-sm transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
                >
                  Join Meeting Room
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Active Calling UI View
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-between">
      {/* Header Bar */}
      <header className="py-4 px-6 bg-zinc-950/60 backdrop-blur-md border-b border-zinc-900 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-zinc-200 to-zinc-500 flex items-center justify-center shadow-lg">
            <span className="text-zinc-950 font-black text-sm">SL</span>
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight text-zinc-200">SupportLens Meeting</h2>
            <p className="text-xs text-zinc-500 font-mono">{sessionId}</p>
          </div>
        </div>

        {remotePeer && (
          <div className="bg-zinc-900 border border-zinc-850 px-4 py-1.5 rounded-full text-xs font-semibold text-zinc-300 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Connected with <span className="text-zinc-100">{remotePeer.name}</span>
          </div>
        )}
      </header>

      {/* Video Content Grid */}
      <main className="flex-1 flex items-center justify-center">
        {connectionState === 'disconnected' ? (
          <div className="text-center p-8 max-w-sm flex flex-col gap-4">
            <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-500 flex items-center justify-center mx-auto shadow-inner">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2 2m0 0l2-2m-2 2l-2 2m2-2l2 2M5 3a2 2 0 00-2 2v2a2 2 0 00.222.928l2.947 5.894a8 8 0 005.67 4.566L17 19a2 2 0 002-2v-2a2 2 0 00-2-2h-1.928a2 2 0 00-1.789 1.106l-.736 1.472a12.042 12.042 0 01-5.657-5.657l1.472-.736A2 2 0 009.68 10.378V8.452a2 2 0 00-2-2H5z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-zinc-200">Call Disconnected</h3>
              <p className="text-xs text-zinc-500 mt-1">The session has been terminated by a participant or has expired.</p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 text-zinc-300 py-2.5 rounded-xl text-xs font-semibold transition"
            >
              Rejoin Call
            </button>
          </div>
        ) : (
          <div className="w-full flex flex-col items-center justify-center gap-6 py-6">
            <CallWindow />
            <ChatPanel onSendMessage={sendMessage} onSendFile={sendFileMessage} />
          </div>
        )}
      </main>

      {/* Call Control Toolbar */}
      <ControlPanel
        sessionId={sessionId}
        toggleMute={toggleMute}
        toggleVideo={toggleVideo}
        endCall={endCall}
      />
    </div>
  );
}
