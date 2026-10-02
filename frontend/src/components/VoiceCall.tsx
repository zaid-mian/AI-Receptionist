import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Square, Radio, AlertCircle } from 'lucide-react';
import { isApiError, postSSE } from '../api/client';
import { formatTimer } from '../utils/format';

type CallState = 'idle' | 'starting' | 'listening' | 'thinking' | 'speaking' | 'error' | 'ended';

interface VoiceErrorInfo {
  title: string;
  message: string;
  recovery: string;
}

const GREETING =
  "Welcome to Faisal Hospital, this is Faisal Hospital Assistant. How can I help you today?";

const GREETING_UR = "السلام علیکم، فیصل ہسپتال سے فیصل ہسپتال اسسٹنٹ بول رہی ہوں۔ بتائیے، میں آپ کی کیا مدد کر سکتی ہوں؟";

type VoiceLanguage = 'en' | 'ur';

const STATE_LABEL: Record<CallState, string> = {
  idle: 'Ready',
  starting: 'Starting…',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
  error: 'Something went wrong',
  ended: 'Call ended',
};

interface VoiceCallProps {
  speechRate: number;
  onUserTurn: (text: string) => void;
  /** Called repeatedly with the full accumulated AI text while streaming. */
  onAiToken: (fullText: string) => void;
  onInterim: (text: string) => void;
}

function splitSentences(text: string): string[] {
  // Includes Urdu full stop (۔) and question mark (؟).
  const parts = text.match(/[^.!?;۔؟]+[.!?;۔؟]+["”']?|\S[^.!?;۔؟]*$/g);
  if (!parts) return [text];
  // Merge very short fragments so TTS doesn't stutter.
  const out: string[] = [];
  for (const p of parts) {
    const t = p.trim();
    if (!t) continue;
    if (out.length > 0 && out[out.length - 1].length < 24) out[out.length - 1] += ' ' + t;
    else out.push(t);
  }
  return out;
}

/**
 * Full browser voice-call state machine: mic → Web Speech STT → /api/v1/chat
 * (channel "voice") → speechSynthesis TTS. Clearly a browser demo, not PSTN.
 */
export default function VoiceCall({ speechRate, onUserTurn, onAiToken, onInterim }: VoiceCallProps) {
  const [callState, setCallState] = useState<CallState>('idle');
  const [muted, setMuted] = useState(false);
  const [language, setLanguage] = useState<VoiceLanguage>('en');
  const [urduVoiceMissing, setUrduVoiceMissing] = useState(false);
  const [error, setError] = useState<VoiceErrorInfo | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [typedInput, setTypedInput] = useState('');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const timerRef = useRef(0);
  const stateRef = useRef<CallState>('idle');
  const intentionalStopRef = useRef(false);
  const convIdRef = useRef<string | null>(null);
  const sseAbortRef = useRef<AbortController | null>(null);
  const mutedRef = useRef(false);
  const rateRef = useRef(speechRate);
  const speakResolveRef = useRef<(() => void) | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const latestInterimRef = useRef('');
  const silenceTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const noSpeechCountRef = useRef(0);
  const langRef = useRef<VoiceLanguage>('en');

  const onUserTurnRef = useRef(onUserTurn);
  const onAiTokenRef = useRef(onAiToken);
  const onInterimRef = useRef(onInterim);
  onUserTurnRef.current = onUserTurn;
  onAiTokenRef.current = onAiToken;
  onInterimRef.current = onInterim;
  rateRef.current = speechRate;

  const setState = (s: CallState) => {
    stateRef.current = s;
    if (mountedRef.current) setCallState(s);
  };

  const selectLanguage = (lang: VoiceLanguage) => {
    setLanguage(lang);
    langRef.current = lang;
  };

  /** True while the call is live (not ended / errored). Reads through an
   *  explicitly-typed local so TS control-flow narrowing can't leak in. */
  const isCallActive = (): boolean => {
    const s: CallState = stateRef.current;
    return s !== 'ended' && s !== 'error';
  };

  const fail = (info: VoiceErrorInfo) => {
    setError(info);
    setState('error');
  };

  /* ---------------- waveform ---------------- */

  const drawWave = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const state = stateRef.current;
    const bars = 48;
    const bw = W / bars;

    if (state === 'listening' && analyserRef.current) {
      const data = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(data);
      for (let i = 0; i < bars; i++) {
        const v = data[Math.floor((i / bars) * data.length * 0.7)] / 255;
        const h = Math.max(3, v * H * 0.9);
        ctx.fillStyle = '#059669';
        const x = i * bw + bw * 0.22;
        ctx.beginPath();
        ctx.roundRect(x, (H - h) / 2, bw * 0.56, h, 3);
        ctx.fill();
      }
    } else if (state === 'speaking') {
      const t = performance.now() / 320;
      for (let i = 0; i < bars; i++) {
        const v = (Math.sin(t + i * 0.55) + 1) / 2;
        const h = 4 + v * H * 0.55;
        ctx.fillStyle = '#b45309';
        const x = i * bw + bw * 0.22;
        ctx.beginPath();
        ctx.roundRect(x, (H - h) / 2, bw * 0.56, h, 3);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = '#d0d5dd';
      ctx.beginPath();
      ctx.roundRect(0, H / 2 - 1.5, W, 3, 2);
      ctx.fill();
    }
    rafRef.current = requestAnimationFrame(drawWave);
  }, []);

  /* ---------------- TTS ---------------- */

  const pickVoice = (lang: VoiceLanguage): SpeechSynthesisVoice | null => {
    try {
      const voices = window.speechSynthesis.getVoices();
      if (lang === 'ur') {
        return (
          voices.find((v) => v.lang.toLowerCase().startsWith('ur')) ??
          voices.find((v) => v.lang.startsWith('en') && v.name.toLowerCase().includes('google')) ??
          voices.find((v) => v.lang.startsWith('en')) ??
          null
        );
      }
      return (
        voices.find((v) => v.lang.startsWith('en') && v.name.toLowerCase().includes('google')) ??
        voices.find((v) => v.lang.startsWith('en-US')) ??
        voices.find((v) => v.lang.startsWith('en')) ??
        null
      );
    } catch {
      return null;
    }
  };

  const fallbackSpeak = (text: string, onDone: () => void) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth) {
        onDone();
        return;
      }
      synth.cancel();
      if (synth.paused) synth.resume();
      const chunks = splitSentences(text).filter(Boolean);
      if (chunks.length === 0) {
        onDone();
        return;
      }
      const voice = pickVoice(langRef.current);
      let i = 0;
      let watchdog: number | null = window.setTimeout(() => {
        try { synth.cancel(); } catch { /* ignore */ }
        onDone();
      }, Math.max(20000, text.length * 200 + 10000));

      const next = () => {
        if (speakResolveRef.current === null) {
          if (watchdog) clearTimeout(watchdog);
          onDone();
          return;
        }
        if (i >= chunks.length) {
          if (watchdog) clearTimeout(watchdog);
          onDone();
          return;
        }
        const u = new SpeechSynthesisUtterance(chunks[i]);
        u.lang = langRef.current === 'ur' ? 'ur-PK' : 'en-US';
        u.rate = rateRef.current;
        if (voice) u.voice = voice;
        u.onend = () => {
          i++;
          next();
        };
        u.onerror = () => {
          if (watchdog) clearTimeout(watchdog);
          onDone();
        };
        synth.speak(u);
      };
      next();
    } catch {
      onDone();
    }
  };

  const speak = useCallback(
    (text: string): Promise<void> =>
      new Promise((resolve) => {
        speakResolveRef.current = resolve;
        let watchdog: number | null = null;
        let finished = false;

        const cleanupBlob = () => {
          if (blobUrlRef.current) {
            try {
              URL.revokeObjectURL(blobUrlRef.current);
            } catch {
              // ignore
            }
            blobUrlRef.current = null;
          }
        };

        const done = () => {
          if (finished) return;
          finished = true;
          cleanupBlob();
          if (watchdog) {
            clearTimeout(watchdog);
            watchdog = null;
          }
          if (speakResolveRef.current !== null) {
            speakResolveRef.current = null;
            resolve();
          }
        };

        // Generous safety timeout so audio is NEVER cut off prematurely while playing
        const maxTimeMs = Math.max(30000, text.length * 250);
        watchdog = window.setTimeout(() => {
          console.warn('[voice] speak watchdog triggered, resuming call');
          if (audioPlayerRef.current) {
            try { audioPlayerRef.current.pause(); } catch { /* ignore */ }
            audioPlayerRef.current = null;
          }
          done();
        }, maxTimeMs);

        // Fetch high-definition realistic Neural Voice from /api/v1/tts as Blob
        const ttsUrl = `/api/v1/tts?text=${encodeURIComponent(text)}&lang=${langRef.current}`;
        fetch(ttsUrl)
          .then((res) => {
            if (!res.ok) throw new Error(`TTS HTTP error ${res.status}`);
            return res.blob();
          })
          .then((blob) => {
            if (finished) return;
            cleanupBlob();
            const blobUrl = URL.createObjectURL(blob);
            blobUrlRef.current = blobUrl;
            const audio = new Audio(blobUrl);
            audio.playbackRate = rateRef.current;
            audioPlayerRef.current = audio;

            // When audio metadata loads, dynamically calibrate watchdog to actual duration + 10s grace
            audio.onloadedmetadata = () => {
              if (watchdog) clearTimeout(watchdog);
              const durMs = isFinite(audio.duration) && audio.duration > 0
                ? (audio.duration / rateRef.current + 10) * 1000
                : 35000;
              watchdog = window.setTimeout(() => {
                console.warn('[voice] audio playback exceeded calibrated duration, finishing');
                if (audioPlayerRef.current) {
                  try { audioPlayerRef.current.pause(); } catch { /* ignore */ }
                  audioPlayerRef.current = null;
                }
                done();
              }, durMs);
            };

            audio.onended = () => {
              audioPlayerRef.current = null;
              done();
            };

            audio.onerror = () => {
              audioPlayerRef.current = null;
              fallbackSpeak(text, done);
            };

            audio.play().catch(() => {
              audioPlayerRef.current = null;
              fallbackSpeak(text, done);
            });
          })
          .catch((err) => {
            console.warn('[voice] Neural Edge TTS fetch failed, using browser speech synthesis fallback:', err);
            fallbackSpeak(text, done);
          });
      }),
    [],
  );

  const stopSpeaking = useCallback(() => {
    if (audioPlayerRef.current) {
      try {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
      } catch {
        // ignore
      }
      audioPlayerRef.current = null;
    }
    if (blobUrlRef.current) {
      try {
        URL.revokeObjectURL(blobUrlRef.current);
      } catch {
        // ignore
      }
      blobUrlRef.current = null;
    }
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // ignore
    }
    speakResolveRef.current?.();
    speakResolveRef.current = null;
  }, []);

  /* ---------------- STT ---------------- */

  const beginListening = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec || !isCallActive()) return;
    onInterimRef.current('');
    setState('listening');
    intentionalStopRef.current = false;
    try {
      rec.start();
    } catch {
      // Already started — harmless.
    }
  }, []);

  const interrupt = useCallback(() => {
    stopSpeaking();
    if (isCallActive()) beginListening();
  }, [stopSpeaking, beginListening]);

  const think = useCallback(
    async (text: string) => {
      setState('thinking');
      const ctrl = new AbortController();
      sseAbortRef.current = ctrl;
      let full = '';
      try {
        await postSSE(
          '/chat',
          { conversation_id: convIdRef.current ?? undefined, message: text, channel: 'voice' },
          (ev) => {
            if (!isCallActive()) return;
            switch (ev.event) {
              case 'meta':
                convIdRef.current = ev.data.conversation_id;
                break;
              case 'token':
                full += ev.data.text;
                onAiTokenRef.current(full);
                break;
              case 'error':
                full = full || 'Sorry, I ran into a problem just now. Could you say that again?';
                onAiTokenRef.current(full);
                break;
              case 'done':
                break;
            }
          },
          ctrl.signal,
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const msg = isApiError(err) ? err.message : 'Network problem reaching the AI.';
        full = full || `Sorry, ${msg} Please try again.`;
        onAiTokenRef.current(full);
      } finally {
        if (sseAbortRef.current === ctrl) sseAbortRef.current = null;
      }
      if (!isCallActive()) return;
      const reply =
        full.trim() ||
        (langRef.current === 'ur' ? 'معذرت، میں سمجھ نہیں پایا۔ دوبارہ کہیں گے؟' : "Sorry, I didn't catch that. Could you say it again?");
      onAiTokenRef.current(reply);
      setState('speaking');
      // Stop mic while speaking to eliminate speaker acoustic feedback loop
      intentionalStopRef.current = true;
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      await speak(reply);
      if (!isCallActive()) return;
      beginListening();
    },
    [beginListening, speak],
  );

  const submitSpeech = useCallback(
    (raw: string) => {
      if (silenceTimerRef.current) {
        window.clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      const text = raw.trim();
      if (!text || intentionalStopRef.current || stateRef.current !== 'listening') return;
      latestInterimRef.current = '';
      noSpeechCountRef.current = 0;
      intentionalStopRef.current = true;
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      onInterimRef.current('');
      onUserTurnRef.current(text);
      void think(text);
    },
    [think],
  );

  const wireRecognition = useCallback(
    (rec: SpeechRecognition) => {
      rec.lang = langRef.current === 'ur' ? 'ur-PK' : 'en-US';
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.continuous = true;

      rec.onresult = (e: SpeechRecognitionEvent) => {
        let interim = '';
        let finalText = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript;
          else interim += r[0].transcript;
        }

        const candidate = (finalText + ' ' + interim).trim();
        if (candidate) {
          latestInterimRef.current = candidate;
          onInterimRef.current(candidate);

          if (silenceTimerRef.current) {
            window.clearTimeout(silenceTimerRef.current);
          }
          // Give user a generous 2.0s pause buffer so they never get cut off mid-thought
          silenceTimerRef.current = window.setTimeout(() => {
            if (latestInterimRef.current.trim() && stateRef.current === 'listening') {
              submitSpeech(latestInterimRef.current);
            }
          }, 2000);
        }
      };

      rec.onerror = (e: SpeechRecognitionErrorEvent) => {
        if (intentionalStopRef.current) return;
        const err = e.error;
        if (err === 'aborted') return;
        if (err === 'no-speech') {
          // If the user had spoken words that didn't trigger isFinal before silence timeout
          if (latestInterimRef.current.trim() && stateRef.current === 'listening') {
            submitSpeech(latestInterimRef.current);
            return;
          }
          // Chrome stops recognition after silence — just resume listening
          window.setTimeout(() => {
            if (stateRef.current === 'listening' && isCallActive()) beginListening();
          }, 250);
          return;
        }
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          fail({
            title: 'Microphone blocked',
            message: 'Microphone access was denied. The browser needs permission to use your microphone for this demo.',
            recovery: 'Click the lock/tune icon in the address bar, allow the microphone, then try again.',
          });
          return;
        }
        if (err === 'network') {
          fail({
            title: 'Speech service unreachable',
            message: 'The browser speech-recognition service could not be reached. Check your internet connection.',
            recovery: 'Reconnect and try again.',
          });
          return;
        }
        fail({
          title: 'Speech recognition error',
          message: `The microphone ran into a problem (${err}).`,
          recovery: 'Try starting the call again.',
        });
      };

      rec.onend = () => {
        if (intentionalStopRef.current || !isCallActive()) return;
        // If recognition ended while there was pending spoken text, commit it immediately
        if (latestInterimRef.current.trim() && stateRef.current === 'listening') {
          submitSpeech(latestInterimRef.current);
          return;
        }
        const s = stateRef.current;
        if (s === 'listening') {
          window.setTimeout(() => {
            if (stateRef.current === 'listening' && isCallActive()) beginListening();
          }, 200);
        }
      };
    },
    [beginListening, submitSpeech],
  );

  /* ---------------- call lifecycle ---------------- */

  const teardown = useCallback(() => {
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    latestInterimRef.current = '';
    intentionalStopRef.current = true;
    try {
      recognitionRef.current?.abort();
    } catch {
      // ignore
    }
    recognitionRef.current = null;
    sseAbortRef.current?.abort();
    sseAbortRef.current = null;
    stopSpeaking();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    cancelAnimationFrame(rafRef.current);
    window.clearInterval(timerRef.current);
  }, [stopSpeaking]);

  const startCall = useCallback(async () => {
    setError(null);
    setState('starting');

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || !('speechSynthesis' in window) || !navigator.mediaDevices?.getUserMedia) {
      fail({
        title: 'Voice not supported',
        message: "This browser doesn't support the Web Speech API. Voice demo needs Chrome or Edge on desktop.",
        recovery: 'Open this page in Chrome or Edge, or use the text chat instead.',
      });
      return;
    }

    let stream: MediaStream;
    try {
      // echoCancellation reduces the chance the mic hears the AI's own voice
      // through the speakers and mistakes it for a barge-in.
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } });
    } catch {
      fail({
        title: 'Microphone permission denied',
        message: 'We could not access your microphone. The demo needs microphone permission to listen.',
        recovery: 'Allow microphone access in the browser prompt (or the address-bar icon), then press Start again.',
      });
      return;
    }
    streamRef.current = stream;

    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        const actx = new Ctx();
        audioCtxRef.current = actx;
        const src = actx.createMediaStreamSource(stream);
        const analyser = actx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        analyserRef.current = analyser;
      }
    } catch {
      // Waveform is decorative; the call works without it.
    }
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(drawWave);

    const rec = new SR();
    recognitionRef.current = rec;
    wireRecognition(rec);

    // Warn honestly when the device has no Urdu TTS voice installed.
    if (langRef.current === 'ur') {
      const v = pickVoice('ur');
      setUrduVoiceMissing(!v || !v.lang.toLowerCase().startsWith('ur'));
    } else {
      setUrduVoiceMissing(false);
    }

    const startedAt = Date.now();
    setElapsed(0);
    window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    setState('speaking');
    await speak(langRef.current === 'ur' ? GREETING_UR : GREETING);
    if (stateRef.current === 'ended' || stateRef.current === 'error') return;
    beginListening();
  }, [beginListening, drawWave, speak, wireRecognition]);

  const endCall = useCallback(() => {
    teardown();
    onInterimRef.current('');
    setState('ended');
  }, [teardown]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    streamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    if (next) stopSpeaking();
  }, [stopSpeaking]);

  useEffect(() => {
    mountedRef.current = true;
    try {
      // Warm up the voice list (loads async in some browsers).
      window.speechSynthesis?.getVoices();
    } catch {
      // ignore
    }
    return () => {
      mountedRef.current = false;
      teardown();
    };
  }, [teardown]);

  const active = callState !== 'idle' && callState !== 'ended' && callState !== 'error';

  return (
    <div className="voice-stage" aria-live="polite" aria-label={`Call status: ${STATE_LABEL[callState]}`}>
      <div className="card-sub" style={{ letterSpacing: '0.08em', fontWeight: 700, fontSize: 11 }}>
        AI RECEPTIONIST · BROWSER VOICE DEMO
      </div>

      <div className="voice-status-box" aria-hidden="true">
        <div className="telemetry-header">
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--ink-4)', textTransform: 'uppercase' }}>
            Audio Channel Telemetry
          </span>
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>
            WebAudio 48kHz
          </span>
        </div>
        <div className={`voice-state-indicator ${callState}`}>
          {callState === 'error' ? (
            <AlertCircle size={16} strokeWidth={2} />
          ) : (
            <Radio size={16} strokeWidth={2} />
          )}
          <span>{callState === 'error' && error ? error.title : STATE_LABEL[callState]}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', wordBreak: 'break-word', maxWidth: '100%' }}>
          {callState === 'listening'
            ? 'Microphone stream open · Speak clearly'
            : callState === 'thinking'
            ? 'Processing clinical response...'
            : callState === 'speaking'
            ? 'Speech synthesizer transmitting...'
            : callState === 'error'
            ? error?.message || 'Audio pipeline halted'
            : 'Audio input channel on standby'}
        </div>
      </div>

      {active && <div className="voice-timer tnum">{formatTimer(elapsed)}</div>}

      <canvas ref={canvasRef} className="voice-waveform" width={420} height={52} aria-hidden="true" />

      {callState === 'idle' && (
        <>
          <div className="voice-lang-group">
            <span className="card-sub" style={{ fontWeight: 600 }}>Language / زبان:</span>
            <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }} role="group" aria-label="Voice language">
              <button
                className={`btn ${language === 'en' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => selectLanguage('en')}
                aria-pressed={language === 'en'}
              >
                English
              </button>
              <button
                className={`btn ${language === 'ur' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => selectLanguage('ur')}
                aria-pressed={language === 'ur'}
                lang="ur"
              >
                اردو
              </button>
            </div>
          </div>
          <button className="btn btn-primary btn-lg voice-start-btn" onClick={() => void startCall()} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Mic size={18} strokeWidth={2} /> Start Voice Conversation
          </button>
        </>
      )}

      {callState === 'starting' && <div className="card-sub">Requesting microphone…</div>}

      {active && (
        <>
          <div className="voice-controls">
            {callState === 'speaking' && (
              <button className="btn btn-secondary" onClick={interrupt} title="Stop AI speech and speak now" style={{ borderColor: '#f59e0b', color: '#b45309', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Square size={13} strokeWidth={2} /> Interrupt AI
              </button>
            )}
            {callState === 'listening' && (
              <span className="badge badge-accent" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', fontSize: 12 }}>
                <span className="status-dot green" />
                <Mic size={13} strokeWidth={2} /> Listening... Speak now
              </span>
            )}
            <button className="btn btn-secondary" onClick={toggleMute} aria-pressed={muted} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {muted ? (
                <>
                  <MicOff size={13} strokeWidth={2} /> Unmute
                </>
              ) : (
                <>
                  <Mic size={13} strokeWidth={2} /> Mute
                </>
              )}
            </button>
            <button className="btn btn-danger" onClick={endCall}>
              End Call
            </button>
          </div>

          <form
            className="voice-typed-form"
            onSubmit={(e) => {
              e.preventDefault();
              const text = typedInput.trim();
              if (!text || !isCallActive()) return;
              setTypedInput('');
              stopSpeaking();
              onInterimRef.current('');
              onUserTurnRef.current(text);
              void think(text);
            }}
          >
            <input
              type="text"
              className="input"
              style={{ flex: 1, minWidth: 0, fontSize: 13, padding: '8px 12px' }}
              placeholder={language === 'ur' ? 'یہاں ٹائپ کر کے بھی سوال پوچھ سکتے ہیں...' : 'Speak into mic or type message here...'}
              value={typedInput}
              onChange={(e) => setTypedInput(e.target.value)}
            />
            <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: 13, flexShrink: 0 }} disabled={!typedInput.trim()}>
              Send
            </button>
          </form>
        </>
      )}

      {callState === 'ended' && (
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={() => void startCall()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Mic size={14} strokeWidth={2} /> Start New Call
          </button>
        </div>
      )}

      {callState === 'error' && error && (
        <div style={{ maxWidth: 460 }}>
          <div className="error-state" style={{ padding: '12px 0 4px' }}>
            <div className="error-desc" style={{ maxWidth: 460 }}>
              <strong>{error.message}</strong>
              <br />
              {error.recovery}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 8 }}>
            <button className="btn btn-primary" onClick={() => void startCall()}>
              Try Again
            </button>
            <button className="btn btn-secondary" onClick={() => setState('idle')}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {muted && active && (
        <div className="card-sub" style={{ marginTop: 10 }}>
          Microphone muted
        </div>
      )}

      {urduVoiceMissing && active && language === 'ur' && (
        <div className="card-sub" style={{ marginTop: 10, maxWidth: 460 }}>
          No Urdu voice found on this device - replies will use the default voice and may sound
          English-accented. Install an Urdu TTS voice in your OS for the full experience.
        </div>
      )}

      <div className="voice-note">
        Browser voice demo - not a telephone call. PSTN integration (Twilio) not configured.
        You can interrupt the AI mid-reply: just start talking (barge-in).
        Keep answers short and conversational for the best experience.
      </div>
    </div>
  );
}
