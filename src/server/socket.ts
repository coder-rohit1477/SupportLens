import { Server, Socket } from 'socket.io';
import { types as MediasoupTypes } from 'mediasoup';
import { roomManager, UserRole } from './rooms';
import { prisma } from './prisma';
import { createWebRtcTransport } from './mediasoup';
import {
  JoinPayload,
  ConnectTransportPayload,
  ProducePayload,
  ConsumePayload,
  SendMessagePayload,
} from '../types/mediasoup';

/**
 * Attaches Socket.IO listeners to manage WebRTC signaling and call state.
 */
export function setupSocketIO(io: Server): void {
  io.on('connection', (socket: Socket) => {
    console.log(`New socket connection: ${socket.id}`);

    // Track state on socket data object for lookup on disconnect
      socket.data = {
        sessionId: '',
        userId: '',
        name: '',
        role: '' as UserRole,
        participantSessionId: '',
      };

    /**
     * Join Room signaling event. Initializes router & registers peer.
     */
    socket.on('join', async (payload: JoinPayload, callback: (res: any) => void) => {
      try {
        const { sessionId, userId, name, role } = payload;
        socket.data.sessionId = sessionId;
        socket.data.userId = userId;
        socket.data.name = name;
        socket.data.role = role;

        // Session tracking logic
        try {
          // 1. Create Session if not exists
          await prisma.session.upsert({
            where: { sessionId },
            update: {}, // Don't change anything if it already exists
            create: { sessionId },
          });

          // 2. Create ParticipantSession row
          const participantSession = await prisma.participantSession.create({
            data: {
              sessionId,
              userId,
              role,
              name,
            },
          });
          socket.data.participantSessionId = participantSession.id;
        } catch (dbError) {
          console.error('Error during session tracking (join):', dbError);
        }

        // Add peer to the room manager (handles reconnect replacement internally)
        const room = await roomManager.createRoom(sessionId);

        // If a peer with the same userId already exists in the room, disconnect their old socket.
        // This ensures duplicate tabs under the same user identity are kicked/disconnected.
        const existingPeer = room.peers.get(userId);
        if (existingPeer) {
          console.log(`User ${userId} is reconnecting/joining. Disconnecting old socket: ${existingPeer.socketId}`);
          const oldSocket = io.sockets.sockets.get(existingPeer.socketId);
          if (oldSocket) {
            oldSocket.disconnect(true);
          }
        }

        const peer = await roomManager.addPeer(sessionId, userId, socket.id, name, role);

        // Join the Socket.IO room
        socket.join(sessionId);

        // Retrieve other active peers in this room
        const activePeers = Array.from(room.peers.values())
          .filter((p) => p.id !== userId)
          .map((p) => ({
            id: p.id,
            name: p.name,
            role: p.role,
          }));

        const messageStore = prisma as any;
        let storedMessages: any[] = [];
        try {
          storedMessages = await messageStore.message.findMany({
            where: { sessionId },
            orderBy: { createdAt: 'asc' },
          });
        } catch (error) {
          console.error('Error loading chat history:', error);
        }

        // Respond with router capabilities and list of existing peers
        callback({
          success: true,
          routerRtpCapabilities: room.router.rtpCapabilities,
          peers: activePeers,
          messages: storedMessages.map((message) => ({
            id: message.id,
            sessionId: message.sessionId,
            senderId: message.senderId,
            senderName: message.senderName,
            senderRole: message.senderRole as UserRole,
            type: message.type as 'text' | 'file',
            text: message.text,
            fileName: message.fileName,
            fileUrl: message.fileUrl,
            mimeType: message.mimeType,
            createdAt: message.createdAt.toISOString(),
          })),
        });

        // Broadcast to other peers that someone new joined
        socket.to(sessionId).emit('peerJoined', {
          userId,
          name,
          role,
        });

        if (role === 'CUSTOMER') {
          // Explicit reconnect signal helps the remote side clear waiting state
          // and resync media after a refresh/rejoin.
          socket.to(sessionId).emit('customerReconnected', { userId });
        }

        // Immediately notify new peer of all existing producers in the room
        for (const otherPeer of room.peers.values()) {
          if (otherPeer.id !== userId) {
            for (const producer of otherPeer.producers.values()) {
              socket.emit('newProducer', {
                producerId: producer.id,
                producerUserId: otherPeer.id,
                producerRole: otherPeer.role,
                kind: producer.kind,
              });
            }
          }
        }
      } catch (error: any) {
        console.error('Error joining room:', error);
        callback({ success: false, error: error.message });
      }
    });

    /**
     * Create WebRtcTransport signaling event.
     */
    socket.on('createWebRtcTransport', async (payload: { direction: 'send' | 'recv' }, callback: (res: any) => void) => {
      const { sessionId, userId } = socket.data;
      try {
        const room = roomManager.getRoom(sessionId);
        if (!room) throw new Error(`Room ${sessionId} not found`);

        const transport = await createWebRtcTransport(room.router);
        
        // Save the transport's direction in its appData property
        transport.appData = { direction: payload.direction };
        
        roomManager.addTransport(sessionId, userId, transport);

        callback({
          success: true,
          transportParams: {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
          },
        });
      } catch (error: any) {
        console.error('Error creating WebRtcTransport:', error);
        callback({ success: false, error: error.message });
      }
    });

    /**
     * Connect WebRtcTransport signaling event.
     */
    socket.on('connectWebRtcTransport', async (payload: ConnectTransportPayload, callback: (res: any) => void) => {
      const { sessionId, userId } = socket.data;
      try {
        const room = roomManager.getRoom(sessionId);
        const peer = room?.peers.get(userId);
        const transport = peer?.transports.get(payload.transportId);

        if (!transport) throw new Error(`Transport ${payload.transportId} not found`);

        await transport.connect({ dtlsParameters: payload.dtlsParameters });
        callback({ success: true });
      } catch (error: any) {
        console.error('Error connecting WebRtcTransport:', error);
        callback({ success: false, error: error.message });
      }
    });

    /**
     * Produce media track signaling event.
     */
    socket.on('produce', async (payload: ProducePayload, callback: (res: any) => void) => {
      const { sessionId, userId, role } = socket.data;
      try {
        const room = roomManager.getRoom(sessionId);
        const peer = room?.peers.get(userId);
        const transport = peer?.transports.get(payload.transportId);

        if (!transport) throw new Error(`Transport ${payload.transportId} not found`);

        const producer = await transport.produce({
          kind: payload.kind,
          rtpParameters: payload.rtpParameters as MediasoupTypes.RtpParameters,
          appData: payload.appData,
        });

        roomManager.addProducer(sessionId, userId, producer);

        // Send producer ID back to source
        callback({ success: true, producerId: producer.id });

        // Notify other room participants about the new producer
        socket.to(sessionId).emit('newProducer', {
          producerId: producer.id,
          producerUserId: userId,
          producerRole: role,
          kind: producer.kind,
        });

        // Cleanup producer when closed or transport closes
        producer.on('transportclose', () => {
          console.log(`Producer transport closed: ${producer.id}`);
          producer.close();
          peer?.producers.delete(producer.id);
        });
      } catch (error: any) {
        console.error('Error producing track:', error);
        callback({ success: false, error: error.message });
      }
    });

    /**
     * Consume media track signaling event.
     */
    socket.on('consume', async (payload: ConsumePayload, callback: (res: any) => void) => {
      const { sessionId, userId } = socket.data;
      try {
        const room = roomManager.getRoom(sessionId);
        const peer = room?.peers.get(userId);

        if (!room) throw new Error(`Room ${sessionId} not found`);
        if (!peer) throw new Error(`Peer ${userId} not found`);

        // Find the recv transport of this peer by checking its appData direction
        const recvTransport = Array.from(peer.transports.values()).find(
          (t) => t.appData.direction === 'recv'
        );

        if (!recvTransport) {
          throw new Error('Receive transport not found for peer');
        }

        // Check if the router can consume the requested producer
        if (
          !room.router.canConsume({
            producerId: payload.producerId,
            rtpCapabilities: payload.rtpCapabilities as MediasoupTypes.RtpCapabilities,
          })
        ) {
          throw new Error('Router cannot consume the specified producer');
        }

        // Create the consumer in a paused state
        const consumer = await recvTransport.consume({
          producerId: payload.producerId,
          rtpCapabilities: payload.rtpCapabilities as MediasoupTypes.RtpCapabilities,
          paused: true,
        });

        roomManager.addConsumer(sessionId, userId, consumer);

        callback({
          success: true,
          consumerParams: {
            id: consumer.id,
            producerId: payload.producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
          },
        });

        // Clean up consumer on closing
        consumer.on('transportclose', () => {
          console.log(`Consumer transport closed: ${consumer.id}`);
          consumer.close();
          peer.consumers.delete(consumer.id);
        });

        consumer.on('producerclose', () => {
          console.log(`Producer associated with consumer ${consumer.id} was closed`);
          socket.emit('producerClosed', { producerId: payload.producerId });
          consumer.close();
          peer.consumers.delete(consumer.id);
        });
      } catch (error: any) {
        console.error('Error consuming track:', error);
        callback({ success: false, error: error.message });
      }
    });

    /**
     * Returns the currently active producers in the room, excluding the requesting peer.
     * Used to resync media after reconnect without requiring a page refresh.
     */
    socket.on('getRoomProducers', (callback: (res: any) => void) => {
      const { sessionId, userId } = socket.data;
      try {
        const room = roomManager.getRoom(sessionId);
        if (!room) throw new Error(`Room ${sessionId} not found`);

        const producers = Array.from(room.peers.values())
          .filter((peer) => peer.id !== userId)
          .flatMap((peer) =>
            Array.from(peer.producers.values()).map((producer) => ({
              producerId: producer.id,
              producerUserId: peer.id,
              producerRole: peer.role,
              kind: producer.kind,
            }))
          );

        callback({ success: true, producers });
      } catch (error: any) {
        console.error('Error getting room producers:', error);
        callback({ success: false, error: error.message });
      }
    });

    /**
     * Resume consumer signaling event.
     */
    socket.on('resumeConsumer', async (payload: { consumerId: string }, callback: (res: any) => void) => {
      const { sessionId, userId } = socket.data;
      try {
        const room = roomManager.getRoom(sessionId);
        const peer = room?.peers.get(userId);
        const consumer = peer?.consumers.get(payload.consumerId);

        if (!consumer) throw new Error(`Consumer ${payload.consumerId} not found`);

        await consumer.resume();
        callback({ success: true });
      } catch (error: any) {
        console.error('Error resuming consumer:', error);
        callback({ success: false, error: error.message });
      }
    });

    /**
     * Chat relay event. Broadcasts a message to the rest of the room.
     */
    socket.on('sendMessage', (payload: SendMessagePayload) => {
      const { sessionId, userId, role, name } = socket.data;
      if (!sessionId || !userId) return;

      const { message: msg } = payload;

      (prisma as any).message.create({
        data: {
          sessionId,
          senderId: userId,
          senderName: name || msg.senderName,
          senderRole: role,
          type: msg.type || 'text',
          text: msg.text,
          fileName: msg.fileName,
          fileUrl: msg.fileUrl,
          mimeType: msg.mimeType,
        },
      })
        .then((savedMsg: any) => {
          io.to(sessionId).emit('messageReceived', {
            message: {
              id: savedMsg.id,
              sessionId: savedMsg.sessionId,
              senderId: savedMsg.senderId,
              senderName: savedMsg.senderName,
              senderRole: savedMsg.senderRole as UserRole,
              type: savedMsg.type as 'text' | 'file',
              text: savedMsg.text,
              fileName: savedMsg.fileName,
              fileUrl: savedMsg.fileUrl,
              mimeType: savedMsg.mimeType,
              createdAt: savedMsg.createdAt.toISOString(),
            },
          });
        })
        .catch((error: any) => {
          console.error('Error saving chat message:', error);
        });
    });

    /**
     * End call event. Initiated by either Agent or Customer.
     */
    socket.on('endCall', async (payload: { sessionId: string }) => {
      const { sessionId } = payload;
      const { userId, role, participantSessionId } = socket.data;
      console.log(`Call ended manually by socket ${socket.id} in room ${sessionId}`);

      // Update ParticipantSession leftAt
      if (participantSessionId) {
        try {
          await prisma.participantSession.update({
            where: { id: participantSessionId },
            data: { leftAt: new Date() },
          });
        } catch (dbError) {
          console.error('Error updating participant session (endCall):', dbError);
        }
      }

      const room = roomManager.getRoom(sessionId);
      const effectiveRole = room?.peers.get(userId)?.role ?? role;

      if (effectiveRole === 'CUSTOMER') {
        // Customer end-call should behave like a disconnect: remove only that peer,
        // keep the room alive, and let the Agent enter reconnect/waiting state.
        await roomManager.removePeer(sessionId, userId, socket.id);
        socket.to(sessionId).emit('customerDisconnected', { userId });
        return;
      }

      // Agent end-call closes the entire session for both participants.
      await roomManager.closeRoom(sessionId);
      io.to(sessionId).emit('callEnded', { sessionId, reason: 'MANUAL_HANGUP' });
    });

    /**
     * Disconnect handler. Supports 60s reconnection grace period for the Customer.
     */
    socket.on('disconnect', async () => {
      const { sessionId, userId, role, participantSessionId } = socket.data;
      if (!sessionId || !userId) return;

      console.log(`Socket disconnected: ${socket.id} (User: ${userId}, Role: ${role})`);

      // Update ParticipantSession leftAt
      if (participantSessionId) {
        try {
          await prisma.participantSession.update({
            where: { id: participantSessionId },
            data: { leftAt: new Date() },
          });
        } catch (dbError) {
          console.error('Error updating participant session (disconnect):', dbError);
        }
      }

      if (role === 'CUSTOMER') {
        // Emit transient disconnect state, but release the room slot immediately.
        // Refresh/reconnect should not keep a stale peer occupying room capacity.
        console.log(`Customer ${userId} disconnected. Removing peer immediately...`);
        socket.to(sessionId).emit('customerDisconnected', { userId });
        await roomManager.removePeer(sessionId, userId, socket.id);
      } else {
        // Agent or other disconnect (immediate cleanup)
        await roomManager.removePeer(sessionId, userId, socket.id);
        socket.to(sessionId).emit('peerLeft', { userId });
      }
    });
  });
}
