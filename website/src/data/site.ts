// 站点单一数据源：版本号、链接、产物名都从这里取，发版只改这一处。
export const SITE = {
  name: 'Z-Buddy',
  version: '0.1.0',
  date: '2026-09-06',
  title: 'Z-Buddy — ZCode 桌宠',
  description:
    '一只挂在桌面角落的 AI 编程伙伴：实时反映 ZCode 工作状态、点一下就暂停、宠物包即装即换。免费开源，仅 4.2 MB。',
  repo: 'https://github.com/learnerCodeZ/Z-Buddy',
  issues: 'https://github.com/learnerCodeZ/Z-Buddy/issues',
  releasesLatest: 'https://github.com/learnerCodeZ/Z-Buddy/releases/latest',
  releaseTag: 'https://github.com/learnerCodeZ/Z-Buddy/releases/tag/v0.1.0',
  // Release 产物命名（上传 Release 时保持一致）
  assets: {
    setup: 'Z-Buddy_0.1.0_x64-setup.exe',
    portable: 'Z-Buddy_0.1.0_portable.zip',
    sha256: 'SHA256SUMS.txt',
  },
};

export const releaseAsset = (file: string) =>
  `${SITE.repo}/releases/download/v${SITE.version}/${file}`;

export const withBase = (path: string) => {
  const base = import.meta.env.BASE_URL;
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
};
