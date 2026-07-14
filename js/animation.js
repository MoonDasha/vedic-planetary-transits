import { BASE_DAY_DURATION } from './constants.js';
import { clamp } from './utils.js';

export class TransitPlayback {
  constructor({ onFrame, onStep, onStateChange, reducedMotion = false }) {
    this.onFrame = onFrame;
    this.onStep = onStep;
    this.onStateChange = onStateChange;
    this.reducedMotion = reducedMotion;
    this.records = [];
    this.index = 0;
    this.speed = 1;
    this.playing = false;
    this.frameId = null;
    this.frameStartedAt = null;
    this.tick = this.tick.bind(this);
  }

  setRecords(records) {
    this.pause();
    this.records = records ?? [];
    this.index = 0;
    this.emitStep();
    this.renderStill();
  }

  setSpeed(speed) {
    this.speed = Number(speed) || 1;
    if (this.playing) this.frameStartedAt = performance.now();
  }

  setReducedMotion(reducedMotion) {
    this.reducedMotion = reducedMotion;
    this.renderStill();
  }

  play() {
    if (this.playing || this.records.length < 2) return;
    if (this.index >= this.records.length - 1) this.setIndex(0);
    this.playing = true;
    this.frameStartedAt = null;
    this.onStateChange?.(true);
    this.frameId = requestAnimationFrame(this.tick);
  }

  pause() {
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.frameStartedAt = null;
    if (!this.playing) return;
    this.playing = false;
    this.onStateChange?.(false);
    this.renderStill();
  }

  toggle() {
    if (this.playing) this.pause(); else this.play();
  }

  setIndex(index) {
    this.pause();
    this.index = clamp(Math.round(index), 0, Math.max(0, this.records.length - 1));
    this.emitStep();
    this.renderStill();
  }

  step(delta) {
    this.setIndex(this.index + delta);
  }

  renderStill() {
    const record = this.records[this.index];
    if (record) this.onFrame?.(record, record, 0, this.index);
  }

  emitStep() {
    this.onStep?.(this.index, this.records[this.index]);
  }

  tick(timestamp) {
    if (!this.playing) return;
    if (this.index >= this.records.length - 1) {
      this.pause();
      return;
    }

    if (this.frameStartedAt === null) this.frameStartedAt = timestamp;
    const duration = BASE_DAY_DURATION / this.speed;
    const progress = clamp((timestamp - this.frameStartedAt) / duration, 0, 1);
    const visualProgress = this.reducedMotion ? 0 : progress;
    this.onFrame?.(
      this.records[this.index],
      this.records[this.index + 1],
      visualProgress,
      this.index,
    );

    if (progress >= 1) {
      this.index += 1;
      this.frameStartedAt = timestamp;
      this.emitStep();
      this.renderStill();
      if (this.index >= this.records.length - 1) {
        this.pause();
        return;
      }
    }
    this.frameId = requestAnimationFrame(this.tick);
  }
}

