# 夏乐（Sherum）普通模型

夏乐的角色资源名为 `Sherum`，使用普通立绘、Normal皮肤，Spine骨架版本4.1.08，共53个动作，贴图2048×1024。互动区域、行走控制、探头和任务动作由本项目独立适配；没有使用战斗模型或其他皮肤。

## 来源

- 资源站：[教主的旅途](https://journey.927927927.xyz/)。站内人物资料将“夏乐”映射至Sherum。
- 原始清单：[spine-manifest.json](https://journey.927927927.xyz/spine-manifest.json)，`generatedAt: 2026-09-14T03:25:08.967Z`，类别“正常使徒”，目录 `正常使徒/sherum`。
- 原始模型根目录：`https://assets.927927927.xyz/spine/%E6%AD%A3%E5%B8%B8%E4%BD%BF%E5%BE%92/sherum/`。
- 下载核对日期：2026-10-20。三个文件保持原始字节，通过SHA256核对；浏览器使用固定Git提交地址读取本仓库镜像。

| 文件 | 字节 | SHA256 |
| --- | ---: | --- |
| Sherum.skel.bytes | 1353982 | `9a838a28860c6b71da777459ada91b35420314c5a111b367685fc381d85317ae` |
| Sherum.atlas.txt | 7401 | `079fbd4cb3172067aee40c20691404cab5e1d7fbadcc120ae34b9b4109d36d6f` |
| Sherum.png | 1412855 | `d65c2c79e0d0de8a298161f55f79f65c055a2fdd48994c2b8ade0dbda1d7500e` |

## 运行与适配

使用外部固定版本 `@esotericsoftware/spine-webgl@4.1.56`，与咏春共用相同库资源缓存；实例各自持有私有命名空间，不替换宿主Spine。

支持摸头、薅脸回弹、挠痒、敲头、七种短点脸部反应、随机动作、四边探头和腿部迈步。任务工作使用Write_1/2/3，成功使用Happy_2/Happy_3/Dance_1，失败使用Panic_1/Sorry_1/Sad_3。任务结果由数据库状态驱动。

## 权利说明

本目录为游戏资源的来源记录与镜像，模型、角色和相关素材权利归EPIDGames、bilibili及相关权利人。该模型不适用本项目自有适配代码的MIT许可；Spine运行库适用其原有许可。镜像和适配不构成素材权利转让或重新许可。
