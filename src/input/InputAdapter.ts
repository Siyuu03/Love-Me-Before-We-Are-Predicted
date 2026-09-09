import type { ResultId } from '../core/types';

export type InputEvent =
  | { readonly type: 'A_TOUCH' }
  | { readonly type: 'A_RELEASE' }
  | { readonly type: 'B_TOUCH' }
  | { readonly type: 'B_RELEASE' }
  | { readonly type: 'FORCE_IDLE' }
  | { readonly type: 'FORCE_SOLO'; readonly participant: 'A' | 'B' }
  | { readonly type: 'FORCE_RESULT'; readonly result: ResultId }
  | { readonly type: 'RESET' }
  | { readonly type: 'TOGGLE_DEBUG' }
  | { readonly type: 'TOGGLE_DEEP_DEBUG' }
  | { readonly type: 'TOGGLE_HAND_CHECK' }
  | { readonly type: 'TOGGLE_CAMERA_SETUP' };

export type InputListener = (event: InputEvent) => void;

export interface InputAdapter {
  start(): void;
  subscribe(listener: InputListener): () => void;
  dispose(): void;
}
