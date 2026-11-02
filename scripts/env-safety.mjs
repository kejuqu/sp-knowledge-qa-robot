export function assertDatabaseTarget(url){
 if(!url)throw new Error('DIRECT_DATABASE_URL is required');
 const local=['127.0.0.1','localhost','::1','[::1]'].includes(new URL(url).hostname);
 if(process.env.APP_ENV!=='production'&&!local)throw new Error('本地模式拒绝连接远程数据库。线上迁移必须显式设置 APP_ENV=production 并使用独立环境文件。');
}
