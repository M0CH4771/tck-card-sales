// Public repository JSON updates independently of GitHub Pages rebuilds.
const base='https://raw.githubusercontent.com/M0CH4771/tck-card-sales/main/dist/';
export const syncConfig = {
  dataUrl: base+'data.json',
  catalogUrl: base+'catalog.json',
  statusUrl: base+'sync-status.json',
  scheduleLabel: '毎日0時開始予定（日本時間・GitHub Actions）',
};
