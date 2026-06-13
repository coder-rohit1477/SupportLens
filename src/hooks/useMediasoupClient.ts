import { useEffect, useRef } from 'react';
import { Device } from 'mediasoup-client';
import { types as MediasoupClientTypes } from 'mediasoup-client';
import { useSocket } from './useSocket';
import { useCallStore, CallConnectionState } from '../store/useCallStore';
import {
  JoinPayload,
  CreateTransportResponse,
  ChatMessage,
  MessageReceivedPayload,
  NewProducerPayload,
  ProducerClosedPayload,
  PeerInfo,
  SendMessagePayload,
} from '../types/mediasoup';

export function useMediasoupClient() {
  const { socket, isConnected } = useSocket();
  const deviceRef = useRef<Device | null>(null);
  const reconnectSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSessionIdRef = useRef<string>('');
  const localUserIdRef = useRef<string>('');
  const localUserNameRef = useRef<string>('');
  const localUserRoleRef = useRef<'AGENT' | 'CUSTOMER' | ''>('');
  
  // Keep local references to transports, producers, and consumers for WebRTC cleanup
  const sendTransportRef = useRef<MediasoupClientTypes.Transport | null>(null);
  const recvTransportRef = useRef<MediasoupClientTypes.Transport | null>(null);
  const producersRef = useRef<Map<string, MediasoupClientTypes.Producer>>(new Map());
  const consumersRef = useRef<Map<string, MediasoupClientTypes.Consumer>>(new Map());

  // Buffer to queue remote producers arriving before receive transport setup is complete
  const pendingProducersRef = useRef<NewProducerPayload[]>([]);

  const {
    localStream,
    remoteStream,
    audioMuted,
    videoStopped,
    setLocalStream,
    setRemoteStream,
    setConnectionState,
    setAudioMuted,
    setVideoStopped,
    setRemotePeer,
    setLocalIdentity,
    addChatMessage,
    setChatMessages,
    resetCall,
  } = useCallStore();

  /**
   * Initializes the call by joining the session and setting up WebRTC.
   */
  const startCall = async (sessionId: string, userId: string, name: string, role: 'AGENT' | 'CUSTOMER') => {
    if (!socket || !isConnected) {
      console.warn('Socket not connected. Cannot join call.');
      return;
    }

    activeSessionIdRef.current = sessionId;
    localUserIdRef.current = userId;
    localUserNameRef.current = name;
    localUserRoleRef.current = role;
    setLocalIdentity({ userId, name, role });
    setConnectionState('connecting');

    const joinPayload: JoinPayload = { sessionId, userId, name, role };

    socket.emit('join', joinPayload, async (res: { success: boolean; routerRtpCapabilities: any; peers?: PeerInfo[]; messages?: ChatMessage[]; error?: string }) => {
      if (!res.success) {
        console.error('Failed to join room:', res.error);
        if (typeof window !== 'undefined' && res.error) {
          alert(`Join failed: ${res.error}`);
        }
        setConnectionState('disconnected');
        return;
      }

      console.log('Joined session room successfully, initializing SFU device...');
      
      try {
        // Initialize Mediasoup Device
        const device = new Device();
        await device.load({ routerRtpCapabilities: res.routerRtpCapabilities });
        deviceRef.current = device;

        // Set remote peer if someone is already in the room
        if (res.peers && res.peers.length > 0) {
          setRemotePeer(res.peers[0]);
        }

        setChatMessages(res.messages ?? []);

        // Initialize user media
        const stream = await initLocalMedia();

        // Create Transports using the resolved stream reference directly (prevents Zustand update races)
        // If stream is null (e.g. insecure context), we can still join for chat but transports won't produce media
        if (stream) {
          await setupTransports(stream);
        } else {
          console.warn('Proceeding without local media tracks (chat only mode)');
        }

        setConnectionState('connected');
      } catch (error) {
        console.error('Error starting Mediasoup signaling loop:', error);
        setConnectionState('disconnected');
      }
    });
  };

  /**
   * Captures camera and microphone tracks.
   */
  const initLocalMedia = async () => {
    try {
      console.log('Requesting local media tracks...');

      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('Camera/Microphone unavailable on insecure connection. Use HTTPS for media access.');
        // Show an alert to the user for visibility
        if (typeof window !== 'undefined') {
          alert('Camera/Microphone unavailable on insecure connection. Use HTTPS for media access.');
        }
        return null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
      });

      setLocalStream(stream);
      return stream;
    } catch (error) {
      console.error('Error accessing mic/camera:', error);
      throw error;
    }
  };

  /**
   * Requests parameters and sets up client-side send and receive transports.
   */
  const setupTransports = async (stream: MediaStream) => {
    const device = deviceRef.current;
    if (!device) throw new Error('Mediasoup device not initialized');

    // 1. Create Send Transport
    await new Promise<void>((resolve, reject) => {
      socket.emit('createWebRtcTransport', { direction: 'send' }, (res: { success: boolean; transportParams: CreateTransportResponse; error?: string }) => {
        if (!res.success) return reject(new Error(res.error));
        
        const sendTransport = device.createSendTransport(res.transportParams);
        sendTransportRef.current = sendTransport;

        sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
          socket.emit(
            'connectWebRtcTransport',
            { transportId: sendTransport.id, dtlsParameters },
            (connectRes: { success: boolean; error?: string }) => {
              if (connectRes.success) callback();
              else errback(new Error(connectRes.error));
            }
          );
        });

        sendTransport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
          socket.emit(
            'produce',
            { transportId: sendTransport.id, kind, rtpParameters, appData },
            (produceRes: { success: boolean; producerId: string; error?: string }) => {
              if (produceRes.success) callback({ id: produceRes.producerId });
              else errback(new Error(produceRes.error));
            }
          );
        });

        resolve();
      });
    });

    // 2. Create Receive Transport
    await new Promise<void>((resolve, reject) => {
      socket.emit('createWebRtcTransport', { direction: 'recv' }, (res: { success: boolean; transportParams: CreateTransportResponse; error?: string }) => {
        if (!res.success) return reject(new Error(res.error));

        const recvTransport = device.createRecvTransport(res.transportParams);
        recvTransportRef.current = recvTransport;

        recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
          socket.emit(
            'connectWebRtcTransport',
            { transportId: recvTransport.id, dtlsParameters },
            (connectRes: { success: boolean; error?: string }) => {
              if (connectRes.success) callback();
              else errback(new Error(connectRes.error));
            }
          );
        });

        resolve();
      });
    });

    // 3. Start producing local media to the send transport
    await startProducing(stream);

    // 4. Flush any queued remote producers that arrived during setup
    const pending = [...pendingProducersRef.current];
    pendingProducersRef.current = [];
    for (const item of pending) {
      if (consumersRef.current.has(item.producerId)) {
        continue;
      }
      await consumeProducer(item.producerId, item.kind);
    }
  };

  /**
   * Begins sending audio & video tracks to the server-side SFU.
   */
  const startProducing = async (stream: MediaStream) => {
    const sendTransport = sendTransportRef.current;

    if (!sendTransport || !stream) {
      console.warn('Cannot produce: Send transport or local stream missing');
      return;
    }

    const audioTrack = stream.getAudioTracks()[0];
    const videoTrack = stream.getVideoTracks()[0];

    if (audioTrack) {
      const audioProducer = await sendTransport.produce({ track: audioTrack, appData: { mediaType: 'audio' } });
      producersRef.current.set('audio', audioProducer);
    }

    if (videoTrack) {
      const videoProducer = await sendTransport.produce({ track: videoTrack, appData: { mediaType: 'video' } });
      producersRef.current.set('video', videoProducer);
    }

    console.log('Local media tracks are now producing to SFU');
  };

  /**
   * Consumes a remote media producer track.
   */
  const consumeProducer = async (producerId: string, kind: 'audio' | 'video') => {
    const device = deviceRef.current;
    const recvTransport = recvTransportRef.current;

    if (!device || !recvTransport) {
      console.warn('Cannot consume: Mediasoup device or receive transport not ready');
      return;
    }

    return new Promise<void>((resolve) => {
      socket.emit(
        'consume',
        {
          transportId: recvTransport.id,
          producerId,
          rtpCapabilities: device.rtpCapabilities,
        },
        async (res: { success: boolean; consumerParams: MediasoupClientTypes.ConsumerOptions; error?: string }) => {
          if (!res.success) {
            console.error('Failed to consume producer:', res.error);
            resolve();
            return;
          }

          try {
            const consumer = await recvTransport.consume(res.consumerParams);
            
            // Ensure track is enabled
            consumer.track.enabled = true;
            
            consumersRef.current.set(producerId, consumer);

            // Resume consumer stream on server
            socket.emit('resumeConsumer', { consumerId: consumer.id }, (resumeRes: { success: boolean; error?: string }) => {
              if (!resumeRes.success) {
                console.error('Failed to resume consumer on server');
                resolve();
                return;
              }

              // Use functional update to avoid race conditions with multiple tracks arriving at once
              const currentStream = useCallStore.getState().remoteStream;
              const currentTracks = currentStream ? currentStream.getTracks() : [];
              
              if (!currentTracks.find(t => t.id === consumer.track.id)) {
                const newStream = new MediaStream([...currentTracks, consumer.track]);
                setRemoteStream(newStream);
              }
              resolve();
            });
          } catch (error) {
            console.error('Error creating client consumer:', error);
            resolve();
          }
        }
      );
    });
  };

  /**
   * Re-syncs any active remote producers after a peer reconnects.
   * This covers reconnect windows where a newProducer event can be missed.
   */
  const syncRemoteProducers = () => {
    if (!socket || !isConnected) return;

    socket.emit('getRoomProducers', async (res: { success: boolean; producers?: NewProducerPayload[]; error?: string }) => {
      if (!res.success || !res.producers) {
        if (res.error) {
          console.error('Failed to resync room producers:', res.error);
        }
        return;
      }

      for (const item of res.producers) {
        if (consumersRef.current.has(item.producerId)) {
          continue;
        }

        await consumeProducer(item.producerId, item.kind);
      }
    });
  };

  const scheduleRemoteProducerSync = () => {
    if (reconnectSyncTimerRef.current) {
      clearTimeout(reconnectSyncTimerRef.current);
    }

    reconnectSyncTimerRef.current = setTimeout(() => {
      reconnectSyncTimerRef.current = null;
      syncRemoteProducers();
    }, 250);
  };

  /**
   * Sends a chat message through Socket.IO and stores it locally immediately.
   */
  const sendMessage = (text: string) => {
    const trimmedText = text.trim();
    if (!socket || !isConnected || !trimmedText) return;

    const sessionId = activeSessionIdRef.current;
    const senderId = localUserIdRef.current;
    const senderName = localUserNameRef.current;
    const senderRole = localUserRoleRef.current;

    if (!sessionId || !senderId || !senderName || !senderRole) return;

    const message: ChatMessage = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      sessionId,
      senderId,
      senderName,
      senderRole: senderRole as any,
      type: 'text',
      text: trimmedText,
      createdAt: new Date().toISOString(),
    };

    addChatMessage(message);
    socket.emit('sendMessage', {
      sessionId,
      message,
    } satisfies SendMessagePayload);
  };

  /**
   * Sends a file message through Socket.IO and stores it locally immediately.
   */
  const sendFileMessage = (fileName: string, fileUrl: string, mimeType: string) => {
    if (!socket || !isConnected) return;

    const sessionId = activeSessionIdRef.current;
    const senderId = localUserIdRef.current;
    const senderName = localUserNameRef.current;
    const senderRole = localUserRoleRef.current;

    if (!sessionId || !senderId || !senderName || !senderRole) return;

    const message: ChatMessage = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      sessionId,
      senderId,
      senderName,
      senderRole: senderRole as any,
      type: 'file',
      fileName,
      fileUrl,
      mimeType,
      createdAt: new Date().toISOString(),
    };

    addChatMessage(message);
    socket.emit('sendMessage', {
      sessionId,
      message,
    } satisfies SendMessagePayload);
  };

  /**
   * Toggles the state of the local microphone.
   */
  const toggleMute = () => {
    const stream = useCallStore.getState().localStream;
    const isMuted = useCallStore.getState().audioMuted;
    if (!stream) return;

    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = isMuted; // enable if it was muted, disable if unmuted
      setAudioMuted(!isMuted);
    }
  };

  /**
   * Toggles the state of the local video camera.
   */
  const toggleVideo = () => {
    const stream = useCallStore.getState().localStream;
    const isStopped = useCallStore.getState().videoStopped;
    if (!stream) return;

    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = isStopped; // enable if it was stopped, disable if running
      setVideoStopped(!isStopped);
    }
  };

  /**
   * Ends the call session, informing the signaling server.
   */
  const endCall = (sessionId: string) => {
    if (socket && isConnected) {
      socket.emit('endCall', { sessionId });
    }
    cleanupCall();
  };

  /**
   * Local cleanup method for clearing WebRTC transports and streams.
   */
  const cleanupCall = () => {
    console.log('Cleaning up local WebRTC call resources...');
    activeSessionIdRef.current = '';
    localUserIdRef.current = '';
    localUserNameRef.current = '';
    localUserRoleRef.current = '';

    // Close all local consumers
    for (const consumer of consumersRef.current.values()) {
      try {
        consumer.close();
      } catch (err) {
        console.error('Error closing consumer on cleanup:', err);
      }
    }
    consumersRef.current.clear();

    // Close all local producers
    for (const producer of producersRef.current.values()) {
      try {
        producer.close();
      } catch (err) {
        console.error('Error closing producer on cleanup:', err);
      }
    }
    producersRef.current.clear();

    // Close transports
    if (sendTransportRef.current) {
      try {
        sendTransportRef.current.close();
      } catch (err) {
        console.error('Error closing send transport:', err);
      }
      sendTransportRef.current = null;
    }
    if (recvTransportRef.current) {
      try {
        recvTransportRef.current.close();
      } catch (err) {
        console.error('Error closing recv transport:', err);
      }
      recvTransportRef.current = null;
    }

    // Stop all media tracks using the latest store reference to avoid closure traps
    const activeLocalStream = useCallStore.getState().localStream;
    if (activeLocalStream) {
      activeLocalStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (err) {
          console.error('Error stopping media track:', err);
        }
      });
    }

    deviceRef.current = null;
    resetCall();
  };

  // Attach socket signaling listeners
  useEffect(() => {
    if (!socket || !isConnected) return;

    // Handle new incoming producers
    const handleNewProducer = (payload: NewProducerPayload) => {
      if (consumersRef.current.has(payload.producerId)) {
        return;
      }

      console.log(`New remote producer detected: ${payload.producerId} (${payload.kind})`);
      if (!recvTransportRef.current) {
        console.log('Receive transport not ready. Queuing remote producer:', payload.producerId);
        pendingProducersRef.current.push(payload);
      } else {
        consumeProducer(payload.producerId, payload.kind);
      }
    };

    // Handle remote producer closed
    const handleProducerClosed = (payload: ProducerClosedPayload) => {
      console.log(`Remote producer closed: ${payload.producerId}`);
      const consumer = consumersRef.current.get(payload.producerId);
      if (consumer) {
        consumer.close();
        consumersRef.current.delete(payload.producerId);

        // Remove track from the remote stream
        const stream = useCallStore.getState().remoteStream;
        if (stream) {
          const tracks = stream.getTracks();
          const match = tracks.find((t) => t.id === consumer.track.id);
          if (match) {
            stream.removeTrack(match);
            // If no tracks left, clear the stream completely
            if (stream.getTracks().length === 0) {
              setRemoteStream(null);
            } else {
              setRemoteStream(new MediaStream(stream.getTracks())); // trigger re-render
            }
          }
        }
      }
    };

    // Handle peer joined
    const handlePeerJoined = (peer: PeerInfo) => {
      console.log(`Peer joined: ${peer.name} (${peer.role})`);
      setRemotePeer(peer);
      setConnectionState('connected');
      scheduleRemoteProducerSync();
    };

    // Handle peer left
    const handlePeerLeft = (payload: { userId: string }) => {
      console.log(`Peer left the room: ${payload.userId}`);
      setRemotePeer(null);
      setRemoteStream(null);
    };

    // Handle call ended from server
    const handleCallEnded = () => {
      console.log('Call was ended by the other participant');
      cleanupCall();
    };

    // Reconnection placeholders for Customer
    const handleCustomerDisconnected = () => {
      console.log('Customer disconnected. Waiting for reconnection...');
      setConnectionState('reconnecting');
    };

    const handleCustomerReconnected = () => {
      console.log('Customer reconnected.');
      setConnectionState('connected');
      scheduleRemoteProducerSync();
    };

    const handleMessageReceived = (payload: MessageReceivedPayload) => {
      const incomingMessage = payload.message;

      if (
        incomingMessage.senderId === localUserIdRef.current &&
        incomingMessage.sessionId === activeSessionIdRef.current
      ) {
        return;
      }

      addChatMessage(incomingMessage);
    };

    socket.on('newProducer', handleNewProducer);
    socket.on('producerClosed', handleProducerClosed);
    socket.on('peerJoined', handlePeerJoined);
    socket.on('peerLeft', handlePeerLeft);
    socket.on('callEnded', handleCallEnded);
    socket.on('customerDisconnected', handleCustomerDisconnected);
    socket.on('customerReconnected', handleCustomerReconnected);
    socket.on('messageReceived', handleMessageReceived);

    return () => {
      if (reconnectSyncTimerRef.current) {
        clearTimeout(reconnectSyncTimerRef.current);
        reconnectSyncTimerRef.current = null;
      }

      socket.off('newProducer', handleNewProducer);
      socket.off('producerClosed', handleProducerClosed);
      socket.off('peerJoined', handlePeerJoined);
      socket.off('peerLeft', handlePeerLeft);
      socket.off('callEnded', handleCallEnded);
      socket.off('customerDisconnected', handleCustomerDisconnected);
      socket.off('customerReconnected', handleCustomerReconnected);
      socket.off('messageReceived', handleMessageReceived);
    };
  }, [socket, isConnected]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      cleanupCall();
    };
  }, []);

  return {
    startCall,
    endCall,
    sendMessage,
    sendFileMessage,
    toggleMute,
    toggleVideo,
    cleanupCall,
  };
}
