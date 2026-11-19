// Test stand-ins for a Socket.IO namespace and TopSend's login setup, so the live leaderboard and
// live scorecard can be tested without a server, a browser, or a database.

import { AppError } from "../../src/utils/AppError.js";

/**
 * A Socket.IO namespace with just what the realtime modules use: middleware, connections, rooms
 * (emptied rooms are deleted, as Socket.IO does), fetchSockets, socketsLeave, and emit.
 */
export function fakeNamespace() {
  const rooms = new Map();
  const sockets = new Map();
  let middleware = async (_socket, next) => next();
  const handlers = {};
  let nextId = 1;

  function leaveRoom(socket, room) {
    const members = rooms.get(room);
    if (!members) return;
    members.delete(socket.id);
    socket.rooms.delete(room);
    if (members.size === 0) rooms.delete(room);
  }

  function makeSocket(token) {
    const listeners = {};
    const socket = {
      id: `socket-${nextId++}`,
      handshake: { auth: token === undefined ? {} : { token } },
      data: {},
      rooms: new Set(),
      received: [],
      on(event, listener) {
        listeners[event] = listener;
      },
      join(room) {
        if (!rooms.has(room)) rooms.set(room, new Set());
        rooms.get(room).add(socket.id);
        socket.rooms.add(room);
      },
      leave(room) {
        leaveRoom(socket, room);
      },
      emit(event, data) {
        socket.received.push({ event, data });
      },
      /** Sends a client event and waits for the acknowledgement. */
      request(event, payload) {
        return new Promise((resolve) => listeners[event](payload, resolve));
      },
      /** Events of one name the server sent this connection. */
      eventsNamed(event) {
        return socket.received.filter((entry) => entry.event === event).map((entry) => entry.data);
      },
      disconnect() {
        for (const room of [...socket.rooms]) leaveRoom(socket, room);
        sockets.delete(socket.id);
        listeners.disconnect?.("client namespace disconnect");
      },
    };
    return socket;
  }

  return {
    adapter: { rooms },
    use(fn) {
      middleware = fn;
    },
    on(event, handler) {
      handlers[event] = handler;
    },
    in(room) {
      return {
        fetchSockets: async () => [...(rooms.get(room) ?? [])].map((id) => sockets.get(id)),
        socketsLeave: () => {
          for (const id of [...(rooms.get(room) ?? [])]) leaveRoom(sockets.get(id), room);
        },
      };
    },
    to(room) {
      return {
        emit: (event, data) => {
          for (const id of rooms.get(room) ?? []) sockets.get(id).emit(event, data);
        },
      };
    },
    /** Opens a connection with this token (none for a Visitor). Rejects when it's refused. */
    async connect(token) {
      const socket = makeSocket(token);
      await new Promise((resolve, reject) => {
        middleware(socket, (error) => (error ? reject(error) : resolve()));
      });
      sockets.set(socket.id, socket);
      handlers.connection(socket);
      return socket;
    },
  };
}

/**
 * TopSend's login setup with tokens and sessions kept in memory. expireToken makes a token fail
 * as it does after 15 minutes; endSession ends a login, as logging out or deactivation does.
 */
export function fakeAuth() {
  const tokens = new Map();
  const expired = new Set();
  const endedSessions = new Set();
  const sessionChecks = [];
  return {
    sessionChecks,
    login(token, claims) {
      tokens.set(token, claims);
      return token;
    },
    expireToken(token) {
      expired.add(token);
    },
    endSession(sessionId) {
      endedSessions.add(sessionId);
    },
    accessTokens: {
      async verify(token) {
        if (expired.has(token)) throw new AppError(401, "TOKEN_EXPIRED", "Your login needs refreshing.");
        const claims = tokens.get(token);
        if (!claims) throw new AppError(401, "NOT_AUTHENTICATED", "Log in to continue.");
        return { ...claims };
      },
    },
    sessions: {
      async findActive(sessionId, userId) {
        sessionChecks.push({ sessionId, userId });
        if (endedSessions.has(sessionId)) {
          throw new AppError(401, "SESSION_EXPIRED", "Your session expired. Log in again to continue.");
        }
        return { _id: sessionId, user: userId };
      },
    },
  };
}

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
