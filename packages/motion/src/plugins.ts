import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export function registerGsapPlugins(): void {
  gsap.registerPlugin(ScrollTrigger);
}