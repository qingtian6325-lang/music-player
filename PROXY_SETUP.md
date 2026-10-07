# 中转说明（公司网络可用）

网站已默认使用公共中转 `https://disablecdnblock.qingtian6325.workers.dev/`，
点开链接直接就能听，不用填任何东西，公司网络也一样。

中转在服务端取回音乐数据和音频并流式转发（含 Range，点歌秒播、可拖进度条）；
如果中转暂时不通，网站会自动降级用直链再试一次。

下面是当初部署这个 Worker 的步骤（备用，万一以后要换自己的）：

## 步骤

1. 打开 https://dash.cloudflare.com/sign-up 注册一个 Cloudflare 账号（免费），登录。
2. 左侧菜单进入 **Workers & Pages**，点 **Create**（创建）。
3. 选择 **Create Worker**（Hello World 模板即可），点 **Deploy** 先部署一次。
4. 点 **Edit code**（编辑代码），把编辑器里的内容**全部删除**，
   把本仓库 `worker.js` 的全部内容粘贴进去。
5. 点右上角 **Save and deploy**（保存并部署），等待部署成功。
6. 回到 Worker 页面，复制它的地址，形如：
   `https://music-proxy-xxx.workers.dev`
7. 打开音乐播放器，点右上角 ⚙️，把地址粘贴进去，点**测试连接**，
   显示"连接正常"后点**保存**。

## 说明

- 中转只转发你自己的请求，不存任何数据；地址只保存在你自己浏览器的 localStorage 里。
- Cloudflare 免费版每天 10 万次请求，个人听歌完全够用。
- 如果 `workers.dev` 域名也被公司墙了，可以在 Cloudflare 里绑定自己的域名（Workers -> Settings -> Domains）。
- 不想用了：在 ⚙️ 里点**清除**即恢复直连。
