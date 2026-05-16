export const PACKAGE_NAME = '@app/motion' as const;

export { registerGsapPlugins } from './plugins.js';

export { useGsapContext } from './hooks/use-gsap-context.js';
export { useReducedMotion } from './hooks/use-reduced-motion.js';
export { useIsClient } from './hooks/use-is-client.js';

export { DURATION } from './tokens/duration.js';
export { EASING } from './tokens/easing.js';

export { fadeIn, fadeOut } from './helpers/fade.js';
export { slideUp, slideDown } from './helpers/slide.js';
export { scaleIn } from './helpers/scale.js';
export { staggerIn } from './helpers/stagger.js';
export { createTimeline } from './helpers/timeline.js';

export { chromeShow, chromeHide } from './reader-safe/chrome.js';
export { pageTurn } from './reader-safe/page-turn.js';
export { settingsDrawerTransition } from './reader-safe/settings-drawer.js';

export { routeEnter, routeExit } from './route-transitions/route-enter-exit.js';