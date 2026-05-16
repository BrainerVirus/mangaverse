import { describe, it, expect } from 'vitest';
import { DURATION } from '../tokens/duration.js';
import { EASING } from '../tokens/easing.js';

describe('DURATION tokens', () => {
  it('should have instant at 0', () => {
    expect(DURATION.instant).toBe(0);
  });

  it('should have micro at 90', () => {
    expect(DURATION.micro).toBe(90);
  });

  it('should have quick at 140', () => {
    expect(DURATION.quick).toBe(140);
  });

  it('should have standard at 220', () => {
    expect(DURATION.standard).toBe(220);
  });

  it('should have expressive at 360', () => {
    expect(DURATION.expressive).toBe(360);
  });

  it('should have cinematic at 520', () => {
    expect(DURATION.cinematic).toBe(520);
  });

  it('should export DurationKey type', () => {
    const key: DURATION = 'instant';
    expect(DURATION[key]).toBe(0);
  });
});

describe('EASING tokens', () => {
  it('should have standardOut as power2.out', () => {
    expect(EASING.standardOut).toBe('power2.out');
  });

  it('should have standardInOut as power3.inOut', () => {
    expect(EASING.standardInOut).toBe('power3.inOut');
  });

  it('should have emphasizedOut as expo.out', () => {
    expect(EASING.emphasizedOut).toBe('expo.out');
  });

  it('should have softEntrance as power1.out', () => {
    expect(EASING.softEntrance).toBe('power1.out');
  });

  it('should have snapFeedback as back.out(1.2)', () => {
    expect(EASING.snapFeedback).toBe('back.out(1.2)');
  });

  it('should have scrollLinked as none', () => {
    expect(EASING.scrollLinked).toBe('none');
  });
});