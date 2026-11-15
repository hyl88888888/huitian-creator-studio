# 回天创作台：开源技术选型与商业发行边界

> 决策快照：2026-08-03。本文面向产品负责人和研发负责人，用于决定“现在接什么、以后接什么、明确不接什么”。开源项目及模型许可会变化，正式发布前必须按锁定的版本、提交号和模型文件重新复核。本文不是法律意见。

## 结论先行

回天创作台应继续做成一个 Windows 桌面端产品，但内部采用“轻量本地核心 + 可插拔 AI 工作者 + 可选云端算力”的三层架构。第一阶段先把文案闭环、镜头理解、节奏规划、字幕设计和剪映交付做扎实；重型抠图、超分和视频生成按设备能力按需下载，不能一股脑塞进安装包。

“会自己思考和进化”应落实为可审计的学习闭环：多方案生成 → 规则和模型复评 → 用户选择/修改 → 记录偏好与效果 → 小流量验证新版策略 → 可回滚发布。不能让模型直接修改、编译并替换自己的程序，也不能自动下载 GitHub 上的任意代码执行；那既不可控，也无法证明质量和供应链安全。

商业闭源产品要同时核对四层权利，不能只看仓库首页的许可证：

1. 项目源代码许可证；
2. 模型权重、字体、模板、示例素材和训练数据的独立条款；
3. 云 API 对输入、输出和训练使用的服务条款；
4. H.264/H.265 等编解码器可能涉及的专利许可。

## 商用发布阻断项：当前 FFmpeg 构建

当前项目依赖 [`ffmpeg-static@5.3.0`](https://github.com/eugeneware/ffmpeg-static)，其[仓库许可证为 GPL-3.0-or-later](https://github.com/eugeneware/ffmpeg-static/blob/master/LICENSE)。本机实际随包二进制报告：

```text
ffmpeg version 6.1.1-essentials_build-www.gyan.dev
--enable-gpl --enable-version3 --enable-static ... --enable-libx264 --enable-libx265 ...
```

这不是“可能有风险”，而是已经确认当前二进制启用了 GPL 组件并静态构建；`libx264` 也触发了 GPL 配置。**在对外收费、闭源分发前，必须更换为来源、配置、源码和许可证都可证明合规的构建，或完整履行适用的 GPL/LGPL 义务。** 仅把 FFmpeg 当作独立进程调用、仅附一份许可证，不能自动消除发行义务。FFmpeg 官方也要求按实际构建配置判断，参见[官方许可与合规说明](https://ffmpeg.org/legal.html)。

建议在下一次商用安装包之前完成以下其一，并让专业法律顾问复核：

- 自建并固定一个可复现的 LGPL FFmpeg：禁用 `--enable-gpl`、`--enable-nonfree` 及 GPL 编码器，保留完整构建脚本、源码对应版本、哈希和第三方声明；编码可按设备选择 Windows Media Foundation/硬件编码，但仍需单独确认编解码专利问题。
- 若决定继续发行 GPL 构建，按其准确许可证版本履行源码提供、版权与许可证保留等全部义务，并评估与闭源桌面应用的组合/分发关系。
- 将编码迁到已完成许可证与专利合规的服务端供应链，桌面端只上传任务和接收结果；这会增加联网、隐私、带宽和成本要求。

无论选择哪条路，都应生成 `THIRD_PARTY_NOTICES`、软件物料清单（SBOM）和“二进制 → 来源 → 版本 → 哈希 → 构建参数 → 许可证”的追溯记录。

## 立即采用：进入 V0.2 主路径

“立即采用”表示进入产品路线和接口设计；不代表当前安装包已完成集成。

| 项目 | 官方仓库 / 许可证 | 采用方式 | Windows、算力与商业注意事项 |
|---|---|---|---|
| OpenCut | [仓库](https://github.com/OpenCut-app/OpenCut) · [MIT](https://github.com/OpenCut-app/OpenCut/blob/main/LICENSE) | 借鉴并在代码审计后选择性复用时间线数据模型、编辑器交互和插件边界，不整套搬入。 | MIT 对闭源商用友好，但要保留版权和许可声明。当前主分支仍在重写，Editor API、Rust 核心、无头模式和 MCP 等能力处于路线图阶段，不能把尚未稳定的接口当作产品依赖。 |
| whisper.cpp | [仓库](https://github.com/ggml-org/whisper.cpp) · [MIT](https://github.com/ggml-org/whisper.cpp/blob/master/LICENSE) | 作为本地转写、时间戳和口播断句的默认候选；产出词级/句级时间轴，供字幕和智能删停顿使用。 | Windows 可运行，CPU 可用，CUDA/Vulkan 等加速按机器选择；模型越大，内存和延迟越高。模型文件也要记录来源、哈希与许可，首次下载应征得用户同意。 |
| PySceneDetect | [仓库](https://github.com/Breakthrough/PySceneDetect) · [BSD-3-Clause](https://github.com/Breakthrough/PySceneDetect/blob/main/LICENSE) | 检测镜头切换、淡入淡出和候选切点，为节奏规划提供结构信号。 | Windows 可用，主要是 CPU/Python 依赖；建议做成受控 sidecar 或预编译工具，避免污染 Electron 运行时。它只负责“哪里发生变化”，不能独自判断审美好坏。保留 BSD 声明。 |
| MediaPipe | [仓库](https://github.com/google-ai-edge/mediapipe) · [Apache-2.0](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE) | 用于轻量人脸/人体关键点、主体位置和智能重构图，优先验证 Web/WASM 路线。 | 对普通 Windows 机器比大型分割模型友好；不同 Tasks、模型文件和第三方依赖仍需分别核对。Apache-2.0 可商用，但要保留 NOTICE/许可证并满足专利条款。 |
| FFmpeg（替换当前来源） | [官方源码](https://git.ffmpeg.org/ffmpeg.git) · [官方许可说明](https://ffmpeg.org/legal.html) | 继续承担解码、合成、滤镜和导出，但换成有完整来源及构建证据的合规版本。 | Windows 硬件编码器和滤镜可用性要在 NVIDIA/AMD/Intel/纯 CPU 四类机器上测试。**当前 `ffmpeg-static` GPL/libx264 构建不得未经合规处理直接用于收费闭源发行。** |

## 后续可选：通过独立能力适配器接入

这些能力价值高，但不应阻塞第一阶段。统一放在独立进程、局域网服务或云服务后面，让低配电脑仍能使用核心产品，并让不同模型可替换。

| 项目 | 官方仓库 / 许可证 | 推荐用途 | Windows、算力与商业注意事项 |
|---|---|---|---|
| Real-ESRGAN | [仓库](https://github.com/xinntao/Real-ESRGAN) · [BSD-3-Clause](https://github.com/xinntao/Real-ESRGAN/blob/master/LICENSE) | 低清截图、商品图和旧视频的降噪/超分，可优先试 Windows NCNN 可执行版。 | 有 GPU 更快，CPU 可运行但批量视频会慢；超分不能创造真实细节，应允许用户对比和关闭。代码可商用，仍需核对所带模型和第三方二进制。 |
| Depth Anything V2 Small | [仓库](https://github.com/DepthAnything/Depth-Anything-V2) · [Apache-2.0](https://github.com/DepthAnything/Depth-Anything-V2/blob/main/LICENSE) | 单图深度估计，用于轻微景深、2.5D 推拉和主体层次，而不是滥用炫技特效。 | Windows 上建议 ONNX/DirectML 或独立 Python 工作者。**只有 Small 权重为 Apache-2.0；Base/Large/Giant 权重是 CC-BY-NC-4.0，不能放进收费产品。** |
| SAM 2 | [仓库](https://github.com/facebookresearch/sam2) · [Apache-2.0](https://github.com/facebookresearch/sam2/blob/main/LICENSE) | 高质量视频主体分割、跟踪、遮挡和蒙版，作为“高级抠图包”。 | 官方栈偏 Python/PyTorch/CUDA，Windows 原生部署成本高，通常需要兼容层或 WSL；显存和安装体积都较大。代码与权重为 Apache-2.0，但字体和第三方组件另有许可。 |
| ComfyUI | [仓库](https://github.com/Comfy-Org/ComfyUI) · [GPL-3.0](https://github.com/Comfy-Org/ComfyUI/blob/master/LICENSE) | 只作为用户自行安装或服务端部署的外部生成后端，通过稳定 HTTP/API 适配器调用图片、局部重绘和视频工作流。 | Windows 本地部署成熟，但显存、模型下载和自定义节点依赖复杂。不要复制其代码或把它作为闭源应用内的紧耦合模块；工作流里的每个模型、LoRA 和节点都有自己的许可。 |
| Wan2.1 | [仓库](https://github.com/Wan-Video/Wan2.1) · [Apache-2.0](https://github.com/Wan-Video/Wan2.1/blob/main/LICENSE.txt) | 作为原创 B-roll、氛围镜头和转场素材的可选本地/云端生成器。 | 1.3B 模型官方给出的最低量级约为 8.19GB 显存；官方示例中 RTX 4090 生成 5 秒 480p 仍以分钟计，不能伪装成普通电脑上的即时功能。还要做人物授权、内容安全和生成记录。 |
| CogVideo | [仓库](https://github.com/zai-org/CogVideo) · [Apache-2.0](https://github.com/zai-org/CogVideo/blob/main/LICENSE) | 作为与 Wan 可替换的视频生成供应器，不把业务流程绑定到单一模型。 | 通常需要独立 Python/CUDA 环境或云 GPU。仓库代码许可不等于所有权重许可，下载某个具体模型前必须复核其模型卡。 |
| LTX Desktop | [仓库](https://github.com/Lightricks/LTX-Desktop) · [Apache-2.0](https://github.com/Lightricks/LTX-Desktop/blob/main/LICENSE.txt) | 重点学习其 Electron 前端 + Python 后端、模型按需下载和性能验证架构；是否复用代码另行评审。 | 支持 Windows，但本地视频生成仍受 GPU/显存限制；首次运行可能依赖网络文本编码或另行下载本地编码器。桌面代码是 Apache-2.0，模型权重会单独弹出条款，不能把代码许可证当作权重授权。 |

## 明确暂缓：当前不进入产品依赖

| 项目或范围 | 官方仓库 / 许可证 | 暂缓原因 |
|---|---|---|
| Remotion 直接嵌入 | [仓库](https://github.com/remotion-dev/remotion) · [特殊商业许可证](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md) | 技术上很适合程序化视频，但不是 MIT/Apache。个人及最多 3 人的营利组织可在许可范围内免费使用；更大营利组织需要公司许可，而且许可证明确限制为了销售自有衍生产品而复制/修改其代码。取得书面许可前只做思路参考。 |
| OpenCut 整体嵌入或押注未完成 API | [仓库](https://github.com/OpenCut-app/OpenCut) · [MIT](https://github.com/OpenCut-app/OpenCut/blob/main/LICENSE) | 许可证友好，但当前重写和未来 API 尚未稳定。整体嵌入会同时继承大量产品复杂度，违背“一站式、少填写”的目标。 |
| Robust Video Matting | [仓库](https://github.com/PeterL1n/RobustVideoMatting) · [GPL-3.0](https://github.com/PeterL1n/RobustVideoMatting/blob/master/LICENSE) | 效果优秀，但直接嵌入闭源收费应用有强 copyleft 风险。除非改为边界清晰的外部服务并经法律评审，否则优先用 MediaPipe 或后续评估 Apache 许可替代品。 |
| LosslessCut 代码复用 | [仓库](https://github.com/mifi/lossless-cut) · [GPL-2.0-only](https://github.com/mifi/lossless-cut/blob/master/LICENSE) | 可学习无损切割和 FFmpeg 编排思路，但不复制其代码进闭源产品；其自身也明确按 GPL 发行并随附 GPL FFmpeg 构建。 |
| Depth Anything V2 Base/Large/Giant 权重 | [仓库](https://github.com/DepthAnything/Depth-Anything-V2) · [仓库许可说明](https://github.com/DepthAnything/Depth-Anything-V2#license) | 这些权重为 CC-BY-NC-4.0，含“非商业”限制，不适合未来收费产品；只允许商业路径使用 Small 或另购明确商业授权。 |
| ComfyUI 源码内嵌/紧耦合插件 | [仓库](https://github.com/Comfy-Org/ComfyUI) · [GPL-3.0](https://github.com/Comfy-Org/ComfyUI/blob/master/LICENSE) | 外部服务适配可以评估，但复制、链接或形成紧耦合衍生模块会扩大 GPL 合规范围；自定义节点还存在许可证碎片化问题。 |

## 推荐三阶段架构

### 第一阶段：单机可用、结果可控（V0.2）

目标是“不要求用户先学会写提示词，也能得到可改、可解释、可交付的成片”。

- **桌面壳与项目层**：Electron 只负责任务编排、素材管理、预览和工程导出；项目文件保存原始素材引用、文案版本、时间轴、字幕样式、模型版本与生成来源。
- **理解层**：转写生成带时间戳文本；镜头检测生成候选切点；人脸/主体检测给出构图安全区；用户只需输入一个目标，其余信息默认自动推断，高级项全部可选。
- **文案闭环**：先把用户要求转成不可违反的检查表，再并行生成多个候选；分别检查“是否与观众有关、事实是否有证据、钩子是否兑现、口语是否自然、平台风险”，最后由复评器选出并解释最佳版本。用户改动要保存为个人偏好样本，而不是直接污染所有用户的通用规则。
- **导演时间线**：每句话同时拥有叙事角色、情绪强度、建议景别、画面来源、字幕模板和允许使用的动效。剪辑器根据语义与节奏做 J/L cut、停顿压缩、B-roll 覆盖和字幕层级，不再按文件顺序纯拼接。
- **渲染与交付**：用经过合规审核的 FFmpeg 构建渲染预览和成片；同时导出原视频、字幕、镜头表、素材清单和可映射到剪映的中间工程数据。任何自动决定都应能在时间线上手动改。

这一阶段可离线完成转写、镜头分析和基础渲染；调用在线大模型或云端素材生成时才要求联网。断网时必须明确显示当前使用的是本地能力，不能悄悄降低质量。

### 第二阶段：可选视觉能力包（V0.3–V0.5）

目标是让高配用户获得更强画面，而不让低配用户承担安装和算力成本。

- 定义统一能力协议：`transcribe`、`detectScenes`、`segmentSubject`、`estimateDepth`、`upscale`、`generateImage`、`generateVideo`。每个任务都有进度、取消、超时、显存预算、输入输出哈希和失败降级。
- 本地工作者与主程序分进程，模型按需下载并显示体积、预计耗时和许可；优先验证 Real-ESRGAN、Depth Anything V2 Small，再把 SAM 2 作为高配包。
- ComfyUI、Wan、CogVideo 或商业云 API 都通过适配器接入。导演层只描述“需要什么镜头”，供应器层决定由用户素材、程序化原创图形、本地模型还是云模型实现。
- 建立视觉质量检查：主体是否变形、文字是否错误、产品是否一致、镜头是否重复、生成素材是否真能服务当前句子。检测不合格时重试或回退到用户素材，不强行塞入 AI 画面。

### 第三阶段：可收费的持续学习平台（V1.0+）

目标是形成真实的数据飞轮，而不是宣传“无限自我进化”。

- **控制面**：账号、订阅、额度、项目同步、模型路由、模板版本和签名更新。
- **计算面**：对象存储、任务队列、隔离的 GPU 工作者、并发与成本控制；用户可选“本地优先 / 云端优先 / 仅本地”。
- **评估面**：保存候选文案、最终选择、用户修改差异、镜头替换、完播/互动/转化等经过授权的效果数据；按 IP、品类和平台分层评估，避免所有用户风格被平均化。
- **发布面**：新策略先离线基准测试，再小流量 A/B，达到质量和成本阈值后签名发布；任何版本都能回滚。模型不能自行提升权限、执行任意代码或覆盖生产配置。
- **隐私与权利**：个人口播、人脸、声音、客户商品和对标视频默认私有；训练使用必须单独选择同意。保存素材来源、授权、模型、提示词和结果哈希，便于申诉和商业举证。

## 进入开发前的验收门槛

1. 当前 GPL/libx264 FFmpeg 发行问题关闭，并留下可复现证据。
2. 每个依赖和模型都有锁定版本、许可证、来源哈希、NOTICE 与卸载/替换方案。
3. 普通 Windows CPU 机器能完成转写、镜头分析、预览和剪映交付；没有独显时不展示虚假的“即时 AI 视频生成”。
4. 同一输入至少生成多份文案并经过逐条硬约束校验；用户修改能形成可查看、可删除的个人偏好。
5. 自动剪辑有可量化基线：口播同步误差、镜头重复率、字幕越界率、节奏密度和人工改动量，而不只靠“看起来高级”的主观描述。
6. 所有原创生成素材都记录生成器、模型/服务版本、时间、输入摘要和授权状态；无法确认权利时不进入商用导出。

