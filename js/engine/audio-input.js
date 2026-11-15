// js/engine/audio-input.js —— T2：getUserMedia 授权 + AnalyserNode 振幅包络 + 自检音量条。
// 层次说明：engine 不碰 DOM 是常态；唯一例外是本文件的自检音量条（T2 产出明确要求可视化），
// 它只写 transform 不触发布局，随任务边界收在本文件内，T7 引导层只负责把元素递进来。

import { CONFIG } from '../config.js';

export class AudioInput {
  constructor() {
    this._ctx = null;        // 共享 AudioContext：由引导层创建，VoiceEngine 同用一张图
    this._analyser = null;
    this._buffer = null;
    this._envelope = 0;      // 最近一次采样包络（0..1）
    this._meterEl = null;
    this._rafId = 0;
    this._stream = null;
    this.running = false;    // 麦克风已授权且在采样
    this.denied = false;     // 权限被拒：AC2 分支的信号源
  }

  // 接收共享 AudioContext 与可选自检条元素。attach 后自检条循环即启动（无麦克风时恒为 0）。
  attach(ctx, meterEl = null) {
    this._ctx = ctx;
    this._meterEl = meterEl;
    this._meterLoop();
  }

  // 发起麦克风授权。必须在用户手势回调内调用（自动播放策略）。
  // 返回是否授权成功；被拒走 onDenied 回调——绝不 alert、绝不阻塞页面（AC2）。
  async requestMic({ onGranted, onDenied } = {}) {
    const cfg = CONFIG.audio.mic;
    try {
      this._stream = await navigator.mediaDevices.getUserMedia(cfg.constraints);
    } catch (err) {
      this.denied = true;
      this.running = false;
      if (onDenied) onDenied(err);
      return false;
    }
    const source = this._ctx.createMediaStreamSource(this._stream);
    this._analyser = this._ctx.createAnalyser();
    this._analyser.fftSize = cfg.fftSize;                       // D2：采样参数只从 config 读
    this._analyser.smoothingTimeConstant = cfg.smoothingTimeConstant;
    source.connect(this._analyser);
    this._buffer = new Uint8Array(this._analyser.fftSize);
    this.running = true;
    if (onGranted) onGranted();
    return true;
  }

  // 每次调用采一帧时域数据算 RMS 包络。inputGain 把原始电平抬到检测阈值的工作区间；
  // 真实麦克风与 Demo 合成包络共用同一条消费路径（BreathDetector 只认 getEnvelope 的产出）。
  getEnvelope() {
    if (!this.running || !this._analyser) return 0;
    this._analyser.getByteTimeDomainData(this._buffer);
    let sum = 0;
    for (let i = 0; i < this._buffer.length; i++) {
      const v = (this._buffer[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this._buffer.length);
    this._envelope = Math.min(1, rms * CONFIG.audio.mic.inputGain);
    return this._envelope;
  }

  // 自检音量条：与包络同一数据源，逐帧只改 transform（不触发布局重排）
  _meterLoop() {
    if (this._meterEl) {
      const env = this.getEnvelope();
      this._meterEl.style.transform = `scaleX(${env.toFixed(3)})`;
    }
    this._rafId = requestAnimationFrame(() => this._meterLoop());
  }

  // 释放麦克风与自检循环。AudioContext 归引导层管，这里不 close。
  stop() {
    this.running = false;
    cancelAnimationFrame(this._rafId);
    if (this._stream) {
      this._stream.getTracks().forEach((t) => t.stop());
      this._stream = null;
    }
    this._analyser = null;
    if (this._meterEl) this._meterEl.style.transform = 'scaleX(0)';
  }
}
