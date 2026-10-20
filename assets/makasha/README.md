# 玛卡莎（Makasha）普通模型

使用玛卡莎普通立绘、Normal皮肤，Spine骨架4.1.08，共59个动作，贴图2048×1024；保留研钵、长杵、角和卷发。没有使用战斗模型或额外皮肤。

## 来源与校验

- 资源站：[教主的旅途](https://journey.927927927.xyz/)。站内人物资料将“玛卡莎”映射到Makasha。
- 原始清单：[spine-manifest.json](https://journey.927927927.xyz/spine-manifest.json)，`generatedAt: 2026-09-14T03:25:08.967Z`，类别“正常使徒”，目录 `正常使徒/makasha`。
- 原始模型根目录：`https://assets.927927927.xyz/spine/%E6%AD%A3%E5%B8%B8%E4%BD%BF%E5%BE%92/makasha/`。
- 下载核对日期：2026-10-20。三个文件保持原始字节，在浏览器中使用固定Git提交地址与SHA256核验。

| 文件 | 字节 | SHA256 |
| --- | ---: | --- |
| Makasha.skel.bytes | 2063331 | `f85a065ef7066fb2cd4569c2012bedf9190369eef4b704ceb6479e782805cb2a` |
| Makasha.atlas.txt | 12237 | `a7c3a08188c50b0eb518657f7323bb15ee69a7fd360acdc87f761ab7ef763ac6` |
| Makasha.png | 1785472 | `161cff1cd675686ca2bb1d895b6f4e95913f114c51a16dab7b26185ffc5c4ce3` |

## 适配

使用外部固定版本 `@esotericsoftware/spine-webgl@4.1.56`，与咏春、夏乐复用库资源缓存；实例各自持有私有命名空间，不替换宿主Spine。

支持摸头、薅脸回弹、挠痒、敲头、七种脸部短点反应、26种随机动作、四边探头和腿部IK迈步。工作时使用Thinking_1/2/3，成功时使用Happy_2/Happy_4/Dance_1，失败时使用Panic_1/Groggy_1/Sad_3；任务状态由数据库提供。

## 权利说明

本目录记录和镜像游戏资源；模型、角色及相关素材权利归EPIDGames、bilibili及相关权利人。游戏素材不适用本项目自有代码的MIT许可，Spine运行库适用其原许可；镜像与适配不构成素材权利转让或重新许可。
