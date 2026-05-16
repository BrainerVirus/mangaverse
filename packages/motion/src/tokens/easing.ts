export const EASING = {
  standardOut: 'power2.out',
  standardInOut: 'power3.inOut',
  emphasizedOut: 'expo.out',
  softEntrance: 'power1.out',
  snapFeedback: 'back.out(1.2)',
  scrollLinked: 'none',
} as const;

export type EasingKey = keyof typeof EASING;