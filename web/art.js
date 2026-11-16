/** Generated paintings and woodcuts; only small WebP delivery assets are tracked. */
export const PAINTED_MOTIFS = ['tower','lake','library','food','math','lab','stars','robot','laptop','flight','stage','book','hike','law','debate','map','clock','radio','bike','notes','print-reader','print-math','print-coder','print-field','print-campus','print-librarian','print-cyclist','print-researcher','print-mechanic','print-restorer','print-editor','print-tower-warden','print-lake-student','print-projectionist','print-keeper','print-canteen','print-radio-host','print-morning-student','print-relay-runner','print-sprinter','print-graduate'];
export function illustration(motif = 'book', faction = 'neutral') {
  const id = PAINTED_MOTIFS.includes(motif) ? motif : 'book';
  return `<img class="painted-art" src="./assets/art/${id}.webp" alt="" width="960" height="640" loading="lazy" decoding="async" draggable="false">`;
}
export function campusScene() {
  return '<img class="campus-painting" src="./assets/art/print-campus.webp" width="960" height="640" alt="复古木刻中的未名湖、博雅塔和秋日校园" decoding="async" fetchpriority="high" draggable="false">';
}
