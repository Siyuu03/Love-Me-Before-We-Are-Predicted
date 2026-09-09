import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { AUDIO_CONFIG, audioCueForSnapshot } from '../src/audio/AudioConfig';
import type { StateSnapshot } from '../src/core/types';

function snapshot(state: StateSnapshot['state'], result: StateSnapshot['currentResult'] = null): StateSnapshot {
  return {
    state,
    aPressed: state === 'SOLO_A',
    bPressed: state === 'SOLO_B',
    sharedTouchMs: 0,
    contactElapsedMs: 0,
    resultElapsedMs: 0,
    contactSnapshot: null,
    currentResult: result,
    resultSource: result ? 'preview' : null,
    resetProgress: 0,
  };
}

test('all nine audio cues resolve to deployed non-empty MP3 assets', () => {
  assert.equal(Object.keys(AUDIO_CONFIG.tracks).length, 9);
  for (const track of Object.values(AUDIO_CONFIG.tracks)) {
    const path = resolve('public', track.path.replace(/^\.\//, ''));
    assert.equal(existsSync(path), true, path);
    assert.ok(statSync(path).size > 100_000, path);
  }
});

test('installation state and result id select one exclusive audio cue', () => {
  assert.equal(audioCueForSnapshot(snapshot('IDLE')), 'idle');
  assert.equal(audioCueForSnapshot(snapshot('SOLO_A')), 'left-touch');
  assert.equal(audioCueForSnapshot(snapshot('SOLO_B')), 'right-touch');
  assert.equal(audioCueForSnapshot(snapshot('RESULT', 'desire')), 'desire');
  assert.equal(audioCueForSnapshot(snapshot('RESET')), 'idle');
  assert.equal(AUDIO_CONFIG.tracks.idle.loop, true);
  assert.equal(AUDIO_CONFIG.tracks.desire.loop, false);
});
