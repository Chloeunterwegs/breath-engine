// js/visual/brocade-renderer.js —— T6：侗锦纹样铺底 + 声部光斑 + 「断气→托住」母题编排。
// 母题（唯一 Showstopper，D1）：你的呼吸是一缕暖色光；换气断开超过 gapBreakSeconds 时，
// 邻声部光斑按慢半拍依次浮出托住它，拧成支声织体；呼吸回来，它们阻尼回位。
// 动效（D3/AC9）：位移与透明度走欠阻尼弹簧——有回弹、随时可打断，不做死板补间。
// 纹样（seeded render）：程序化菱形骨架/十字纹/井字纹，同种子同构图，无意义随机为零。

import { CONFIG } from '../config.js';

// 确定性伪随机：种子来自 config，构图可复现（seeded render 纪律）
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const TAU = Math.PI * 2;

export class BrocadeRenderer {
  constructor(canvas) {
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
    this._palette = CONFIG.visual.palette;
    this._pattern = CONFIG.visual.pattern;
    this._spotsCfg = CONFIG.visual.spots;
    this._gap = CONFIG.visual.breathWindow;
    this._ambient = CONFIG.visual.ambientLight;
    this._perspectiveCfg = CONFIG.visual.perspective;

    // 欠阻尼弹簧参数（config 派生）：zeta<1 有回弹；omega 决定回弹快慢
    this._omega = TAU * this._spotsCfg.springOmegaHz;
    this._zeta = this._spotsCfg.springZeta;

    this._envelopeDamped = 0;
    this._mainBright = 0;
    this._mainVBright = 0;
    this._events = [];            // 音频事件队列：主循环派发后本帧即消费（AC5 同帧对齐）
    this._accent = null;          // 第一次呼吸的纹样局部点亮
    this._holdArmed = false;      // 至少呼吸过一次，托住编排才解锁（idle 纹样沉睡）
    this._holdActive = false;
    this._holdStartAt = 0;
    this._holdLowSince = null;    // 包络低于断线阈值的起始时刻
    this._lastPeriodMs = CONFIG.audio.detector.periodFallbackSeconds * 1000;
    this._perspective = this._perspectiveCfg.defaultOn;

    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    this._w = window.innerWidth;
    this._h = window.innerHeight;
    this._canvas.width = Math.round(this._w * dpr);
    this._canvas.height = Math.round(this._h * dpr);
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._buildPattern();
    this._buildSpots();
  }

  // 菱形骨架铺底：错位网格 + 种子决定哪些节点升级为十字纹/井字纹
  _buildPattern() {
    const rng = mulberry32(this._pattern.seed);
    const scale = Math.max(0.8, this._w / 390);   // 密度基准 390px 宽视口
    const s = this._pattern.density * scale;
    const nodes = [];
    for (let y = 0, py = s * 0.4; py < this._h + s; y++, py += s * 0.87) {
      for (let x = 0, px = ((y % 2) * s) / 2; px < this._w + s; x++, px += s) {
        const r = rng();
        nodes.push({
          x: px,
          y: py,
          kind: r < 0.14 ? 'cross' : r < 0.26 ? 'hash' : 'diamond',
          phase: rng() * TAU,            // 明灭相位：整片纹样呼吸时带细微层次
          size: 0.82 + rng() * 0.36,
        });
      }
    }
    this._nodes = nodes;
    this._cell = s;
  }

  // 声部光斑布局：主光斑居中偏下（你的呼吸），声部光斑在上弧排开（它们在上方等你）
  _buildSpots() {
    const n = CONFIG.audio.voice.count;
    const main = { x: this._w * 0.5, y: this._h * 0.62 };
    const rng = mulberry32(this._pattern.seed ^ 0x9e37);
    const spots = [];
    for (let i = 0; i < n; i++) {
      const angle = -Math.PI / 2 + (i - (n - 1) / 2) * 0.52;
      const radius = Math.min(this._w, this._h) * 0.3;
      const bx = main.x + Math.cos(angle) * radius;
      const by = main.y + Math.sin(angle) * radius * 0.92;
      spots.push({
        index: i,
        baseX: bx,
        baseY: by,
        phase: rng() * TAU,              // 烛火悬浮的慢漂移相位（种子决定，非随机数）
        x: bx,
        y: by,
        vx: 0,
        vy: 0,
        bright: 0,
        vbright: 0,
      });
    }
    this._mainPos = main;
    this._spots = spots;
    this._mainBright = 0;
  }

  // 音频事件入口：主循环把 detector 事件在派发后立即推入，下一行 render 即消费（AC5）
  pushEvent(ev) {
    this._events.push(ev);
  }

  setPerspective(on) {
    this._perspective = !!on;
  }

  render(now, envelope, voiceStates) {
    const ctx = this._ctx;
    const w = this._w;
    const h = this._h;
    const dtMs = Math.min(50, now - (this._lastFrameAt || now - 16.7));
    this._lastFrameAt = now;

    // —— 事件消费（本帧内，AC5）：首次呼吸点亮纹样局部 + 记录呼吸周期
    while (this._events.length) {
      const ev = this._events.shift();
      if (ev.type === 'breathIn') {
        this._holdArmed = true;
        this._lastPeriodMs = ev.periodMs || this._lastPeriodMs;
        // 纹样局部点亮：主光斑上方的骨架节点被这口气唤醒
        this._accent = { x: this._mainPos.x, y: this._mainPos.y - this._cell * 1.6, at: now };
      }
    }

    // —— 包络阻尼跟随（followDamping 按 60fps 基准归一，帧率无关）
    const followAlpha = 1 - Math.pow(1 - this._spotsCfg.followDamping, dtMs / 16.7);
    this._envelopeDamped += (envelope - this._envelopeDamped) * followAlpha;
    const env = this._envelopeDamped;

    // —— 「断气→托住」判定：包络低于断线阈值持续 gapBreakSeconds → 托住编排启动
    if (this._holdArmed) {
      if (envelope < this._gap.lowThreshold) {
        if (this._holdLowSince === null) this._holdLowSince = now;
        if (!this._holdActive && now - this._holdLowSince >= this._gap.gapBreakSeconds * 1000) {
          this._holdActive = true;
          this._holdStartAt = now;
        }
      } else {
        this._holdLowSince = null;
        this._holdActive = false;      // 呼吸回来：托住解除，弹簧阻尼回位
      }
    }

    // —— 底色 + 微光氛围层（Ambient Lighting，D3：亮度随呼吸包络逐帧振动）
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = this._palette.base;
    ctx.fillRect(0, 0, w, h);
    const glowA = this._ambient.glowBrightness * (0.2 + 0.8 * env);
    const [ar, ag, ab] = hexToRgb(this._palette.ambientCool);
    const glow = ctx.createRadialGradient(
      this._mainPos.x, this._mainPos.y, 0,
      this._mainPos.x, this._mainPos.y, Math.max(w, h) * 0.75,
    );
    glow.addColorStop(0, `rgba(${ar},${ag},${ab},${glowA.toFixed(3)})`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    if (!this._perspective) {
      this._drawPattern(now, env);
      this._drawAccent(now);
      this._drawSpots(now, env, voiceStates, dtMs);
    } else {
      this._drawSkeleton(now, voiceStates, dtMs);   // 透视：只看声部状态机骨架（T8 加分项）
    }

    // —— 暗角：让光斑成为唯一焦点
    const vg = ctx.createRadialGradient(
      w / 2, h / 2, Math.min(w, h) * 0.42,
      w / 2, h / 2, Math.max(w, h) * 0.72,
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(0,0,0,${this._ambient.vignetteStrength.toFixed(2)})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  // 主纹样：菱形骨架 + 十字纹 + 井字纹，明灭曲线 = 基础脉冲 × 呼吸包络抬升
  _drawPattern(now, env) {
    const ctx = this._ctx;
    const p = this._pattern;
    const pulseRaw = 0.5 + 0.5 * Math.sin(TAU * p.pulseFrequencyHz * (now / 1000));
    const pulse = Math.pow(pulseRaw, p.pulseEasing);   // 幂次 >1：吐气段更缓，呼吸不对称感
    const bright = p.pulseDepth * pulse * (0.35 + 0.65 * env) + (1 - p.pulseDepth) * 0.32;
    const [r, g, b] = hexToRgb(this._palette.patternWarm);
    ctx.lineWidth = 1;
    const s = this._cell;
    for (const node of this._nodes) {
      const half = (s * 0.34 * node.size) / 1.414;
      const flicker = 0.75 + 0.25 * Math.sin(TAU * 0.23 * (now / 1000) + node.phase);
      ctx.strokeStyle = `rgba(${r},${g},${b},${((0.05 + bright * 0.30) * flicker).toFixed(3)})`;
      ctx.beginPath();
      if (node.kind === 'diamond') {
        ctx.moveTo(node.x, node.y - half);
        ctx.lineTo(node.x + half, node.y);
        ctx.lineTo(node.x, node.y + half);
        ctx.lineTo(node.x - half, node.y);
        ctx.closePath();
        ctx.stroke();
      } else if (node.kind === 'cross') {
        ctx.moveTo(node.x - half, node.y);
        ctx.lineTo(node.x + half, node.y);
        ctx.moveTo(node.x, node.y - half);
        ctx.lineTo(node.x, node.y + half);
        ctx.stroke();
      } else {
        const inset = CONFIG.visual.pattern.hashInset * (node.size || 1) * (s / 46);
        ctx.moveTo(node.x - half + inset, node.y);
        ctx.lineTo(node.x + half - inset, node.y);
        ctx.moveTo(node.x, node.y - half + inset);
        ctx.lineTo(node.x, node.y + half - inset);
        ctx.stroke();
      }
    }
  }

  // 第一次呼吸的纹样局部点亮：以主光斑为圆心的一圈涟漪，阻尼衰减（可被打断）
  _drawAccent(now) {
    if (!this._accent) return;
    const age = (now - this._accent.at) / 1800;
    if (age >= 1) {
      this._accent = null;
      return;
    }
    const ctx = this._ctx;
    const ease = Math.pow(1 - age, 2.2);
    const [r, g, b] = hexToRgb(this._palette.spotWarm);
    ctx.strokeStyle = `rgba(${r},${g},${b},${(0.5 * ease).toFixed(3)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(this._accent.x, this._accent.y, 24 + age * 90, 0, TAU);
    ctx.stroke();
  }

  // 光斑层：主光斑（你的呼吸）+ 声部光斑（鬼魂声部，烛火形态）+ 托住编排
  _drawSpots(now, env, voiceStates, dtMs) {
    const ctx = this._ctx;
    const dt = dtMs / 1000;

    // 主光斑：亮度即你的呼吸；断气时阻尼压到地板值，等邻声部来托
    const mainTarget = this._holdActive ? 0.14 : Math.max(env, 0.02);
    this._springBrightness(null, mainTarget, dt, (v) => { this._mainBright = v; });
    this._drawGlow(this._mainPos.x, this._mainPos.y, this._spotsCfg.radius, this._mainBright, true);

    // 声部光斑：状态定亮度基线，托住编排按慢半拍依次抬升并把位置拧向主光斑
    this._spots.forEach((spot, i) => {
      const st = (voiceStates && voiceStates[i]) ? voiceStates[i].state : 'asleep';
      const base = st === 'singing' ? 0.68 + 0.14 * env
        : st === 'entering' ? 0.55
        : st === 'listening' ? 0.18
        : st === 'leaving' ? 0.22
        : 0;

      // 托住浮出的慢半拍：邻声部 i 的浮出拍 = 托住启动 + i × 呼吸周期 × entryDelayRatio
      let holdRise = 0;
      if (this._holdActive) {
        const delayMs = i * this._lastPeriodMs * CONFIG.audio.voice.entryDelayRatio;
        const t = (now - this._holdStartAt - delayMs) / 900;      // 0.9s 浮出
        holdRise = t <= 0 ? 0 : Math.min(1, Math.pow(t, 1.4));    // 幂次缓动：先探后托
      }
      const brightTarget = Math.max(base, holdRise * 0.72);
      const pull = holdRise * 0.34;                                // 拧向主光斑成织体

      // 位置：基础点 + 烛火慢漂移；托住时向主光斑收拢
      const driftSec = this._spotsCfg.driftSeconds;
      const dx = Math.sin(TAU * (now / 1000) / driftSec + spot.phase) * 9;
      const dy = Math.cos(TAU * (now / 1000) / (driftSec * 1.37) + spot.phase) * 7;
      const tx = spot.baseX + dx + (this._mainPos.x - spot.baseX) * pull;
      const ty = spot.baseY + dy + (this._mainPos.y - spot.baseY) * pull;

      this._springPosition(spot, tx, ty, dt);
      this._springBrightness(spot, brightTarget, dt);
      this._drawGlow(spot.x, spot.y, this._spotsCfg.radius * 0.86, spot.bright, false, i);
    });
  }

  // 欠阻尼弹簧（位移）：有回弹、随时改目标随时打断（D3/AC9）
  _springPosition(spot, tx, ty, dt) {
    const k = this._omega * this._omega;
    const c = 2 * this._omega * this._zeta;
    spot.vx += (tx - spot.x) * k * dt - c * spot.vx * dt;
    spot.vy += (ty - spot.y) * k * dt - c * spot.vy * dt;
    spot.x += spot.vx * dt;
    spot.y += spot.vy * dt;
  }

  // 欠阻尼弹簧（亮度）：与位移同一物理手感
  _springBrightness(spot, target, dt, setter = null) {
    const cur = setter ? this._mainBright : spot.bright;
    const vel = setter ? this._mainVBright : spot.vbright;
    const k = this._omega * this._omega;
    const c = 2 * this._omega * this._zeta;
    const nv = vel + (target - cur) * k * dt - c * vel * dt;
    const nc = cur + nv * dt;
    if (setter) {
      this._mainVBright = nv;
      setter(nc);
    } else {
      spot.vbright = nv;
      spot.bright = nc;
    }
  }

  // 烛火形态光斑：芯 + 光晕两层径向渐变，additive 叠加成织体
  _drawGlow(x, y, radius, bright, isMain, voiceIndex = -1) {
    if (bright <= 0.004) return;
    const ctx = this._ctx;
    const warm = hexToRgb(this._palette.spotWarm);
    const core = hexToRgb(this._palette.spotCore);
    const haloScale = this._spotsCfg.haloScale;
    const flick = 0.94 + 0.06 * Math.sin(TAU * 1.7 * ((this._lastFrameAt || 0) / 1000) + voiceIndex * 1.3);
    const r = radius * (0.75 + 0.35 * bright) * flick;

    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(x, y, 0, x, y, r * haloScale);
    halo.addColorStop(0, `rgba(${warm[0]},${warm[1]},${warm[2]},${(0.34 * bright).toFixed(3)})`);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(x - r * haloScale, y - r * haloScale, r * haloScale * 2, r * haloScale * 2);

    const body = ctx.createRadialGradient(x, y, 0, x, y, r);
    body.addColorStop(0, `rgba(${core[0]},${core[1]},${core[2]},${(0.9 * bright).toFixed(3)})`);
    body.addColorStop(0.45, `rgba(${warm[0]},${warm[1]},${warm[2]},${(0.5 * bright).toFixed(3)})`);
    body.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = body;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.globalCompositeOperation = 'source-over';
  }

  // 透视开关（T8 加分项，不进验收线）：关掉表层纹样，只看声部状态机骨架
  _drawSkeleton(now, voiceStates, dtMs) {
    const ctx = this._ctx;
    const alpha = this._perspectiveCfg.skeletonAlpha;
    const [lr, lg, lb] = hexToRgb(this._perspectiveCfg.lineColor);
    this._spots.forEach((spot, i) => {
      const st = (voiceStates && voiceStates[i]) ? voiceStates[i].state : 'asleep';
      const st2 = (voiceStates && voiceStates[i]) ? voiceStates[i] : { noteIndex: 0 };
      // 骨架层仍走同一弹簧（透视是同一物理的裸视图，不是另一套动画）
      const dx = Math.sin(TAU * (now / 1000) / this._spotsCfg.driftSeconds + spot.phase) * 9;
      const dy = Math.cos(TAU * (now / 1000) / (this._spotsCfg.driftSeconds * 1.37) + spot.phase) * 7;
      this._springPosition(spot, spot.baseX + dx, spot.baseY + dy, dtMs / 1000);
      const brightTarget = st === 'asleep' ? 0.12 : st === 'listening' ? 0.3 : 0.8;
      this._springBrightness(spot, brightTarget, dtMs / 1000);

      ctx.strokeStyle = `rgba(${lr},${lg},${lb},${(alpha * 0.6).toFixed(2)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(this._mainPos.x, this._mainPos.y);
      ctx.lineTo(spot.x, spot.y);
      ctx.stroke();
      ctx.fillStyle = `rgba(${lr},${lg},${lb},${alpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, 5, 0, TAU);
      ctx.fill();
      ctx.font = '11px -apple-system, "PingFang SC", sans-serif';
      ctx.fillText(`v${i + 1} ${st} · note${st2.noteIndex}`, spot.x + 10, spot.y - 8);
    });
    ctx.fillStyle = `rgba(${lr},${lg},${lb},${alpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(this._mainPos.x, this._mainPos.y, 7, 0, TAU);
    ctx.fill();
    ctx.fillText('you', this._mainPos.x + 12, this._mainPos.y - 10);
  }
}
