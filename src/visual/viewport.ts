import type { DisplayRotationDeg } from '../config';

export interface LogicalViewport {
  readonly renderWidth: number;
  readonly renderHeight: number;
  readonly rotationDeg: DisplayRotationDeg;
}

export function fitLogicalViewport(
  viewportWidth: number,
  viewportHeight: number,
  rotationDeg: DisplayRotationDeg,
  aspectRatio: number,
): LogicalViewport {
  const isQuarterTurn = Math.abs(rotationDeg) === 90;
  const availableWidth = Math.max(1, isQuarterTurn ? viewportHeight : viewportWidth);
  const availableHeight = Math.max(1, isQuarterTurn ? viewportWidth : viewportHeight);

  let renderWidth = availableWidth;
  let renderHeight = renderWidth / aspectRatio;

  if (renderHeight > availableHeight) {
    renderHeight = availableHeight;
    renderWidth = renderHeight * aspectRatio;
  }

  return {
    renderWidth,
    renderHeight,
    rotationDeg,
  };
}
