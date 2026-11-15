# Kiroween 2026 · 提交清单（Devpost）

截止：2026-12-04 14:00 PST（北京时间 12-05 06:00）
赛道：Costume Contest（Best Costume Contest $5,000）

## 硬性要求（逐条核）
- [ ] 公开 GitHub 仓库（非 GitLab/BitBucket），源码+素材+说明齐全
- [ ] 仓库含开源 license 文件（MIT ✓），GitHub About 区可见
- [ ] 根目录含 /.kiro 目录（specs/hooks/steering），且不在 .gitignore（✓）
- [ ] 可访问的应用 URL（建议 GitHub Pages 或 Netlify）
- [ ] 文字描述（features/functionality）
- [ ] Demo 视频 <3 分钟，公开上传 YouTube，展示项目在目标设备（手机）上运行
- [ ] Kiro 使用说明（IDE/CLI、spec-driven、steering、hooks、MCP 等）

## 加分项备选（提交时勾选）
- [ ] Social Blitz：提交期内社媒发帖，开头带 #KiroweenHackathon26
- [ ] Best Ghost of Kiroween Past：确认报名了 2025 版

## 时间线
- 11 月中旬：T1–T8 完成（代码 + 本地 Demo）
- 11 月底：真机验收 T9 + 录视频
- 12 月初：上传 GitHub Pages、上传 YouTube、填 Devpost 表单（先存草稿）
- 12-04 前：终检提交

## 注意
- 4000 积分申请已提交（先到先得，48h 审核，可能 Didit 身份验证）
- 项目必须在 10/30–12/4 期间新建（本项目 10-31 新建 ✓）

---

## MVP 验收记录（2026-11-16 · yian 独立复核）

环境：干净工作树（HEAD 8281766），仓库根 `python3 -m http.server 8000`；桌面 Chrome +
CDP 可信点击 + `Network.emulateNetworkConditions` offline 仿真；状态走
`window.__breathCatcher` 只读探针；两轮独立全周期实跑（进场→织体→静默→逐层退场→收束）。

### 逐条判定

| 项 | 判定 | 证据 |
| --- | --- | --- |
| AC1 加载 | pass | loadEventEnd 62ms（<1s）；resource 8 条全 127.0.0.1，零 404 |
| AC2 denied | pass | 中性可信点击→prompting→denied；文案「麦克风没来——不碍事」非阻塞；演示按钮点亮 #F2D9A6（透视按钮对照组未点亮）；meter idle 态 display:none；LAN http 下 mediaDevices 不存在的最恶劣场景同落 denied 分支零砸穿（T9 预检实测 2026-11-16） |
| AC3 延迟 | pass | lastLatencyMs 实测 49.1–127.4ms，全部 <150ms（tau=90ms，帧率无关） |
| AC4 支声 | pass（11-16 修复复核） | voice_i 进场 = 武装起音 + i×period，实测偏差 +33/+233/+133ms（300ms 采样粒度内）；4/4 齐 t0+22.75s；choir1 稳态 160/160 样本全 4/4——见 FAIL-1 修复记录 |
| AC5 同帧 | pass | 音频事件帧头消费、渲染同帧（performance.now() 同源时钟）；光斑明灭随包络逐帧联动（时间线采样+截图） |
| AC6 Demo | pass | denied 一键进演示；合成包络与麦克风同一 setSource(fn) 通路；全周期无麦克风走通 |
| AC7 真机 | 未验 | 属 T9（2026-11-30 前），本轮不施工 |
| AC8 第一秒 | pass | 首帧全屏侗锦+「试一次呼吸」，无介绍页、无登录、无满屏按钮（截图+视觉核） |
| AC9 退场 | pass | 停止→8s 静默（末口呼吸 ~126.1s→fading 134.9s）→声部 0/1/2/3 逐层 leaving（~1.2s 间隔）→141.2s 全 asleep→回 listening；包络归零，可随时打断（时间戳调度） |

### 三条硬约束

| 约束 | 判定 | 证据 |
| --- | --- | --- |
| ① 纯前端 | pass | 全仓无服务端代码；唯一 .sh 是 Kiro 保存钩子（开发期语法检查，非运行时依赖）；index.html + 8 个 JS 模块全本地相对路径，静态文件服务直开即可 |
| ② 零 API Key | pass | 全仓 grep 凭据字段（apiKey/secret/password/credential/bearer/token）与密钥格式（sk-/AKIA/ghp_/xox/AIza/PRIVATE KEY）零命中；唯一命中是 requirements.md 约束条文自身；页面无密钥输入（仅两枚按钮） |
| ③ 零 CDN | pass | js/html/css 零 http(s):// 引用；运行期 resource 全程仅 8 个 127.0.0.1 文件；offline 仿真下本地探针 fetch 失败（断网生效）且 demo 全功能照走；console 全程零错误 |

### FAIL-1（阻塞 T9/T10）：AC4 支声进场拍被每口气 re-arm 推走

现象：`voice-engine.js handleBreathIn` 对非 entering/singing 声部每口气都改写
`enterAt = 最新起音 + i×period`。连续匀速呼吸（period 3.4–4s）下 i≥1 声部的进场拍
不断被下一口气推走：voice3 延迟 3×4s=12s 恒大于呼吸间隔，永不进场；voice1/2 只在
demo 脚本段间静默的空档里碰巧进场。连续呼吸段（choir1/choir2）实测零新声部进场，
「连续呼吸 → ≥4 声部慢半拍进入」不成立。

修复（一行语义收口）：进场拍只武装一次，已武装不推拍——

```js
// 现行：每口气无条件改写
v.enterAt = ev.at + v.index * periodMs * this._entryDelayRatio;
// 改为：仅未武装时设置
if (v.enterAt === null) v.enterAt = ev.at + v.index * periodMs * this._entryDelayRatio;
```

AC9 语义不受损：leaveAt 清退场标记照旧、handleSilence 清 enterAt 照旧、
leaving 声部 enterAt 为 null 照旧可被新呼吸重武装。修后 voice_i 进场 =
武装呼吸起音 + i×period，与 design.md「声部 i 的进入延迟 = i × 一个呼吸周期」一致。

跟进卡：**t_3d474cc1**（本验收通过后自动就绪；T9/T10 在其完成前不开工）。

修复复核（2026-11-16 · 修复卡 t_3d474cc1，commit aa43879）：进场拍只武装一次
已落 `js/engine/voice-engine.js`，http.server + CDP 可信点击全周期实跑两轮（run1 进场侧
通过后工具断连、页面零错误；run2 完整全周期）：

- AC4 实证：voice1/2/3 进场 = 武装起音(12047.8ms, periodMs=4000 fallback) + i×period，
  偏差 +33/+233/+133ms（300ms 采样粒度内）；4/4 声部齐 t0+22.75s；choir1 稳态
  （27–75s 窗口）160/160 样本全 4/4；连续呼吸段织体不散（run1 32–121s 全程 4/4 singing）
- AC9 回归：8s 静默→逐层 leaving（+0.27/1.47/2.67/3.88s，exitStagger 1.2s×i 照旧）
  →t0+137.95s 全 asleep→同帧回 listening——退场不被修复破坏
- 健康面：console 零错误；lastLatencyMs 60.5–84.0ms（AC3 未受损）；时间线 465 样本 +
  事件流水 28 条留档（修复卡附件：ac4-fix-timeline.json / ac4-fix-e2e.log /
  ac4-fix-choir1-all4-singing.png / ac4-fix-silence-all-asleep.png）

### 提交清单（commit）

15 笔至 8281766（3 docs + 8 feat + 4 端到端实抓修复）+ 验收记录 1 笔（4f261cd）+ AC4 修复 2 笔（aa43879、214ed56）+ README 1 笔（25e3437，T10 使用说明交付件）+ T9 前置修复 1 笔（本笔，真机步骤改 HTTPS + serve-https.py 入仓）＝20 笔：

```
6426116 docs: 定方向——Marvin 四点收敛为三条改造决定，明确 MVP 验收线
d3612e7 docs: 方向决定段补出处——Marvin 访谈一手链接与源会话引用
bbb7ab8 docs: spec 按 overview 三决定修订——T1–T8 自包含可原样实现
b244260 feat(task-1): 项目骨架与参数外置
63b4a02 feat(task-2): 音频输入管线
5067ac6 feat(task-3): BreathDetector 呼吸事件
2458dd0 feat(task-4): VoiceEngine 单声部
0e5418d feat(task-5): 支声织体与可打断状态机
caaee23 feat(task-6): BrocadeRenderer 母题渲染
5fab671 feat(task-7): UI 状态机与引导文案
c1cb616 feat(task-8): DemoMode 与彩排
0e26ffd fix(index): data-URI 空 favicon——消除首载 404
7e3ba30 fix(engine): 包络源接口统一为函数注入 + 主循环先续帧不断流
792ea09 fix(ui): 演示模式隐藏自检音量条
8281766 fix(engine): detector 空源=无声——包络归零衰减，退场链路照常触发
4f261cd docs(notes): MVP 验收记录 + 最终提交清单——AC4 fail 实抓与修复跟进卡
aa43879 fix(engine): AC4 进场拍只武装一次——已武装不推拍，慢半拍到拍
214ed56 docs(notes): AC4 修复复核记录——进场=武装起音+i×period 实证
25e3437 docs(readme): T10 使用说明——30 秒上手、四幕录制指引、Kiro 兜底条款如实入文
（本笔）docs(t9-prep): 真机步骤改 HTTPS + serve-https.py 入仓——真机麦克风需要安全上下文，口径三处一致
```

### Kiro 使用说明

Kiro.app 本机不在位（mdfind + /Applications 双核，~/.kiro 仅 10-31 配置残留）→
按任务卡兜底条款施工：spec-driven 以 `.kiro/specs/feature-01-breath-engine/`
（requirements / design / tasks）为基准；hook 语义以 `scripts/check-syntax.sh`
（node --check）等效执行；steering 三件在 `.kiro/steering/`。12 个实现 commit
message 均含 Kiro 使用说明（git log 可查）。Devpost「Kiro 使用说明」栏照此如实填写，
不虚构 IDE 会话。
