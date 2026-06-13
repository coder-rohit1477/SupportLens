import { types } from 'mediasoup';
import { createRouter } from './mediasoup';
import { prisma } from './prisma';

export type UserRole = 'AGENT' | 'CUSTOMER';

export interface Peer {
  id: string; // userId
  socketId: string;
  name: string;
  role: UserRole;
  transports: Map<string, types.WebRtcTransport>;
  producers: Map<string, types.Producer>;
  consumers: Map<string, types.Consumer>;
}

export interface Room {
  id: string; // sessionId
  router: types.Router;
  peers: Map<string, Peer>; // userId -> Peer
}

class RoomManager {
  private rooms: Map<string, Room> = new Map();

  /**
   * Gets a room by sessionId.
   */
  public getRoom(sessionId: string): Room | undefined {
    return this.rooms.get(sessionId);
  }

  /**
   * Creates a room by sessionId if it does not exist.
   */
  public async createRoom(sessionId: string): Promise<Room> {
    let room = this.rooms.get(sessionId);
    if (!room) {
      const router = await createRouter();
      room = {
        id: sessionId,
        router,
        peers: new Map(),
      };
      this.rooms.set(sessionId, room);
      console.log(`Room created: ${sessionId}`);
    }
    return room;
  }

  /**
   * Adds a peer to a room. Supports exactly 2 participants (Agent + Customer).
   * Automatically cleans up the old peer connection state if they are reconnecting.
   */
  public async addPeer(
    sessionId: string,
    userId: string,
    socketId: string,
    name: string,
    role: UserRole
  ): Promise<Peer> {
    // Ensure the room exists
    const room = await this.createRoom(sessionId);

    // If peer is already in the room, clean up their old connection (reconnect scenario)
    if (room.peers.has(userId)) {
      console.log(`Peer ${userId} is reconnecting. Cleaning up old session...`);
      this.cleanupPeerResources(room.peers.get(userId)!);
      room.peers.delete(userId);
    }

    // Enforce role-based occupancy (Max 1 Agent, Max 1 Customer)
    for (const p of room.peers.values()) {
      if (p.role === role) {
        throw new Error(`${role === 'AGENT' ? 'Agent' : 'Customer'} already connected`);
      }
    }

    // Enforce 2-participant limit (redundant but safe)
    if (room.peers.size >= 2) {
      throw new Error(`Room ${sessionId} is full. Only 2 participants are allowed.`);
    }

    const peer: Peer = {
      id: userId,
      socketId,
      name,
      role,
      transports: new Map(),
      producers: new Map(),
      consumers: new Map(),
    };

    room.peers.set(userId, peer);
    console.log(`Peer added to room ${sessionId}: ${name} (${role}) with socket ${socketId}`);
    return peer;
  }

  /**
   * Removes a peer from a room and cleans up their resources.
   * If the room becomes empty, deletes the room.
   */
  public async removePeer(sessionId: string, userId: string, socketId?: string): Promise<void> {
    const room = this.rooms.get(sessionId);
    if (!room) return;

    const peer = room.peers.get(userId);
    if (peer) {
      if (socketId && peer.socketId !== socketId) {
        console.log(`removePeer ignored for ${userId}: socketId mismatch (expected ${peer.socketId}, got ${socketId})`);
        return;
      }
      this.cleanupPeerResources(peer);
      room.peers.delete(userId);
      console.log(`Peer removed from room ${sessionId}: ${peer.name} (${userId})`);
    }

    // Clean up room if empty
    if (room.peers.size === 0) {
      await this.closeRoom(sessionId);
    }
  }

  /**
   * Cleans up all transport, producer, and consumer resources for a peer.
   */
  private cleanupPeerResources(peer: Peer): void {
    // 1. Close all consumers
    for (const consumer of peer.consumers.values()) {
      try {
        consumer.close();
      } catch (error) {
        console.error(`Error closing consumer ${consumer.id}:`, error);
      }
    }
    peer.consumers.clear();

    // 2. Close all producers
    for (const producer of peer.producers.values()) {
      try {
        producer.close();
      } catch (error) {
        console.error(`Error closing producer ${producer.id}:`, error);
      }
    }
    peer.producers.clear();

    // 3. Close all transports. (This also automatically closes any producers/consumers on them in mediasoup)
    for (const transport of peer.transports.values()) {
      try {
        transport.close();
      } catch (error) {
        console.error(`Error closing transport ${transport.id}:`, error);
      }
    }
    peer.transports.clear();
  }

  /**
   * Closes the room, closing its router and deleting all peers.
   */
  public async closeRoom(sessionId: string): Promise<void> {
    const room = this.rooms.get(sessionId);
    if (!room) return;

    // Cleanup all remaining peers
    for (const peer of room.peers.values()) {
      this.cleanupPeerResources(peer);
    }
    room.peers.clear();

    // Close router
    try {
      room.router.close();
    } catch (error) {
      console.error(`Error closing router for room ${sessionId}:`, error);
    }

    this.rooms.delete(sessionId);
    console.log(`Room closed and deleted: ${sessionId}`);

    // Update Session in database
    try {
      const session = await prisma.session.findUnique({
        where: { sessionId },
      });

      if (session && !session.endedAt) {
        const endedAt = new Date();
        const durationSeconds = Math.floor(
          (endedAt.getTime() - session.startedAt.getTime()) / 1000
        );

        await prisma.session.update({
          where: { sessionId },
          data: {
            endedAt,
            durationSeconds,
          },
        });
        console.log(`Session ${sessionId} updated with duration: ${durationSeconds}s`);
      }
    } catch (error) {
      console.error(`Error updating session ${sessionId} in database:`, error);
    }
  }

  /**
   * Registers a transport for a peer in a room.
   */
  public addTransport(sessionId: string, userId: string, transport: types.WebRtcTransport): void {
    const room = this.rooms.get(sessionId);
    const peer = room?.peers.get(userId);
    if (!peer) {
      throw new Error(`Peer ${userId} not found in room ${sessionId}`);
    }
    peer.transports.set(transport.id, transport);
  }

  /**
   * Registers a producer for a peer in a room.
   */
  public addProducer(sessionId: string, userId: string, producer: types.Producer): void {
    const room = this.rooms.get(sessionId);
    const peer = room?.peers.get(userId);
    if (!peer) {
      throw new Error(`Peer ${userId} not found in room ${sessionId}`);
    }
    peer.producers.set(producer.id, producer);
  }

  /**
   * Registers a consumer for a peer in a room.
   */
  public addConsumer(sessionId: string, userId: string, consumer: types.Consumer): void {
    const room = this.rooms.get(sessionId);
    const peer = room?.peers.get(userId);
    if (!peer) {
      throw new Error(`Peer ${userId} not found in room ${sessionId}`);
    }
    peer.consumers.set(consumer.id, consumer);
  }
  /**
   * Returns all currently active rooms and participant counts.
   */
  public getActiveSessions() {
    return Array.from(this.rooms.values()).map(room => ({
      sessionId: room.id,
      participantCount: room.peers.size,
      participants: Array.from(room.peers.values()).map(p => ({
        userId: p.id,
        name: p.name,
        role: p.role,
      }))
    }));
  }
}

export const roomManager = new RoomManager();
export type { RoomManager };
