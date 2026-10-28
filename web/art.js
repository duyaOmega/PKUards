/** Generated oil paintings; originals stay outside Git, web delivery assets are small WebP. */
export const PAINTED_MOTIFS = ['tower','lake','library','food','math','lab','stars','robot','laptop','flight','stage','book','hike','law','debate','map','clock','radio','bike','notes'];
export function illustration(motif = 'book', faction = 'neutral') {
  const id = PAINTED_MOTIFS.includes(motif) ? motif : 'book';
  return `<img class="painted-art" src="./assets/art/${id}.webp" alt="" width="960" height="640" loading="lazy" decoding="async" draggable="false">`;
}
export function campusScene() {
  return '<img class="campus-painting" src="./assets/art/tower.webp" width="960" height="640" alt="油画中的未名湖、博雅塔和秋日校园" decoding="async" fetchpriority="high" draggable="false">';
}
