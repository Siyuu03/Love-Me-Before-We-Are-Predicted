export const HAND_SEMANTIC_ZONES = [
  'wrist', 'palm', 'thumb', 'index', 'middle', 'ring', 'pinky', 'fingertips', 'palmEdge', 'knuckles',
] as const;

export type HandSemanticZone = (typeof HAND_SEMANTIC_ZONES)[number];

export const HAND_ZONE_INDEX: Readonly<Record<HandSemanticZone, number>> = Object.freeze({
  wrist: 0, palm: 1, thumb: 2, index: 3, middle: 4, ring: 5, pinky: 6,
  fingertips: 7, palmEdge: 8,
  knuckles: 9,
});
