// 官网配置：部署前只需要改这里。
window.SITE_CONFIG = {
  // GitHub 仓库，格式为 "用户名/仓库名"
  githubRepo: 'XiangXiaoYuan5254/MachineCabin',

  // 官网直链下载目录。默认和官网一起部署在 downloads/ 下，
  // 也可以换成 OSS / CDN 地址，例如 'https://cdn.example.com/machine-cabin/'
  downloadBase: 'downloads/',

  // downloads/latest.json 不存在时使用的默认版本信息。
  // 运行 ./script/package_dmg.sh 会自动生成 latest.json。
  fallback: {
    version: '1.1.0',
    file: 'MachineCabin-1.1.0.dmg',
    arch: 'arm64',
  },
};
