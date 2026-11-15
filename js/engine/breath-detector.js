// js/engine/breath-detector.js —— T3：振幅包络平滑 + 起音检测 → onBreathIn/onBreathOut/静默计时。
// 两个工程决策：
// 1) 迟滞双阈（onset/release）：单阈值在临界幅度反复横跳，双阈把「吸气确认」与「气断确认」分开；
// 2) 平滑按时间常数 tau 而非每帧系数：每帧系数的检测延迟随帧率漂移（30fps 会吃掉 AC3 的
//    150ms 预算），tau 语义下延迟 ≈ tau，与帧率无关。

import { CONFIG } from '../config.js';

export class BreathDetector {
  constructor() {
    const cfg = CONFIG.audio.detector;
    this._tauMs = cfg.envelopeTauMs;         // 包络平滑时间常数：延迟 ≈ tau（AC3 预算内）
    this._onsetThreshold = cfg.onsetThreshold;
    this._releaseThreshold = cfg.releaseThreshold;
    this._silenceSeconds = cfg.silenceSeconds;
    this._periodFallback = cfg.periodFallbackSeconds;
    this._periodWindow = cfg.periodWindow;
    this._minPeriod = cfg.minPeriodSeconds;
    this._maxPeriod = cfg.maxPeriodSeconds;

    this.smoothed = 0;            // 平滑包络：声部/渲染统一读这里
    this._above = false;          // 迟滞状态位：当前是否「在吹气」
    this._rawPrev = 0;            // 上一帧原始包络：算真实起音穿越时刻
    this._rawCrossAt = 0;         // 原始包络本次越过起音线的时刻（延迟测量基准）
    this._lastUpdateAt = null;
    this._lastBreathAt = 0;       // 最近一次呼吸事件时刻：静默计时基准
    this._silenceFired = false;   // 静默事件只发一次，下次吸气复位
    this._breathIntervals = [];   // 最近 N 次吸气间隔 → 呼吸周期估计（慢半拍调度的节拍器）
    this.breathPeriod = this._periodFallback * 1000;

    // 事件时间戳全部 performance.now() 毫秒——渲染层按同源时钟在同一帧内消费（AC5）
    this.onBreathIn = null;
    this.onBreathOut = null;
    this.onSilence = null;
    this.lastLatencyMs = null;    // 最近一次起音检测延迟：AC3 <150ms 的直接证据
  }

  // 包络源注入口：真实麦克风（AudioInput.getEnvelope）与 Demo 合成（DemoMode.getEnvelope）
  // 走同一入口——AC6「同一事件通路」在方法签名上成立，下层无法区分来源。
  setSource(provider) {
    this._provider = provider;
  }

  update(now) {
    if (!this._provider) return;
    const raw = this._provider.getEnvelope() || 0;

    // 帧间 dt 归一的一阶平滑：后台标签页回来时不产生大跳
    const dt = this._lastUpdateAt === null ? 16.7 : Math.min(100, now - this._lastUpdateAt);
    this._lastUpdateAt = now;
    const alpha = 1 - Math.exp(-dt / this._tauMs);
    this.smoothed += (raw - this.smoothed) * alpha;

    // 记录原始包络的真实穿越时刻（平滑尚未跟上时，物理起音已经发生）
    if (raw >= this._onsetThreshold && this._rawPrev < this._onsetThreshold) {
      this._rawCrossAt = now;
    }
    this._rawPrev = raw;

    if (!this._above && this.smoothed >= this._onsetThreshold) {
      // 起音：一口气来了。延迟 = 平滑确认时刻 − 原始穿越时刻，console 打点即 AC3 证据
      this._above = true;
      this.lastLatencyMs = Math.max(0, now - this._rawCrossAt);
      console.debug(`[breath] in +${this.lastLatencyMs.toFixed(1)}ms env=${raw.toFixed(3)}`);
      this._recordPeriod(now);
      this._lastBreathAt = now;
      this._silenceFired = false;
      if (this.onBreathIn) {
        this.onBreathIn({ at: now, envelope: this.smoothed, latencyMs: this.lastLatencyMs, periodMs: this.breathPeriod });
      }
    } else if (this._above && this.smoothed <= this._releaseThreshold) {
      // 气断：低于回落阈，静默计时从此刻起算（D3「停止呼吸即退场」的信号源）
      this._above = false;
      this._lastBreathAt = now;
      if (this.onBreathOut) {
        this.onBreathOut({ at: now, envelope: this.smoothed });
      }
    }

    // 静默窗口：停止呼吸超过 silenceSeconds → 一次性 onSilence（T5 逐层退场的触发器）
    if (
      !this._above &&
      !this._silenceFired &&
      this._lastBreathAt > 0 &&
      now - this._lastBreathAt >= this._silenceSeconds * 1000
    ) {
      this._silenceFired = true;
      console.debug('[breath] silence window reached');
      if (this.onSilence) this.onSilence({ at: now });
    }
  }

  // 呼吸周期估计：最近 N 次吸气间隔均值，钳制在 [min,max]——防异常间隔污染慢半拍调度
  _recordPeriod(now) {
    if (this._lastBreathAt > 0) {
      const interval = (now - this._lastBreathAt) / 1000;
      if (interval >= this._minPeriod && interval <= this._maxPeriod) {
        this._breathIntervals.push(interval);
        if (this._breathIntervals.length > this._periodWindow) this._breathIntervals.shift();
        const mean = this._breathIntervals.reduce((a, b) => a + b, 0) / this._breathIntervals.length;
        this.breathPeriod = mean * 1000;
      }
    }
  }

  // 慢半拍调度读这里：声部 i 进入延迟 = i × breathPeriod × entryDelayRatio（D1 声音侧）
  getBreathPeriod() {
    return this.breathPeriod;
  }

  // 当前是否「在吹气」：UI 与渲染的状态信号
  isAbove() {
    return this._above;
  }
}
