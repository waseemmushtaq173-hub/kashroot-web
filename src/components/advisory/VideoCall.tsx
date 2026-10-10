'use client';

/**
 * A video call between a farmer and an expert, straight in the browser
 * (WebRTC) — no app, no extra account. The two browsers exchange their
 * connection details through the call_signals table, read every second.
 *
 * The expert always makes the offer and the farmer answers. Whoever joins
 * second still connects: the expert re-offers when it sees the farmer join.
 * Direct connections work on most Wi-Fi and 4G networks; set TURN_URLS (see
 * /api/turn) for networks that block them.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic, MicOff, PhoneOff, RefreshCw, Video, VideoOff } from 'lucide-react';

import { supabase } from '@/lib/db/client';

type Phase = 'starting' | 'waiting' | 'connecting' | 'connected' | 'ended' | 'failed' | 'error';

interface Signal {
  id: number;
  kind: 'join' | 'offer' | 'answer' | 'ice' | 'bye';
  payload: { session?: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } | null;
}

const PHASE_TEXT: Record<Phase, string> = {
  starting: 'Starting your camera…',
  waiting: 'Waiting for the other person to join…',
  connecting: 'Connecting…',
  connected: 'Connected',
  ended: 'The call has ended.',
  failed: 'The call could not connect.',
  error: 'The call could not start.',
};

export interface VideoCallProps {
  requestId: string;
  me: string;
  role: 'farmer' | 'expert';
  otherName: string;
  /** For a WhatsApp fallback when a direct call can't connect. */
  otherPhone?: string | null;
  onClose: () => void;
}

export function VideoCall({ requestId, me, role, otherName, otherPhone, onClose }: VideoCallProps) {
  const [phase, setPhase] = useState<Phase>('starting');
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const session = useRef<string | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const lastId = useRef(0);
  const iceServers = useRef<RTCIceServer[]>([{ urls: 'stun:stun.l.google.com:19302' }]);
  const stopped = useRef(false);

  const send = useCallback(
    async (kind: Signal['kind'], payload: Signal['payload'] = null) => {
      await supabase.from('call_signals').insert({ request_id: requestId, kind, payload });
    },
    [requestId],
  );

  const makePc = useCallback(() => {
    pc.current?.close();
    const conn = new RTCPeerConnection({ iceServers: iceServers.current });
    stream.current?.getTracks().forEach((t) => conn.addTrack(t, stream.current!));
    conn.ontrack = (e) => {
      if (remoteRef.current && e.streams[0]) remoteRef.current.srcObject = e.streams[0];
    };
    conn.onicecandidate = (e) => {
      if (e.candidate && session.current) void send('ice', { session: session.current, candidate: e.candidate.toJSON() });
    };
    conn.onconnectionstatechange = () => {
      if (conn !== pc.current) return;
      if (conn.connectionState === 'connected') setPhase('connected');
      else if (conn.connectionState === 'connecting') setPhase('connecting');
      else if (conn.connectionState === 'failed') setPhase('failed');
    };
    pendingIce.current = [];
    pc.current = conn;
    return conn;
  }, [send]);

  const offer = useCallback(async () => {
    const conn = makePc();
    session.current = crypto.randomUUID();
    const desc = await conn.createOffer();
    await conn.setLocalDescription(desc);
    await send('offer', { session: session.current, sdp: conn.localDescription!.toJSON() });
  }, [makePc, send]);

  const flushIce = useCallback(async () => {
    const conn = pc.current;
    if (!conn?.remoteDescription) return;
    for (const c of pendingIce.current.splice(0)) await conn.addIceCandidate(c).catch(() => undefined);
  }, []);

  const handle = useCallback(
    async (s: Signal) => {
      const p = s.payload ?? {};
      if (s.kind === 'bye') {
        setPhase('ended');
        return;
      }
      if (s.kind === 'join') {
        if (role === 'expert') {
          setPhase('connecting');
          await offer();
        }
        return;
      }
      if (s.kind === 'offer' && role === 'farmer' && p.sdp && p.session) {
        setPhase('connecting');
        const conn = makePc();
        session.current = p.session;
        await conn.setRemoteDescription(p.sdp);
        await flushIce();
        const answer = await conn.createAnswer();
        await conn.setLocalDescription(answer);
        await send('answer', { session: p.session, sdp: conn.localDescription!.toJSON() });
        return;
      }
      if (s.kind === 'answer' && role === 'expert' && p.sdp && p.session === session.current && pc.current && !pc.current.remoteDescription) {
        await pc.current.setRemoteDescription(p.sdp);
        await flushIce();
        return;
      }
      if (s.kind === 'ice' && p.candidate && p.session === session.current) {
        if (pc.current?.remoteDescription) await pc.current.addIceCandidate(p.candidate).catch(() => undefined);
        else pendingIce.current.push(p.candidate);
      }
    },
    [flushIce, makePc, offer, role, send],
  );

  const cleanup = useCallback(() => {
    stopped.current = true;
    pc.current?.close();
    pc.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  useEffect(() => {
    stopped.current = false;
    let timer: number | undefined;

    const poll = async () => {
      if (stopped.current) return;
      const { data } = await supabase
        .from('call_signals')
        .select('id, kind, payload')
        .eq('request_id', requestId)
        .neq('sender_id', me)
        .gt('id', lastId.current)
        .order('id')
        .limit(50);
      for (const s of (data ?? []) as Signal[]) {
        lastId.current = Math.max(lastId.current, s.id);
        try {
          await handle(s);
        } catch (err) {
          console.error('call signal', s.kind, err);
        }
      }
      if (!stopped.current) timer = window.setTimeout(poll, pc.current?.connectionState === 'connected' ? 2500 : 1000);
    };

    (async () => {
      try {
        try {
          stream.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } });
        } catch {
          // No camera (or it is busy): a voice call is still useful.
          stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
          setCameraOff(true);
        }
        if (stopped.current) return cleanup();
        if (localRef.current) localRef.current.srcObject = stream.current;
        const ice = await fetch('/api/turn').then((r) => r.json()).catch(() => null);
        if (Array.isArray(ice?.iceServers)) iceServers.current = ice.iceServers;
        // Only signals from now on count: older ones belong to earlier calls.
        const { data: latest, error: readErr } = await supabase.from('call_signals').select('id').eq('request_id', requestId).order('id', { ascending: false }).limit(1);
        if (readErr) throw new Error(readErr.message);
        lastId.current = latest?.[0]?.id ?? 0;
        await send('join');
        setPhase('waiting');
        if (role === 'expert') await offer();
        void poll();
      } catch (err) {
        const name = (err as { name?: string })?.name;
        setError(
          name === 'NotAllowedError'
            ? 'Allow the camera and microphone for this site (tap the lock icon in the address bar), then try again.'
            : name === 'NotFoundError'
              ? 'No microphone was found on this device.'
              : 'The call could not start. Check your internet connection and try again.',
        );
        setPhase('error');
      }
    })();

    return () => {
      window.clearTimeout(timer);
      cleanup();
    };
  }, [cleanup, handle, me, offer, requestId, role, send]);

  const hangUp = async () => {
    await send('bye').catch(() => undefined);
    cleanup();
    onClose();
  };

  const toggleMute = () => {
    stream.current?.getAudioTracks().forEach((t) => (t.enabled = muted));
    setMuted(!muted);
  };

  const toggleCamera = () => {
    stream.current?.getVideoTracks().forEach((t) => (t.enabled = cameraOff));
    setCameraOff(!cameraOff);
  };

  // Farmers often need the back camera to show the tree.
  const flipCamera = async () => {
    const next = facing === 'user' ? 'environment' : 'user';
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ video: { facingMode: next, width: { ideal: 640 }, height: { ideal: 480 } } });
      const track = fresh.getVideoTracks()[0];
      const sender = pc.current?.getSenders().find((s) => s.track?.kind === 'video');
      await sender?.replaceTrack(track);
      stream.current?.getVideoTracks().forEach((t) => {
        t.stop();
        stream.current?.removeTrack(t);
      });
      stream.current?.addTrack(track);
      if (localRef.current) localRef.current.srcObject = stream.current;
      setFacing(next);
    } catch {
      setError('Could not switch the camera on this device.');
    }
  };

  const digits = (otherPhone ?? '').replace(/\D/g, '').slice(-10);
  const whatsapp = /^[6-9]\d{9}$/.test(digits) ? `https://wa.me/91${digits}` : null;
  const live = phase === 'connected';

  return (
    <div className="overflow-hidden rounded-3xl bg-slate-950 text-white shadow-[0_24px_60px_rgba(15,23,42,0.35)]">
      <div className="relative aspect-[3/4] w-full bg-slate-900 sm:aspect-video">
        <video ref={remoteRef} autoPlay playsInline className="h-full w-full object-cover" aria-label={`${otherName}'s video`} />
        {!live && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div>
              {['starting', 'waiting', 'connecting'].includes(phase) && <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-300" aria-hidden />}
              <p className="mt-3 text-lg font-semibold">{PHASE_TEXT[phase]}</p>
              <p className="mt-1 text-sm text-slate-300">{phase === 'waiting' ? `${otherName} will appear here when they open the call.` : null}</p>
              {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
              {phase === 'failed' && (
                <p className="mt-3 text-sm text-slate-300">
                  Some mobile networks block direct video calls. Try Wi-Fi, or press Reconnect.
                  {whatsapp && (
                    <>
                      {' '}Or{' '}
                      <a href={whatsapp} target="_blank" rel="noreferrer" className="font-semibold text-emerald-300 underline">
                        video call on WhatsApp
                      </a>
                      .
                    </>
                  )}
                </p>
              )}
            </div>
          </div>
        )}
        <video ref={localRef} autoPlay playsInline muted className={`absolute bottom-3 right-3 h-28 w-20 rounded-xl object-cover ring-2 ring-white/70 sm:h-32 sm:w-44 ${cameraOff ? 'opacity-30' : ''} ${facing === 'user' ? '-scale-x-100' : ''}`} aria-label="Your camera" />
        <p className="absolute left-3 top-3 rounded-full bg-black/50 px-3 py-1 text-xs font-semibold">
          {live ? `● Live with ${otherName}` : otherName}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 p-3">
        <CallButton label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute} active={muted}>
          {muted ? <MicOff className="h-5 w-5" aria-hidden /> : <Mic className="h-5 w-5" aria-hidden />}
        </CallButton>
        <CallButton label={cameraOff ? 'Camera on' : 'Camera off'} onClick={toggleCamera} active={cameraOff}>
          {cameraOff ? <VideoOff className="h-5 w-5" aria-hidden /> : <Video className="h-5 w-5" aria-hidden />}
        </CallButton>
        <CallButton label="Switch camera" onClick={() => void flipCamera()}>
          <RefreshCw className="h-5 w-5" aria-hidden />
        </CallButton>
        {(phase === 'failed' || phase === 'ended') && (
          <CallButton label="Reconnect" onClick={() => { setPhase('connecting'); void (role === 'expert' ? offer() : send('join')); }}>
            <RefreshCw className="h-5 w-5" aria-hidden />
          </CallButton>
        )}
        <button type="button" onClick={() => void hangUp()} className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-rose-600 px-5 py-3 font-semibold text-white hover:bg-rose-700">
          <PhoneOff className="h-5 w-5" aria-hidden /> {phase === 'ended' || phase === 'error' ? 'Close' : 'End call'}
        </button>
      </div>
    </div>
  );
}

function CallButton({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={active} title={label} className={`grid h-12 w-12 cursor-pointer place-items-center rounded-full transition ${active ? 'bg-white text-slate-900' : 'bg-white/15 text-white hover:bg-white/25'}`}>
      {children}
    </button>
  );
}
