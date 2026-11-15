// js/engine/demo-mode.js —— T8：合成呼吸包络注入 BreathDetector 输出（AC6）。
// 与真实麦克风走同一事件通路：以包络函数互为 BreathDetector.setSource 的可换源，
// 检测层无法也不需要区分来源。
// 包络按 config.demo.script 确定性生成（seeded，无随机）：3 分钟彩排
// 开场引导 → 单次呼吸 → 连续合唱 → 停止退场，参数全部从 config 读（D2）。

import { CONFIG } from '../config.js';

export class DemoMode {
  constructor() {
    this._script = CONFIG.audio.demo.script;
    this._baseAmplitude = CONFIG.audio.demo.amplitude;
    this._inhaleRatio = CONFIG.audio.demo.inhaleRatio;
    this._exhaleFloor = CONFIG.audio.demo.exhaleFloor;
    this._startAt = null;
    this._running = false;
    this.phaseId = null;      // 当前脚本段（诊断句柄读）
  }

  start(now) {
    this._startAt = now;
    this._running = true;
  }

  stop() {
    this._running = false;
    this._startAt = null;
    this.phaseId = null;
  }

  isRunning() {
    return this._running;
  }

  // BreathDetector 每帧拉取的合成包络。脚本段与时钟均为确定性推算。
  getEnvelope(now) {
    if (!this._running || this._startAt === null) return 0;

    // 定位当前脚本段：按各段时长/呼吸数折算的累计时间轴
    let t = (now - this._startAt) / 1000;
    let phase = null;
    let phaseStart = 0;
    for (const p of this._script) {
      const dur = p.durationSeconds !== undefined
        ? p.durationSeconds
        : (p.breaths || 0) * (p.periodSeconds || 0);
      if (t < phaseStart + dur) {
        phase = p;
        break;
      }
      phaseStart += dur;
    }
    if (!phase) {
      // 脚本走完：静场收尾（演示者此时已录完停止退场段）
      this.phaseId = 'end';
      return 0;
    }
    this.phaseId = phase.id;
    const amplitude = phase.amplitude !== undefined ? phase.amplitude : this._baseAmplitude;
    const local = t - phaseStart;

    if (amplitude <= 0 || phase.breaths === undefined) {
      // 静场段：intro/rest/silence——直接归零（退场由 VoiceEngine 的静默逻辑接管）
      return 0;
    }

    // 呼吸段：第 N 口气，周期内余弦起落——吸气段升到峰值，呼气段降到残留值
    const period = phase.periodSeconds;
    const cycle = local % period;
    const cycleIndex = Math.floor(local / period);
    if (cycleIndex >= (phase.breaths || 0)) return 0;   // 本段口气数用尽，进入段尾静默

    const inhale = period * this._inhaleRatio;
    const floor = this._exhaleFloor;
    if (cycle < inhale) {
      // 吸气：cos 半周从 floor 升到 amplitude
      const p1 = cycle / inhale;
      return floor + (amplitude - floor) * 0.5 * (1 - Math.cos(Math.PI * p1));
    }
    // 呼气：cos 半周从 amplitude 降回 floor
    const p2 = (cycle - inhale) / (period - inhale);
    return floor + (amplitude - floor) * 0.5 * (1 + Math.cos(Math.PI * Math.min(1, p2)));
  }
}
