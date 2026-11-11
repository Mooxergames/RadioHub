import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Square } from 'lucide-react';
import { useGlobalPlayer } from '@/hooks/useGlobalPlayer.shell';

const CHANNELS = [
  { label: 'Left', pan: -1 },
  { label: 'Stereo', pan: 0 },
  { label: 'Right', pan: 1 },
] as const;
const DURATION = 1.2;
const FADE = 0.02;
const LEVEL = 0.03;
const START_TIMEOUT = 3_000;

type Channel = (typeof CHANNELS)[number];
type Status = { phase: 'idle' | 'starting' | 'playing' | 'error'; message: string };
type TestRun = {
  context: AudioContext;
  oscillator?: OscillatorNode;
  gain?: GainNode;
  panner?: StereoPannerNode;
  startedAt?: number;
  timer?: ReturnType<typeof setTimeout>;
  released?: Promise<void>;
};

function releaseRun(run: TestRun): Promise<void> {
  if (run.released) return run.released;
  clearTimeout(run.timer);
  let delay = 0;
  if (run.oscillator) {
    run.oscillator.onended = null;
    try {
      if (run.gain && run.startedAt !== undefined && run.context.state === 'running') {
        const now = run.context.currentTime;
        const end = run.startedAt + DURATION;
        const stopAt = Math.max(now, Math.min(now + FADE, end));
        // Reconstruct the envelope so an interrupted attack/release stays continuous.
        const level = LEVEL * Math.max(0, Math.min(1,
          (now - run.startedAt) / FADE, (end - now) / FADE));
        run.gain.gain.cancelScheduledValues(now);
        run.gain.gain.setValueAtTime(level, now);
        run.gain.gain.linearRampToValueAtTime(0, stopAt);
        run.oscillator.stop(stopAt);
        delay = (stopAt - now) * 1_000;
      } else {
        run.oscillator.stop();
      }
    } catch {
      // A failed/already-ended node still needs disconnecting and context closure.
    }
  }
  run.released = new Promise(resolve => {
    const finish = () => {
      for (const node of [run.oscillator, run.gain, run.panner]) {
        try { node?.disconnect(); } catch { /* Continue releasing the other nodes. */ }
      }
      try {
        if (run.context.state !== 'closed') void run.context.close().catch(() => {});
      } catch { /* Some implementations also throw synchronously when closing. */ }
      // Node shutdown, not a potentially stalled close() promise, gates the next tone.
      resolve();
    };
    if (delay > 0) setTimeout(finish, delay);
    else finish();
  });
  return run.released;
}

export default function AudioChannelTest() {
  const { pauseStation } = useGlobalPlayer();
  const [channel, setChannel] = useState<Channel>(CHANNELS[1]);
  const [status, setStatus] = useState<Status>({ phase: 'idle', message: 'Ready.' });
  const active = useRef<TestRun | null>(null);
  const generation = useRef(0);
  const silence = useRef<Promise<void>>(Promise.resolve());

  const cancel = useCallback(() => {
    generation.current += 1;
    const run = active.current;
    active.current = null;
    if (run) {
      silence.current = Promise.all([silence.current, releaseRun(run)]).then(() => {});
    }
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden && active.current) {
        cancel();
        setStatus({ phase: 'idle', message: 'Test stopped.' });
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      cancel();
    };
  }, [cancel]);

  const play = async () => {
    cancel();
    const token = generation.current;
    const previousStopped = silence.current;
    setStatus({ phase: 'starting', message: 'Starting test...' });
    try {
      pauseStation();
      if (typeof window.AudioContext !== 'function') {
        setStatus({ phase: 'error', message: 'Audio testing is unavailable in this browser.' });
        return;
      }
      if (document.hidden) {
        setStatus({ phase: 'idle', message: 'Test stopped.' });
        return;
      }
      const context = new window.AudioContext();
      const run: TestRun = { context };
      active.current = run;
      if (typeof context.createStereoPanner !== 'function') {
        cancel();
        setStatus({ phase: 'error', message: 'Audio testing is unavailable in this browser.' });
        return;
      }
      run.timer = setTimeout(() => {
        if (generation.current !== token) return;
        cancel();
        setStatus({ phase: 'error', message: 'Audio did not start. Try Play test again.' });
      }, START_TIMEOUT);

      // Resume within the click gesture, but wait for the previous tone to be silent.
      await Promise.all([context.resume(), previousStopped]);
      if (generation.current !== token) return;
      if (document.hidden) {
        cancel();
        setStatus({ phase: 'idle', message: 'Test stopped.' });
        return;
      }
      if (context.state !== 'running') throw new Error('Audio context did not resume');
      clearTimeout(run.timer);
      const oscillator = run.oscillator = context.createOscillator();
      const gain = run.gain = context.createGain();
      const panner = run.panner = context.createStereoPanner();
      const now = context.currentTime;
      const end = now + DURATION;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(440, now);
      panner.pan.setValueAtTime(channel.pan, now);
      gain.gain.value = 0;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(LEVEL, now + FADE);
      gain.gain.setValueAtTime(LEVEL, end - FADE);
      gain.gain.linearRampToValueAtTime(0, end);
      oscillator.connect(gain);
      gain.connect(panner);
      panner.connect(context.destination);
      run.startedAt = now;
      const complete = () => {
        if (generation.current !== token) return;
        cancel();
        setStatus({ phase: 'idle', message: 'Test complete.' });
      };
      oscillator.onended = complete;
      oscillator.start(now);
      oscillator.stop(end);
      // Also release if the audio clock suspends before the scheduled ended event.
      run.timer = setTimeout(complete, DURATION * 1_000);
      setStatus({ phase: 'playing', message: channel.pan === 0
        ? 'Playing stereo.' : `Playing ${channel.label.toLowerCase()} channel.` });
    } catch {
      if (generation.current !== token) return;
      cancel();
      setStatus({ phase: 'error', message: 'Audio could not play. Try Play test again.' });
    }
  };

  const running = status.phase === 'starting' || status.phase === 'playing';
  const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF4199]';
  return <section aria-label="Audio channel test" lang="en" dir="ltr"
    className="not-prose mx-auto w-full min-w-0 max-w-xl border-y border-white/15 bg-[#141414] px-4 py-5 text-white [letter-spacing:0] sm:px-6">
    <div className="flex min-h-6 flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <h2 className="!m-0 !text-base font-semibold !leading-6">Audio channel test</h2>
      <div className="flex gap-3 text-xs tabular-nums text-neutral-400"><span>440 Hz</span><span>1.2 s</span></div>
    </div>
    <div role="group" aria-label="Channel" className="mt-5 grid h-11 grid-cols-3 rounded-md bg-[#252525] p-1">
      {CHANNELS.map(option => <button key={option.label} type="button" aria-pressed={channel.pan === option.pan}
        className={`min-w-0 rounded px-2 text-sm font-medium transition-colors ${focus} ${channel.pan === option.pan
          ? 'bg-[#FF4199] text-[#0E0E0E]' : 'text-neutral-200 hover:bg-white/10'}`}
        onClick={() => {
          if (channel.pan === option.pan) return;
          cancel();
          setChannel(option);
          setStatus({ phase: 'idle', message: 'Ready.' });
        }}>{option.label}</button>)}
    </div>
    <div className="mt-4 flex h-11 items-center gap-3">
      <button type="button" aria-label="Play test" title="Play test" onClick={() => void play()}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[#FF4199] text-[#0E0E0E] hover:bg-[#ff73b3] ${focus}`}>
        <Play className="h-5 w-5" aria-hidden="true" />
      </button>
      <button type="button" aria-label="Stop test" title="Stop test" disabled={!running}
        onClick={() => { cancel(); setStatus({ phase: 'idle', message: 'Test stopped.' }); }}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-white/20 text-white enabled:hover:bg-white/10 disabled:cursor-default disabled:opacity-40 ${focus}`}>
        <Square className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
    <p role="status" aria-live="polite" aria-atomic="true"
      className={`mb-0 mt-3 min-h-10 break-words text-sm leading-5 ${status.phase === 'error' ? 'text-amber-300' : 'text-neutral-300'}`}>
      {status.message}
    </p>
    <p className="mb-0 mt-2 text-xs leading-5 text-neutral-400">Keep device volume low.</p>
  </section>;
}
