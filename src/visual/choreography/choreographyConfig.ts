export const CHOREOGRAPHY_CONFIG = Object.freeze({
  spring: {
    maxStepSeconds: 1 / 120,
    solo: { stiffness: 28, damping: 10.5 },
    approach: { stiffness: 17, damping: 8.2 },
    alignment: { stiffness: 12.5, damping: 7.4 },
    gather: { stiffness: 15, damping: 7.8 },
    tension: { stiffness: 24, damping: 9.5 },
  },
  solo: {
    activePresence: 1,
    inactivePresence: 0.065,
    activeOpacity: 0.78,
    inactiveOpacity: 0.00002,
    rhythm: 1,
  },
  join: {
    approachStart: 0.2,
    approachEnd: 0.82,
    alignmentStart: 0.08,
    alignmentEnd: 0.76,
    gatherStart: 0.18,
    gatherEnd: 0.9,
    tensionStart: 0.04,
    tensionEnd: 0.38,
  },
  contact: {
    approach: 1,
    alignment: 0.94,
    gather: 1,
    tension: 1,
  },
  resultPlaceholder: {
    approach: 0.92,
    alignment: 0.86,
    gather: 0.76,
    tension: 0.48,
  },
});
