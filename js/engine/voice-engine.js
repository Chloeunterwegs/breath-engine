// js/engine/voice-engine.js —— T4 单声部基底 + T5 支声织体与可打断状态机。
// 每声部一张图：正弦+三角（轻微 detune）→ 状态包络（setTargetAtTime 阻尼，无硬切）
// → 呼吸随动增益（逐帧微调）→ 低通 → 汇流。
// 可打断语义（D3/AC9）：一切调度都是时间戳标记而非定时器——新呼吸打断退场、
// 静默打断进入，包络经 setTargetAtTime 从当前值滑向新目标，无残响堆积、无锁死。

import { CONFIG } from '../config.js';

// 声部状态机（design.md）：asleep → listening → entering → singing → leaving
// listening = 已武装、等待自己的慢半拍进场拍（支声「等同伴换气」的状态化）
export const VOICE_STATES = ['asleep', 'listening', 'entering', 'singing', 'leaving'];

export class VoiceEngine {
  constructor(ctx) {
    this._ctx = ctx;
    const vcfg = CONFIG.audio.voice;
    this._scale = vcfg.scaleTableHz;          // 五声调式音阶表（Hz）：音高唯一来源（AC4）
    this._anchor = vcfg.anchorIndex;
    this._entryDelayRatio = vcfg.entryDelayRatio;
    this._exitStaggerMs = vcfg.exitStaggerSeconds * 1000;
    this._timbre = vcfg.timbre;

    // 汇流总增益 = headroom / 声部数：多声部叠加不爆音，数值仍从 config 折算（D2）
    this._master = ctx.createGain();
    this._master.gain.value = vcfg.timbre.headroom / vcfg.count;
    this._master.connect(ctx.destination);

    this._voices = [];
    for (let i = 0; i < vcfg.count; i++) {
      this._voices.push(this._buildVoice(i));
    }
    this._buildAmbient(vcfg.ambient);

    this._breathCount = 0;   // 支声缠绕的确定性步进序列号：同呼吸序列必得同织体
  }

  _buildVoice(index) {
    const ctx = this._ctx;
    const t = this._timbre;

    // 音色：正弦+三角双振荡器，三角静态上偏 detuneCents，极慢 LFO 同步漂移两轨
    const oscSine = ctx.createOscillator();
    oscSine.type = 'sine';
    const oscTri = ctx.createOscillator();
    oscTri.type = 'triangle';
    oscTri.detune.value = t.detuneCents;

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = t.detuneLfoHz;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = t.detuneCents;      // 人声式漂移幅度
    lfo.connect(lfoGain);
    lfoGain.connect(oscSine.detune);
    lfoGain.connect(oscTri.detune);

    const sineGain = ctx.createGain();
    sineGain.gain.value = t.sineGain;
    const triGain = ctx.createGain();
    triGain.gain.value = t.triangleGain;

    // 状态包络：所有进入/退场都走 setTargetAtTime 的阻尼滑移（D3 无硬切）
    const envGain = ctx.createGain();
    envGain.gain.value = 0;

    // 呼吸随动：歌唱中增益随呼吸包络轻微起伏（逐帧微调，步长极小无咔哒）
    const breathGain = ctx.createGain();
    breathGain.gain.value = 1;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = t.lowpassHz;
    lowpass.Q.value = 0.7;

    oscSine.connect(sineGain).connect(envGain);
    oscTri.connect(triGain).connect(envGain);
    envGain.connect(breathGain).connect(lowpass).connect(this._master);
    oscSine.start();
    oscTri.start();
    lfo.start();

    return {
      index,
      state: 'asleep',
      noteIndex: this._anchor,          // 声部音高在音阶表上的起点
      oscSine,
      oscTri,
      envGain,
      breathGain,
      enteredAt: 0,
      leftAt: 0,
      enterAt: null,                    // 慢半拍进场拍时间戳（listening 期间有效）
      leaveAt: null,                    // 逐层退场拍时间戳（静默后生效）
    };
  }

  // idle 环境声：A1+E2 极低音持续音 + 慢 LFO，「仅一丝」（design-language 交互状态）
  _buildAmbient(cfg) {
    const ctx = this._ctx;
    const bus = ctx.createGain();
    bus.gain.value = cfg.gain;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = cfg.lfoHz;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = cfg.gain * 0.5;    // 环境声自身的呼吸起伏
    lfo.connect(lfoGain).connect(bus.gain);
    for (const f of cfg.freqsHz) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      osc.connect(bus);
      osc.start();
    }
    lfo.start();
    bus.connect(this._ctx.destination);
  }

  // 音高落表：所有声部频率只允许来自音阶表（AC4 验收「音高全部落在调式表内」）
  _setNote(voice, index) {
    const clamped = Math.max(0, Math.min(this._scale.length - 1, index));
    voice.noteIndex = clamped;
    const hzv = this._scale[clamped];
    const t = this._ctx.currentTime;
    voice.oscSine.frequency.setTargetAtTime(hzv, t, 0.06);   // 小滑音：换音不硬切
    voice.oscTri.frequency.setTargetAtTime(hzv, t, 0.06);
  }

  // T5 支声调度：声部 1 即时回应；声部 i 进场拍 = 呼吸 + i × 呼吸周期 × entryDelayRatio
  // （慢半拍，D1 声音侧）。一切打断在这里发生：新呼吸清退场标记；进场拍只武装一次
  // （AC4）——已武装不推拍，连续呼吸下慢半拍才能追上：进场 = 武装起音 + i×period。
  handleBreathIn(ev) {
    this._breathCount += 1;
    const periodMs = ev.periodMs || CONFIG.audio.detector.periodFallbackSeconds * 1000;
    for (const v of this._voices) {
      // 支声缠绕：每口呼吸在音阶表上确定性步进（无随机，同呼吸序列必得同织体）
      const step = ((this._breathCount + v.index) % 3) - 1;   // -1 / 0 / +1 轮转
      this._setNote(v, v.noteIndex + step);

      if (v.index === 0) {
        // 回应你的声部：即时进；已在唱则不重入，包络不动
        v.leaveAt = null;
        v.enterAt = null;
        if (v.state !== 'singing' && v.state !== 'entering') {
          this._enter(v, ev.at);
        }
        continue;
      }
      if (v.state === 'entering' || v.state === 'singing') {
        v.leaveAt = null;          // 已在织体里，只清退场标记
        continue;
      }
      v.leaveAt = null;            // 新呼吸打断退场（AC9）：mid-fall 的声部重新武装
      // 进场拍只武装一次（AC4）：已武装不推拍——否则连续呼吸下 i×period 恒大于
      // 呼吸间隔，进场拍永远被下一口气推走，慢半拍永不到拍
      if (v.enterAt === null) {
        v.enterAt = ev.at + v.index * periodMs * this._entryDelayRatio;
      }
      v.state = 'listening';
    }
  }

  // 呼气不断声——支声的托举正发生在换气间隙（母题的声音侧行为）
  handleBreathOut() {}

  // T5 逐层退场：静默触发后声部 i 的退场拍 = 静默 + i × exitStaggerMs（AC4/MVP 线）。
  // 静默打断进入：listening 中的声部清进场标记、排退场拍——永远进不来，也就无需硬切。
  handleSilence(ev) {
    for (const v of this._voices) {
      if (v.state === 'entering' || v.state === 'singing' || v.state === 'listening') {
        v.enterAt = null;
        v.leaveAt = ev.at + v.index * this._exitStaggerMs;
      }
    }
  }

  _enter(voice, atMs) {
    const ctx = this._ctx;
    const tau = this._timbre.attackSeconds / 3;   // setTargetAtTime 时间常数：tau 后 ≈95% 到位
    voice.state = 'entering';
    voice.enteredAt = atMs;
    voice.envGain.gain.setTargetAtTime(1, ctx.currentTime, tau);  // 从当前值阻尼滑升，可被打断
  }

  _leave(voice, atMs) {
    const ctx = this._ctx;
    const tau = this._timbre.releaseSeconds / 3;
    voice.state = 'leaving';
    voice.leftAt = atMs;
    voice.envGain.gain.setTargetAtTime(0, ctx.currentTime, tau);  // 阻尼滑落，可被打断
  }

  // 每帧推进：慢半拍进场、逐层退场、状态标签迁移、歌唱中呼吸随动。
  // 全部按时间戳判断——任何状态随时可被新事件改写（AC9 无锁死）。
  update(now, envelope) {
    const t = this._timbre;
    for (const v of this._voices) {
      if (v.state === 'listening' && v.enterAt !== null && now >= v.enterAt) {
        v.enterAt = null;
        this._enter(v, now);               // 慢半拍进场拍到
      }
      if (
        v.leaveAt !== null &&
        now >= v.leaveAt &&
        (v.state === 'entering' || v.state === 'singing' || v.state === 'listening')
      ) {
        v.leaveAt = null;
        this._leave(v, now);               // 逐层退场拍到
      }
      if (v.state === 'entering' && now - v.enteredAt >= t.attackSeconds * 1000) {
        v.state = 'singing';
      }
      if (v.state === 'leaving' && now - v.leftAt >= t.releaseSeconds * 1000) {
        v.state = 'asleep';
      }
      // 呼吸随动深度：歌唱/进入中包络轻微抬升增益（breathFollowDepth 从 config 读）
      const active = v.state === 'entering' || v.state === 'singing';
      const target = active ? 1 + t.breathFollowDepth * (envelope || 0) : 1;
      v.breathGain.gain.value += (target - v.breathGain.gain.value) * 0.2;
    }
  }

  // 渲染层/透视开关读这里：每声部的状态、音高、序号（只读快照，AC5/AC9 的对账面）
  getVoiceStates() {
    return this._voices.map((v) => ({
      index: v.index,
      state: v.state,
      noteIndex: v.noteIndex,
    }));
  }
}
