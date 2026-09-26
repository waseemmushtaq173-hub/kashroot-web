'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Send, Loader2, WifiOff, Wifi, AlertTriangle } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

/**
 * ChatThread — Real-time order/appointment chat
 *
 * Realtime gateway (Module 6 — verified against
 *   src/modules/realtime/realtime.gateway.ts):
 *
 *   Transport   : Socket.IO (ws/wss)
 *   Server URL  : process.env.NEXT_PUBLIC_WS_URL
 *   Auth        : { token: accessToken } via socket.auth
 *   Rooms       : automatically joined on connection by the gateway
 *                 based on orderId or appointmentId in socket.handshake.auth
 *
 *   Client → Server events:
 *     'chat:send'  { roomId: string, content: string }  → void
 *
 *   Server → Client events:
 *     'chat:message'  ChatMessage          → append to thread
 *     'chat:history'  ChatMessage[]        → replace thread on join
 *     'chat:error'    { message: string }  → show error toast
 *
 *   ChatMessage shape:
 *     { id, roomId, senderId, senderName, senderRole, content, sentAt: string }
 *
 *   Room ID convention (Module 6):
 *     orderId present       → roomId = `order:${orderId}`
 *     appointmentId present → roomId = `appointment:${appointmentId}`
 *
 * Connection lifecycle:
 *   1. Connect on mount with auth token + roomId.
 *   2. Receive 'chat:history' to populate existing messages.
 *   3. Receive 'chat:message' for live messages, append to list.
 *   4. Disconnect on unmount (cleanup).
 *
 * Connection status indicator:
 *   - connecting: grey spinner
 *   - connected:  green Wifi icon
 *   - disconnected/error: red WifiOff + reconnect hint
 *
 * Accessibility:
 *   - Message list: role=log aria-live=polite aria-label, auto-scrolls
 *   - New messages: aria-live=polite on the list (role=log implies live)
 *   - Connection status: aria-live=assertive on disconnect
 *   - Send button: aria-label
 *   - Input: aria-label + aria-describedby for char count
 *   - Empty state: no raw spinners — status text always present
 */

type SenderRole = 'FARMER' | 'BUYER' | 'REGIONAL_ADMIN' | 'PLATFORM_ADMIN';

interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderRole: SenderRole;
  content: string;
  sentAt: string;
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

const ROLE_LABELS: Record<SenderRole, string> = {
  FARMER:          'Farmer',
  BUYER:           'Buyer',
  REGIONAL_ADMIN:  'Regional Admin',
  PLATFORM_ADMIN:  'Platform Admin',
};

const MAX_CHARS = 1000;

function fmtTime(iso: string) {
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  if (status === 'connected') {
    return (
      <span
        className="flex items-center gap-1.5 text-caption text-kr-success-700"
        aria-label="Chat connected"
      >
        <Wifi className="w-3 h-3" aria-hidden="true" /> Connected
      </span>
    );
  }
  if (status === 'connecting') {
    return (
      <span
        className="flex items-center gap-1.5 text-caption text-kr-text-secondary"
        aria-label="Connecting to chat"
        aria-live="polite"
      >
        <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> Connecting…
      </span>
    );
  }
  return (
    <span
      className="flex items-center gap-1.5 text-caption text-kr-danger-600"
      aria-label="Chat disconnected"
      aria-live="assertive"
    >
      <WifiOff className="w-3 h-3" aria-hidden="true" />
      Disconnected — reconnecting…
    </span>
  );
}

export interface ChatThreadProps {
  /** Scope: pass exactly one of orderId or appointmentId */
  orderId?: string;
  appointmentId?: string;
  /** Current user id, from auth store */
  currentUserId: string;
  /** Access token for socket auth */
  accessToken: string;
  /** Display name for empty/header state */
  participantName?: string;
}

export function ChatThread({
  orderId,
  appointmentId,
  currentUserId,
  accessToken,
  participantName,
}: ChatThreadProps) {
  const roomId = orderId
    ? `order:${orderId}`
    : appointmentId
    ? `appointment:${appointmentId}`
    : '';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput]       = useState('');
  const [status, setStatus]     = useState<ConnectionStatus>('connecting');
  const [socketError, setSocketError] = useState<string | null>(null);

  const socketRef  = useRef<Socket | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const connect = useCallback(() => {
    if (!roomId || !accessToken) return;

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3001';

    // Module 6 realtime gateway: socket.auth carries the JWT + roomId
    const socket = io(wsUrl, {
      auth: { token: accessToken, roomId },
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socket.on('connect',    () => { setStatus('connected'); setSocketError(null); });
    socket.on('disconnect', () => setStatus('disconnected'));
    socket.on('connect_error', (err) => {
      setStatus('error');
      setSocketError(err.message);
    });

    // Full history on room join
    socket.on('chat:history', (history: ChatMessage[]) => {
      setMessages(history);
    });

    // Live incoming messages — append
    socket.on('chat:message', (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on('chat:error', ({ message }: { message: string }) => {
      setSocketError(message);
    });

    socketRef.current = socket;
  }, [roomId, accessToken]);

  useEffect(() => {
    connect();
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [connect]);

  function sendMessage() {
    const content = input.trim();
    if (!content || status !== 'connected' || !socketRef.current) return;
    socketRef.current.emit('chat:send', { roomId, content });
    setInput('');
  }

  const charsLeft = MAX_CHARS - input.length;

  return (
    <section
      className="flex flex-col h-full min-h-0 border border-kr-border-default
                 rounded-xl overflow-hidden bg-kr-bg-surface"
      aria-label={participantName ? `Chat with ${participantName}` : 'Chat'}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between gap-4 px-4 py-3
                   border-b border-kr-border-subtle bg-kr-bg-raised"
      >
        <div>
          <p className="font-medium text-body-sm text-kr-text-primary">
            {participantName ? `Chat with ${participantName}` : 'Chat'}
          </p>
          <p className="text-caption text-kr-text-secondary">
            {orderId
              ? `Order #${orderId.slice(-8).toUpperCase()}`
              : appointmentId
              ? `Appointment #${appointmentId.slice(-8).toUpperCase()}`
              : ''}
          </p>
        </div>
        <ConnectionBadge status={status} />
      </div>

      {/* Message list */}
      <div
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
        aria-relevant="additions"
        className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0"
      >
        {messages.length === 0 && status === 'connected' && (
          <div className="kr-empty-state py-8">
            <p className="text-body text-kr-text-secondary">No messages yet</p>
            <p className="text-body-sm text-kr-text-disabled">
              Send the first message below.
            </p>
          </div>
        )}

        {status === 'connecting' && messages.length === 0 && (
          <div className="flex items-center justify-center py-8 gap-2 text-kr-text-secondary">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            <span className="text-body-sm">Loading chat history…</span>
          </div>
        )}

        {messages.map((msg) => {
          const isMe = msg.senderId === currentUserId;
          return (
            <div
              key={msg.id}
              className={`flex ${ isMe ? 'justify-end' : 'justify-start' }`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 space-y-0.5 ${
                  isMe
                    ? 'bg-kr-primary-500 text-white rounded-br-sm'
                    : 'bg-kr-bg-raised border border-kr-border-subtle rounded-bl-sm'
                }`}
              >
                {!isMe && (
                  <p className="text-caption font-medium text-kr-primary-600">
                    {msg.senderName} &middot; {ROLE_LABELS[msg.senderRole]}
                  </p>
                )}
                <p className={`text-body-sm ${ isMe ? 'text-white' : 'text-kr-text-primary' }`}>
                  {msg.content}
                </p>
                <p className={`text-caption ${ isMe ? 'text-white/70' : 'text-kr-text-disabled' } text-right`}>
                  <time dateTime={msg.sentAt}>{fmtTime(msg.sentAt)}</time>
                </p>
              </div>
            </div>
          );
        })}

        {/* Auto-scroll anchor */}
        <div ref={listEndRef} aria-hidden="true" />
      </div>

      {/* Socket error inline */}
      {socketError && (
        <div
          role="alert"
          className="flex items-center gap-2 px-4 py-2
                     bg-kr-fill-danger-subtle border-t border-kr-border-danger"
        >
          <AlertTriangle className="w-3 h-3 text-kr-danger-600 shrink-0" aria-hidden="true" />
          <p className="text-caption text-kr-danger-700 flex-1">{socketError}</p>
          <button
            onClick={() => { socketRef.current?.disconnect(); connect(); }}
            className="text-caption font-medium text-kr-danger-700 underline hover:no-underline"
          >
            Reconnect
          </button>
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-kr-border-subtle bg-kr-bg-raised">
        <div className="flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <label htmlFor="chat-input" className="sr-only">Message</label>
            <textarea
              id="chat-input"
              rows={1}
              placeholder={
                status !== 'connected'
                  ? 'Connecting…'
                  : `Message ${participantName ?? 'counterparty'}…`
              }
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, MAX_CHARS))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              disabled={status !== 'connected'}
              className="kr-input resize-none overflow-hidden
                         field-sizing-content max-h-32 py-2"
              aria-label="Chat message"
              aria-describedby="chat-charlimit"
              style={{ fieldSizing: 'content' } as React.CSSProperties}
            />
          </div>

          <button
            onClick={sendMessage}
            disabled={!input.trim() || status !== 'connected'}
            aria-label="Send message"
            className="kr-btn-primary p-2.5 rounded-lg self-end shrink-0
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <p
          id="chat-charlimit"
          className={`text-caption mt-1 text-right ${
            charsLeft < 50
              ? 'text-kr-danger-600'
              : 'text-kr-text-disabled'
          }`}
          aria-live="polite"
        >
          {charsLeft < 100 ? `${charsLeft} characters remaining` : ''}
        </p>
      </div>
    </section>
  );
}
