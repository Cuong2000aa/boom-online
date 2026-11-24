import { CHARACTERS, getChar, isValidChar, DEFAULT_CHAR } from './engine/characters.js?v=20261124_v3';
export { CHARACTERS, getChar, isValidChar, DEFAULT_CHAR };

// 6 Bộ màu đội (được chia theo thứ tự slot vào phòng)
export const TEAM_KEYS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
export const TEAM_COLORS = ['#e23b3b', '#2f7fe0', '#3fae4e', '#e0a92e', '#9b59d0', '#ef7a1a'];

export const teamKey = (colorIndex) => TEAM_KEYS[Math.abs(colorIndex ?? 0) % TEAM_KEYS.length];
export const teamColor = (colorIndex) => TEAM_COLORS[Math.abs(colorIndex ?? 0) % TEAM_COLORS.length];

// ---- Tải ảnh nhân vật (có cache) ----
const sprites = new Map(); // "char_team" -> {img, loaded}
const ASSET_V = '?v=20261124_v3';

export function charSprite(charId, colorIndex = 0) {
  const ch = getChar(charId);
  const key = `${ch.id}_${teamKey(colorIndex)}`;
  let rec = sprites.get(key);
  if (!rec) {
    rec = { img: new Image(), loaded: false };
    rec.img.onload = () => { rec.loaded = true; };
    if (ch.hasTeamVariants) {
      rec.img.src = `/assets/chars/${ch.id}_${teamKey(colorIndex)}.png${ASSET_V}`;
    } else {
      rec.img.src = `/assets/chars/${ch.sprite || ch.id}.png${ASSET_V}`;
    }
    sprites.set(key, rec);
  }
  return rec;
}

// Vẽ nhân vật trong trận đấu
export function drawCharacter(ctx, charId, colorIndex, cx, feetY, h, t = 0, shadow = true) {
  const rec = charSprite(charId, colorIndex);
  if (shadow) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
    ctx.beginPath();
    ctx.ellipse(cx, feetY - h * 0.02, h * 0.3, h * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (rec.loaded) {
    const w = (rec.img.width / rec.img.height) * h;
    if (t) {
      const step = Math.sin(t / 130);
      const bob = -Math.abs(step) * h * 0.045;
      ctx.save();
      ctx.translate(cx, feetY);
      ctx.rotate(step * 0.07);
      ctx.scale(1, 1 - Math.abs(step) * 0.04);
      ctx.drawImage(rec.img, -w / 2, -h + bob, w, h);
      ctx.restore();
      return;
    }
    ctx.drawImage(rec.img, cx - w / 2, feetY - h, w, h);
    return;
  }
  const bob = t ? Math.sin(t / 150) * h * 0.05 : 0;
  ctx.fillStyle = teamColor(colorIndex);
  ctx.beginPath();
  ctx.arc(cx, feetY - h * 0.45 + bob, h * 0.28, 0, Math.PI * 2);
  ctx.fill();
}

const HEAD_TOP = { haidao: 0.22, pidan: 0.06, congtou: 0.06, lanlan: 0.06, pangdun: 0.06 };

// Vẽ ảnh đại diện Avatar cho các slot trong phòng và danh sách người chơi
export function avatarCanvas(charId, size = 64, colorIndex = 0) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const ch = getChar(charId);
  const rec = charSprite(charId, colorIndex);

  const draw = () => {
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingQuality = 'high';
    const top = HEAD_TOP[ch.id] ?? 0;
    const scale = size / (rec.img.height * 0.62);
    const w = rec.img.width * scale;
    ctx.drawImage(rec.img, (size - w) / 2, -top * rec.img.height * scale, w, rec.img.height * scale);
  };

  if (rec.loaded) {
    draw();
  } else {
    rec.img.addEventListener('load', draw, { once: true });
  }
  return cv;
}

// Toàn thân nhân vật (cho thẻ chọn nhân vật và bảng kết quả)
export function portraitCanvas(charId, size = 72, colorIndex = 0) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const rec = charSprite(charId, colorIndex);
  const draw = () => {
    ctx.clearRect(0, 0, size, size);
    const h = size * 0.96;
    const w = (rec.img.width / rec.img.height) * h;
    ctx.drawImage(rec.img, (size - w) / 2, size - h, w, h);
  };
  if (rec.loaded) draw();
  else rec.img.addEventListener('load', draw, { once: true });
  return cv;
}
