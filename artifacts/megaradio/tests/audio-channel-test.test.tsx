import React, { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AudioChannelTest from '../src/components/audio-channel-test';
import { GlobalPlayerContext, shellDefaults } from '../src/hooks/useGlobalPlayer.shell';

class AudioParamMock {
  constructor(public value = 0) {}
  setValueAtTime = vi.fn((_value: number, _time: number) => this);
  linearRampToValueAtTime = vi.fn((_value: number, _time: number) => this);
  cancelScheduledValues = vi.fn((_time: number) => this);
}

class AudioNodeMock {
  connect = vi.fn();
  disconnect = vi.fn();
}

class OscillatorMock extends AudioNodeMock {
  type = 'sine';
  frequency = new AudioParamMock(440);
  start = vi.fn((_time?: number) => {});
  stop = vi.fn((_time?: number) => {});
  onended: (() => void) | null = null;
}

let resumeAudio: (context: AudioContextMock) => Promise<void>;
let closeAudio: () => Promise<void>;
class AudioContextMock {
  static instances: AudioContextMock[] = [];
  state = 'suspended';
  createdAt = Date.now();
  get currentTime() { return 10 + (Date.now() - this.createdAt) / 1_000; }
  destination = new AudioNodeMock();
  oscillator = new OscillatorMock();
  gain = Object.assign(new AudioNodeMock(), { gain: new AudioParamMock(1) });
  panner = Object.assign(new AudioNodeMock(), { pan: new AudioParamMock() });
  createOscillator = vi.fn(() => this.oscillator);
  createGain = vi.fn(() => this.gain);
  createStereoPanner = vi.fn(() => this.panner);
  resume = vi.fn(() => resumeAudio(this));
  close = vi.fn(() => { this.state = 'closed'; return closeAudio(); });
  constructor() { AudioContextMock.instances.push(this); }
}

const player = {
  ...shellDefaults,
  pauseStation: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  resumeStation: vi.fn(),
  playStation: vi.fn(),
};
const play = () => fireEvent.click(screen.getByRole('button', { name: 'Play test' }));
const stop = () => fireEvent.click(screen.getByRole('button', { name: 'Stop test' }));
const flush = async () => { await act(async () => {}); };
const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const latest = () => AudioContextMock.instances[AudioContextMock.instances.length - 1];
const renderTool = () => render(<StrictMode><GlobalPlayerContext.Provider value={player}>
  <AudioChannelTest />
</GlobalPlayerContext.Provider></StrictMode>);
const expectNoResume = () => {
  expect(player.resume).not.toHaveBeenCalled();
  expect(player.resumeStation).not.toHaveBeenCalled();
  expect(player.playStation).not.toHaveBeenCalled();
  expect(player.pause).not.toHaveBeenCalled();
};
function pendingResume() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  resumeAudio = context => promise.then(() => { context.state = 'running'; });
  return { resolve, reject };
}
const defaultResume = async (context: AudioContextMock) => { context.state = 'running'; };

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  AudioContextMock.instances = [];
  resumeAudio = defaultResume;
  closeAudio = async () => {};
  vi.stubGlobal('AudioContext', AudioContextMock);
  vi.stubGlobal('Audio', vi.fn());
  vi.stubGlobal('fetch', vi.fn());
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
});

afterEach(async () => {
  cleanup();
  await advance(25);
  expectNoResume();
  expect(fetch).not.toHaveBeenCalled();
  expect(Audio).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('has no autoplay, context, player or external audio activity on mount or channel selection', () => {
  renderTool();
  expect(screen.getByRole('group', { name: 'Channel' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Stereo' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Stop test' })).toBeDisabled();
  for (const label of ['Left', 'Right', 'Stereo']) {
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);
  }
  stop();
  expect(AudioContextMock.instances).toHaveLength(0);
  expect(player.pauseStation).not.toHaveBeenCalled();
  expect(screen.getByRole('status')).toHaveTextContent('Ready.');
  expect(screen.getByRole('button', { name: 'Play test' })).toHaveAttribute('title', 'Play test');
  expect(screen.getByRole('button', { name: 'Stop test' })).toHaveAttribute('title', 'Stop test');
});

it('keeps English copy and an explicit English language on a retired Hungarian URL', () => {
  const original = window.location.href;
  window.history.replaceState(null, '', '/hu/audio-channel-test');
  try {
    renderTool();
    expect(screen.getByRole('region', { name: 'Audio channel test' })).toHaveAttribute('lang', 'en');
    expect(screen.getByRole('button', { name: 'Left' })).toBeInTheDocument();
    expect(screen.getByText('Keep device volume low.')).toBeInTheDocument();
  } finally { window.history.replaceState(null, '', original); }
});

it.each([['Left', -1], ['Stereo', 0], ['Right', 1]] as const)(
  'routes %s through a native stereo panner with a quiet 440 Hz sine and a bounded envelope', async (label, pan) => {
    renderTool();
    fireEvent.click(screen.getByRole('button', { name: label }));
    play();
    expect(latest().resume).toHaveBeenCalledTimes(1);
    await flush();
    const context = latest();
    const start = context.oscillator.start.mock.calls[0][0]!;
    const end = context.oscillator.stop.mock.calls[0][0]!;
    expect(context.oscillator.type).toBe('sine');
    expect(context.oscillator.frequency.setValueAtTime).toHaveBeenCalledWith(440, start);
    expect(context.panner.pan.setValueAtTime).toHaveBeenCalledWith(pan, start);
    expect(context.oscillator.connect).toHaveBeenCalledWith(context.gain);
    expect(context.gain.connect).toHaveBeenCalledWith(context.panner);
    expect(context.panner.connect).toHaveBeenCalledWith(context.destination);
    expect(context.gain.gain.value).toBe(0);
    expect(context.gain.gain.setValueAtTime.mock.calls).toEqual([[0, start], [0.03, end - 0.02]]);
    expect(context.gain.gain.linearRampToValueAtTime.mock.calls).toEqual([[0.03, start + 0.02], [0, end]]);
    for (const [value] of [...context.gain.gain.setValueAtTime.mock.calls, ...context.gain.gain.linearRampToValueAtTime.mock.calls]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(0.03);
    }
    expect(end - start).toBeLessThanOrEqual(1.2);
    expect(end - start).toBeCloseTo(1.2);
    expect(screen.getByRole('status')).toHaveTextContent('Playing');
    expect(player.pauseStation).toHaveBeenCalledTimes(1);
  });

it('automatically stops and releases all nodes within 1.2 seconds, without resuming the station', async () => {
  renderTool(); play(); await flush();
  const context = latest();
  await advance(1_200);
  expect(screen.getByRole('status')).toHaveTextContent('Test complete.');
  expect(screen.getByRole('button', { name: 'Stop test' })).toBeDisabled();
  expect(context.close).toHaveBeenCalledTimes(1);
  for (const node of [context.oscillator, context.gain, context.panner]) expect(node.disconnect).toHaveBeenCalledTimes(1);
  expect(context.oscillator.onended).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
  await advance(5_000);
  expect(AudioContextMock.instances).toHaveLength(1);
  expect(player.pauseStation).toHaveBeenCalledTimes(1);
});

it('also completes on the native ended event and removes its fallback timer', async () => {
  renderTool(); play(); await flush();
  const context = latest();
  act(() => {
    vi.setSystemTime(Date.now() + 1_200);
    context.oscillator.onended?.();
  });
  expect(screen.getByRole('status')).toHaveTextContent('Test complete.');
  expect(context.close).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('fades manual Stop to zero, makes repeated Stop harmless and closes once', async () => {
  renderTool(); play(); await flush();
  const context = latest();
  await advance(100);
  const now = context.currentTime;
  stop(); stop();
  expect(context.gain.gain.cancelScheduledValues).toHaveBeenCalledWith(now);
  expect(context.gain.gain.setValueAtTime).toHaveBeenLastCalledWith(0.03, now);
  expect(context.gain.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, now + 0.02);
  expect(context.oscillator.stop).toHaveBeenLastCalledWith(now + 0.02);
  expect(screen.getByRole('status')).toHaveTextContent('Test stopped.');
  await advance(25);
  expect(context.close).toHaveBeenCalledTimes(1);
  expect(player.pauseStation).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('preserves a continuous fade when interrupted during the attack', async () => {
  renderTool(); play(); await flush();
  const context = latest();
  await advance(10);
  stop();
  expect(context.gain.gain.setValueAtTime.mock.lastCall?.[0]).toBeCloseTo(0.015);
  await advance(25);
  expect(context.close).toHaveBeenCalledTimes(1);
});

it('waits for the previous tone to stop across rapid Play clicks and only starts the latest run', async () => {
  renderTool(); play(); await flush();
  const first = latest();
  await advance(100);
  play(); const second = latest();
  play(); const third = latest();
  await flush();
  expect(second.close).toHaveBeenCalledTimes(1);
  expect(second.oscillator.start).not.toHaveBeenCalled();
  expect(third.oscillator.start).not.toHaveBeenCalled();
  await advance(25);
  expect(first.close).toHaveBeenCalledTimes(1);
  expect(first.oscillator.disconnect).toHaveBeenCalledTimes(1);
  expect(third.oscillator.start).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toHaveTextContent('Playing stereo.');
  expect(player.pauseStation).toHaveBeenCalledTimes(3);
});

it('stops on a mode change without playing the new channel until Play is clicked', async () => {
  renderTool(); play(); await flush();
  const first = latest();
  await advance(100);
  fireEvent.click(screen.getByRole('button', { name: 'Right' }));
  await advance(25);
  expect(first.close).toHaveBeenCalledTimes(1);
  expect(AudioContextMock.instances).toHaveLength(1);
  expect(player.pauseStation).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toHaveTextContent('Ready.');
  play(); await flush();
  expect(latest().panner.pan.setValueAtTime).toHaveBeenCalledWith(1, latest().currentTime);
});

it.each(['stop', 'hidden', 'unmount'] as const)('cancels a pending resume on %s and discards its late completion', async action => {
  const pending = pendingResume();
  const view = renderTool(); play();
  const context = latest();
  expect(screen.getByRole('status')).toHaveTextContent('Starting test...');
  if (action === 'stop') stop();
  if (action === 'unmount') view.unmount();
  if (action === 'hidden') {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
  }
  expect(context.close).toHaveBeenCalledTimes(1);
  await act(async () => { pending.resolve(); });
  expect(context.createOscillator).not.toHaveBeenCalled();
  expect(context.oscillator.start).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  expect(player.pauseStation).toHaveBeenCalledTimes(1);
  if (action !== 'unmount') expect(screen.getByRole('status')).toHaveTextContent('Test stopped.');
});

it('does not let a stale pending resume start or replace the status of a newer test', async () => {
  const pending = pendingResume();
  renderTool(); play();
  const old = latest();
  resumeAudio = defaultResume;
  fireEvent.click(screen.getByRole('button', { name: 'Left' }));
  play(); await flush();
  const current = latest();
  await act(async () => { pending.resolve(); });
  expect(old.close).toHaveBeenCalledTimes(1);
  expect(old.oscillator.start).not.toHaveBeenCalled();
  expect(current.oscillator.start).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toHaveTextContent('Playing left channel.');
  expect(player.pauseStation).toHaveBeenCalledTimes(2);
});

it('ignores a stale resume rejection after a rapid Play retry', async () => {
  const pending = pendingResume();
  renderTool(); play();
  const first = latest();
  resumeAudio = defaultResume;
  play(); await flush();
  await act(async () => { pending.reject(new Error('old request')); });
  expect(first.oscillator.start).not.toHaveBeenCalled();
  expect(screen.getByRole('status')).toHaveTextContent('Playing stereo.');
});

it.each(['hidden', 'unmount'] as const)('cleans up a playing test on %s and never automatically restarts', async action => {
  const removeListener = vi.spyOn(document, 'removeEventListener');
  const view = renderTool(); play(); await flush();
  const context = latest();
  await advance(100);
  if (action === 'unmount') view.unmount();
  else {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
  }
  await advance(25);
  expect(context.close).toHaveBeenCalledTimes(1);
  expect(context.oscillator.disconnect).toHaveBeenCalledTimes(1);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  fireEvent(document, new Event('visibilitychange'));
  await advance(5_000);
  expect(AudioContextMock.instances).toHaveLength(1);
  expect(player.pauseStation).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
  if (action === 'unmount') expect(removeListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
});

it('bounds a stalled resume, permits manual retry and cancels a late successful resume', async () => {
  const pending = pendingResume();
  renderTool(); play();
  const old = latest();
  await advance(3_000);
  expect(screen.getByRole('status')).toHaveTextContent('Audio did not start. Try Play test again.');
  expect(screen.getByRole('button', { name: 'Play test' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Stop test' })).toBeDisabled();
  expect(old.close).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
  resumeAudio = defaultResume;
  play(); await flush();
  await act(async () => { pending.resolve(); });
  expect(old.oscillator.start).not.toHaveBeenCalled();
  expect(screen.getByRole('status')).toHaveTextContent('Playing stereo.');
  expect(player.pauseStation).toHaveBeenCalledTimes(2);
});

it('reports unsupported Web Audio accessibly and can retry after support becomes available', async () => {
  vi.stubGlobal('AudioContext', undefined);
  renderTool();
  expect(screen.getByRole('status')).toHaveTextContent('Ready.');
  play(); await flush();
  expect(screen.getByRole('status')).toHaveTextContent('Audio testing is unavailable in this browser.');
  vi.stubGlobal('AudioContext', AudioContextMock);
  play(); await flush();
  expect(screen.getByRole('status')).toHaveTextContent('Playing stereo.');
});

it('rejects missing stereo panning rather than silently playing the wrong channel', async () => {
  class NoPannerContext extends AudioContextMock {
    constructor() { super(); Object.defineProperty(this, 'createStereoPanner', { value: undefined }); }
  }
  vi.stubGlobal('AudioContext', NoPannerContext);
  renderTool(); play(); await flush();
  expect(screen.getByRole('status')).toHaveTextContent('Audio testing is unavailable in this browser.');
  expect(latest().close).toHaveBeenCalledTimes(1);
  expect(latest().resume).not.toHaveBeenCalled();
  expect(latest().oscillator.start).not.toHaveBeenCalled();
  vi.stubGlobal('AudioContext', AudioContextMock);
  play(); await flush();
  expect(screen.getByRole('status')).toHaveTextContent('Playing stereo.');
});

it.each(['constructor', 'resume', 'not-running', 'graph', 'start'] as const)(
  'catches a %s failure, cleans up and allows an explicit retry', async failure => {
    class FailingContext extends AudioContextMock {
      constructor() {
        super();
        if (failure === 'constructor') throw new Error('private native error');
        if (failure === 'graph') this.createGain.mockImplementation(() => { throw new Error('graph failed'); });
        if (failure === 'start') this.oscillator.start.mockImplementation(() => { throw new Error('start failed'); });
      }
    }
    vi.stubGlobal('AudioContext', FailingContext);
    if (failure === 'resume') resumeAudio = async () => { throw new Error('resume rejected'); };
    if (failure === 'not-running') resumeAudio = async () => {};
    renderTool(); play(); await flush();
    await advance(25);
    expect(screen.getByRole('status')).toHaveTextContent('Audio could not play. Try Play test again.');
    expect(document.body).not.toHaveTextContent('private native error');
    if (failure !== 'constructor') expect(latest().close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    vi.stubGlobal('AudioContext', AudioContextMock);
    resumeAudio = defaultResume;
    play(); await flush();
    expect(screen.getByRole('status')).toHaveTextContent('Playing stereo.');
    expect(player.pauseStation).toHaveBeenCalledTimes(2);
  });

it.each(['reject', 'throw', 'pending'] as const)('handles a %s close without unhandled rejection or a blocked next Play', async failure => {
  closeAudio = () => {
    if (failure === 'throw') throw new Error('close failed');
    if (failure === 'reject') return Promise.reject(new Error('close rejected'));
    return new Promise(() => {});
  };
  renderTool(); play(); await flush();
  const first = latest();
  await advance(100);
  play(); await advance(25);
  expect(first.close).toHaveBeenCalledTimes(1);
  expect(first.oscillator.disconnect).toHaveBeenCalledTimes(1);
  expect(latest().oscillator.start).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toHaveTextContent('Playing stereo.');
});
