# 回天创作台 · HuiTian Creator Studio

面向个人创作者、新媒体和电商的 Windows 短视频工作台原型。把一个选题整理为创作蓝图、文案、分镜，再导出本地粗剪和剪映友好素材包。

A local-first Windows desktop prototype for briefs, scripts, storyboards and rough-cut exports.

**作者：侯禹良（[hyl88888888](https://github.com/hyl88888888)）**  
**联系电话：15234732550**

欢迎交流、反馈问题或参与改进。其他作品：[回天 AI](https://github.com/hyl88888888/huitian-ai)、[回天设计](https://github.com/hyl88888888/huitian-design)。

## 当前状态

这是 v0.3.0 历史原型的源码整理版，不代表已维护到当前所有云服务接口。离线基础创作、文案编辑及本地导出是主要用途；联网生成需要用户自行配置服务与访问密钥。原版文档保留在 `docs/README-20260803.md`，其中模型名称、服务可用性、功能说明和技术选型均是历史记录。尤其不要把历史视频接口的存在当作目前仍可调用的保证。

## 功能

- 从自然语言需求整理创作蓝图、逐句文案和分镜。
- 支持个人 IP、新媒体和电商三种创作流程。
- 提供本地基础引擎，以及可选的联网创作接口。
- 用本地 FFmpeg 生成竖屏粗剪、字幕和素材交付包。
- 保存创作项目、素材、品牌档案和有界偏好记忆。

## 开发

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm dev
```

构建前端与桌面入口使用 `pnpm build`。Windows 安装包命令为 `pnpm dist:win`。环境请以锁文件和项目依赖要求为准。

## 源码范围

本仓库包含应用源码、测试、构建配置、图标和说明文档。用户项目、访问密钥、客户素材、安装包、运行环境和模型权重保存在仓库之外。第三方依赖在安装时获取，使用其各自许可证。

## 许可证

本项目原创源码按 MIT 许可证发布，见 `LICENSE`。第三方依赖和 FFmpeg 的许可证独立适用，历史选型记录见 `docs/OPEN_SOURCE_STACK.md`。此源码包不包含 FFmpeg 二进制或 Windows 安装包。
