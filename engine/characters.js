// Cấu hình nhân vật Boom Online
export const CHARACTERS = [
  {
    id: 'baobao', name: 'Khò Khò', desc: 'Thiên hướng Tốc độ',
    speed: 144, range: 1, bombs: 1,
    caps: { speed: 240, range: 7, bombs: 6 },
    hasTeamVariants: true,
  },
  {
    id: 'haidao', name: 'Hải Tặc', desc: 'Thiên hướng Uy lực',
    speed: 120, range: 2, bombs: 1,
    caps: { speed: 216, range: 7, bombs: 8 },
    hasTeamVariants: true,
  },
  {
    id: 'pidan', name: 'Khè Khè', desc: 'Cân bằng · Dễ chơi',
    speed: 130, range: 1, bombs: 2,
    caps: { speed: 226, range: 7, bombs: 7 },
    hasTeamVariants: false,
    sprite: 'pidan',
  },
  {
    id: 'congtou', name: 'Mắt Xanh', desc: 'Trí tuệ · Ôm bom',
    speed: 120, range: 1, bombs: 2,
    caps: { speed: 216, range: 6, bombs: 8 },
    hasTeamVariants: false,
    sprite: 'congtou',
  },
  {
    id: 'lanlan', name: 'Lam Muội', desc: 'Linh hoạt · Khéo léo',
    speed: 135, range: 1, bombs: 1,
    caps: { speed: 230, range: 7, bombs: 6 },
    hasTeamVariants: false,
    sprite: 'lanlan',
  },
  {
    id: 'pangdun', name: 'Nhanh Nhảu', desc: 'Dũng mãnh · Trâu bò',
    speed: 115, range: 2, bombs: 2,
    caps: { speed: 210, range: 8, bombs: 7 },
    hasTeamVariants: false,
    sprite: 'pangdun',
  },
];

export const DEFAULT_CHAR = 'baobao';

export function getChar(id) {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}

export function isValidChar(id) {
  return CHARACTERS.some((c) => c.id === id);
}
