# 中转说明（公司/办公室内网畅听版）

网站已默认使用公共中转 `https://disablecdnblock.qingtian6325.workers.dev/`，点开链接直接就能听，不用填任何配置，公司网络也一样。

中转在服务端取回音乐数据和音频并流式转发（含 Range，点歌秒播、支持拖动进度条，且突破了公司内网对部分国内音乐 CDN 与 YouTube 域名的封锁）。

## 新增 YouTube 跨域搜索支持

仓库内最新版 `worker.js` 新增了：
- `/yt-search?q=<关键词>`：通过服务端代理调用 YouTube 搜索接口，公司网络不翻墙也能搜索全网 YouTube 歌曲与视频！
- `/yt-info?id=<视频ID>`：解析 YouTube 单曲详情，自动提取封面、歌名与歌手。
- `/img?src=<封面直链>`：透传 YouTube (`*.ytimg.com`) 与网易云封面，保证在公司内网封面也能正常加载显示。

## 部署 / 更新 Worker 步骤（如需使用自己的 Worker）

1. 打开 https://dash.cloudflare.com/sign-up 登录 Cloudflare 账号（免费）。
2. 左侧菜单进入 **Workers & Pages**，找到你之前部署的 Worker（或点击 **Create** 新建一个）。
3. 点击 **Edit code**（编辑代码），把编辑器里的内容**全部删除**。
4. 把本仓库最新的 `worker.js` 代码全部复制并粘贴进去。
5. 点击右上角 **Save and deploy**（保存并部署），等待部署成功。
6. 回到播放器网页，点击右上角设置 ⚙️，在 Worker 中转地址输入框粘贴你的 Worker 地址，测试连接成功后保存即可生效。

## 说明

- 中转只在服务端按需流式转发请求，不储存用户任何数据。
- Cloudflare 免费版每日 10 万次请求额度，个人听歌使用完全充裕。
- 如果公司的 DNS 屏蔽了 `workers.dev` 域名后缀，可以在 Cloudflare 后台为该 Worker 绑定自己的自定义域名（Workers -> Settings -> Domains）。
