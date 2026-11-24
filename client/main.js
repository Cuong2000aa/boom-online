// 客户端主逻辑：连接、大厅/房间界面、角色选择、输入采集
// 协议消息类型与 server/protocol.js 保持一致

import { Renderer, drawItemIcon } from './render.js';
import { CHARACTERS, getChar, avatarCanvas, portraitCanvas, teamColor } from './characters.js';
import { applyLobbyTextures, drawMapThumb } from './lobby-art.js';
import { audio } from './audio.js';
import { LocalGameSession } from './local-engine.js';

applyLobbyTextures(); // 木纹外框贴图（代码绘制）

const $ = (id) => document.getElementById(id);
const views = {
  login: $('view-login'), lobby: $('view-lobby'), room: $('view-room'), game: $('view-game'),
};

const MAX_SLOTS = 6;
const ASSET_V = '?v=sr4'; // 素材版本串（与 render.js 同步）：整批换图时 +1，绕缓存

let currentView = 'login';
let ws = null;
let myId = null;
let myRoom = null;
let renderer = null;
let gameRunning = false;
let lastState = null; // 最近一帧快照（结算动画取胜者角色与统计用）
let lastStatePrev = null; // 上一帧快照（音效触发对比用）
let lastCd = null;    // 倒计时数字状态机（null=未开始/已隐藏）
let roster = new Map(); // 开局静态名册 id -> {name, char, isBot, colorIndex}（快照不再重复下发，合并用）
let dirs = []; // 当前按住的方向（按下顺序，服务端取最后一个）
let tileSize = 40; // 瓦片边长（gameStart 消息同步；放泡音效本地预检用）
let charGridBuilt = false;
let lobbyRooms = []; // 最近一次大厅房间快照（快速加入用）
let lobbyPage = 0;
const ROOMS_PER_PAGE = 6; // 经典大厅：2 列 × 3 行

let localSession = null;
let myName = 'Khò Khò';
let myChar = 'baobao';
let isLocalMode = false;

const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

// ---- 人物装扮（盛大官方道具库 GIF：大厅名片 + 房间进场动效） ----
// 素材取自盛大官网道具图标包（decor/）；按昵称哈希随机搭配，同一玩家观感固定

const DECOR_FLAGS = [ // 背景旗帜（头像底图）：12 生肖 + 4 个通用主题
  '12生肖之鼠', '12生肖之牛', '12生肖之虎', '12生肖之兔', '12生肖之龙', '12生肖之蛇',
  '12生肖之马', '12生肖之羊', '12生肖之猴', '12生肖之鸡', '12生肖之狗', '12生肖之猪',
  '烟花', '浪漫樱花', '年年有余', '火树银花',
];
const DECOR_MEDALS = [ // 勋章效果
  '勋章效果1', '勋章效果2', '勋章效果3', '勋章效果4',
  '勋章效果5', '勋章效果6', '勋章效果7', '勋章效果8',
];
const DECOR_ACCOUNTS = [ // 账号效果（名片背景）
  'bnb账号效果', '冰蓝风暴账号效果', '动感账号效果', '印染小碎花', '史莱姆账号效果',
  '图腾账号效果', '圣诞彩灯账号效果', '地狱之火账号效果', '幽幽雪账号效果', '幽蓝星星账号效果',
  '彩虹星账号效果', '探险家账号效果', '曲奇甜心账号效果', '果酸玛奇朵', '橙味糖糖账号效果',
  '海皇账号效果', '焦糖玛奇朵', '爱情单行道', '璀璨流星账号效果', '白云效果',
  '紫藤花语账号效果', '群星闪耀账号效果', '聚灵玄光账号效果', '英雄成长账号效果', '荣耀之王账号效果',
  '西瓜账号效果', '贼兔子账号效果', '金壁辉煌账号效果', '雪色圣诞账号效果', '霓虹效果',
];
const DECOR_ENTRANCES = [ // 进场效果（只保留多帧动画；单帧静态 gif 已剔除）
  'Only you', '噩梦', '天皇巨星', '天降财神', '巧克力漩涡', '幸福的预言',
  '庆祝音乐3', '心动繁星', '橘子汽水', '永恒的007', '电光火石', '花的华尔兹',
];
const decorUrl = (kind, name) => `/assets/decor/${kind}/${encodeURIComponent(name)}.gif`;
const hashOf = (s) => {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + (c.codePointAt(0) ?? 0)) >>> 0;
  return h;
};
const pickByHash = (arr, seed) => arr[seed % arr.length];

// 大厅左侧名片：给当前玩家随机一套“等级”装扮（旗帜/段位/勋章/账号名片 + 假等级）
function renderLobbyDecor(name) {
  const seed = hashOf(name || '?');
  const flag = pickByHash(DECOR_FLAGS, seed);
  const medal = pickByHash(DECOR_MEDALS, seed >>> 5);
  const account = pickByHash(DECOR_ACCOUNTS, seed >>> 7);
  const flagImg = $('me-flag');
  flagImg.classList.remove('loaded');
  flagImg.onload = () => flagImg.classList.add('loaded');
  flagImg.src = decorUrl('flag', flag);
  flagImg.title = flag;
  const medalImg = $('me-medal');
  medalImg.src = decorUrl('medal', medal);
  medalImg.title = `勋章 · ${medal}`;
  $('me-card-bg').src = decorUrl('account', account);
  $('me-card').title = `名片 · ${account}`;
}

// 房间进场动效：玩家刚出现时在其槽位上叠播官方进场 GIF（一小会儿）
const entranceUntil = new Map(); // playerId -> 动效截止时间戳
const queueEntrance = (id, ms = 2800) => entranceUntil.set(id, Date.now() + ms);

function entranceFxNode(id) {
  const until = entranceUntil.get(id);
  if (!until) return null;
  if (Date.now() >= until) {
    entranceUntil.delete(id);
    return null;
  }
  const fx = document.createElement('div');
  fx.className = 'fx-enter';
  const img = document.createElement('img');
  img.src = decorUrl('entrance', pickByHash(DECOR_ENTRANCES, hashOf(id)));
  img.alt = '';
  fx.appendChild(img);
  setTimeout(() => fx.remove(), until - Date.now());
  return fx;
}

function show(name) {
  currentView = name;
  sceneMusic(name);
  for (const [k, el] of Object.entries(views)) el.classList.toggle('hidden', k !== name);
}

function send(obj) {
  if (isLocalMode) {
    if (obj.t === 'input') localSession?.setInput(obj.dir);
    else if (obj.t === 'placeBomb') localSession?.placeBomb();
    else if (obj.t === 'useItem') localSession?.useItem();
    else if (obj.t === 'start') localSession?.start();
    else if (obj.t === 'createRoom' || obj.t === 'joinRoom') localSession?.openRoom();
    else if (obj.t === 'selectChar') {
      myChar = obj.char;
      localSession?.selectChar(obj.char);
    }
    else if (obj.t === 'leaveRoom') localSession?.leaveRoom();
    else if (obj.t === 'chat') localSession?.chat(obj.text);
    return;
  }
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function enableLocalMode() {
  if (isLocalMode) return;
  isLocalMode = true;
  myId = 'p1';
  localSession = new LocalGameSession(myName, myChar, route);
}

function startLocalGame() {
  enableLocalMode();
  localSession.playerName = myName;
  localSession.playerChar = myChar;
  localSession.start();
}

// 同步移动输入：发给服务器
function sendInput() {
  send({ t: 'input', dir: dirs });
}

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 2500);
}

function connect() {
  try {
    const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    ws = new WebSocket(proto + location.host);
    ws.onmessage = (e) => route(JSON.parse(e.data));
    ws.onerror = () => enableLocalMode();
    ws.onclose = () => enableLocalMode();
  } catch {
    enableLocalMode();
  }
}

function route(msg) {
  switch (msg.t) {
    case 'welcome':
      myId = msg.id;
      $('lobby-name').textContent = msg.name;
      renderLobbyDecor(msg.name);
      show('lobby');
      break;
    case 'lobby':
      renderRoomList(msg.rooms);
      if (currentView === 'room') show('lobby'); // 离开房间后回到大厅
      break;
    case 'room':
      myRoom = msg.room;
      // 结算画面展示期间不抢视图（3 秒后 exitResults 自动回房间）
      if (!gameRunning && $('overlay').classList.contains('hidden')) {
        renderRoom(msg.room);
        show('room');
      }
      break;
    case 'gameStart':
      gameRunning = true;
      lastState = null;
      lastStatePrev = null;
      lastCd = null;
      tileSize = msg.tileSize;
      roster = new Map(msg.players.map((p) => [p.id, p]));
      ensureBgm(); // 背景乐（若浏览器因自动播放策略拦截，下一次点击时补播）
      $('countdown').classList.remove('cd-pop', 'cd-go');
      $('countdown').classList.add('hidden');
      buildLegend();
      clearTimeout(resultsTimer); // 新局开始：取消结算画面的自动退出
      $('overlay').classList.add('hidden');
      renderer?.stop();
      renderer = new Renderer($('game-canvas'));
      renderer.init(msg);
      renderer.start();
      show('game');
      break;
    case 'state':
      for (const p of msg.players) Object.assign(p, roster.get(p.id)); // 补上静态名册字段
      lastState = msg;
      window.__dbgState = msg; // 调试/自动化验证用：最新快照
      if (renderer) {
        renderer.pushState(msg);
        updateHud(msg);
        updateCountdown(msg);
        if (!msg.warmup) sfxState(msg);
      }
      break;
    case 'gameOver': {
      gameRunning = false;
      dirs = [];
      showResults(msg);
      // 结算配音：胜利语音 / 失败 lose.wav / 平局
      sfx(msg.winnerId == null ? 'draw' : (msg.winnerId === myId ? 'snd/victory' : 'lose'), 0.7);
      break;
    }
    case 'chat':
      addChat(msg);
      break;
    case 'error': {
      const errMap = {
        '房间不存在': 'Phòng không tồn tại!',
        '该房间正在对战中': 'Phòng này đang trong trận đấu!',
        '房间已满': 'Phòng đã đủ người chơi!',
        '只有房主可以开始游戏': 'Chỉ chủ phòng mới có thể bắt đầu trận đấu!',
        '所有玩家准备后才能开始': 'Tất cả người chơi cần sẵn sàng mới có thể bắt đầu!',
      };
      toast(errMap[msg.msg] || msg.msg);
      break;
    }
    default:
      break;
  }
}

// ---- 音频统一由 client/audio.js 的 AudioManager 接管（单轨 BGM + 音效池 + 静音持久化） ----
// 这里只保留旧函数签名做委托，调用点无需改动：
//   sfx('explode') 音效；ensureBgm() 对局乐；sceneMusic(view) 场景切音乐（show() 自动调用）

function sfx(name, vol = 0.5) {
  audio.sfx(name, vol);
}

function ensureBgm() {
  audio.playScene('game'); // 海盗14 对局乐（若浏览器拦截自动播放，首次手势时 AudioManager 补播）
}

// 场景 → BGM 映射：大厅与房间共用大厅乐；登录页/对局各自曲目
function sceneMusic(view) {
  if (view === 'lobby' || view === 'room') audio.playScene('lobby');
  else if (view === 'game') audio.playScene('game');
  else if (view === 'login') audio.playScene('login');
}

// ---- 开局 321 大倒计时（屏幕中央，ending 时闪 GO!） ----

function setCountdownDigits(sec) {
  const el = $('countdown');
  el.innerHTML = '';
  for (const ch of String(sec)) {
    const img = document.createElement('img');
    img.src = `/assets/num/${ch}.png${ASSET_V}`;
    img.alt = ch;
    el.appendChild(img);
  }
}

function updateCountdown(msg) {
  const el = $('countdown');
  if (msg.warmup > 0) {
    const sec = Math.ceil(msg.warmup / 30); // 30 tick/s
    if (sec !== lastCd) {
      lastCd = sec;
      setCountdownDigits(sec);
      el.classList.remove('hidden', 'cd-pop', 'cd-go');
      void el.offsetWidth; // 强制 reflow 重播弹跳动画
      el.classList.add('cd-pop');
    }
    return;
  }
  if (lastCd !== null && lastCd !== 0) { // 倒计时刚结束 → GO!
    el.innerHTML = '<span>GO!</span>';
    el.classList.remove('cd-pop', 'cd-go');
    void el.offsetWidth;
    el.classList.add('cd-pop', 'cd-go');
    setTimeout(() => el.classList.add('hidden'), 900);
    sfx('start', 0.6);
  } else if (lastCd === null) {
    el.classList.add('hidden');
  }
  lastCd = 0;
}

// 对局事件音效：爆炸/死亡/拾取 通过与上一帧快照对比触发
function sfxState(msg) {
  const prev = lastStatePrev;
  if (msg.expl?.length > (prev?.expl?.length ?? 0)) sfx('explode', 0.5);
  if (prev) {
    const aliveBefore = prev.players.filter((p) => p.alive).length;
    if (msg.players.filter((p) => p.alive).length < aliveBefore) sfx('snd/role_die.mp3', 0.55); // 水泡破裂
    const mePrev = prev.players.find((p) => p.id === myId);
    const meNow = msg.players.find((p) => p.id === myId);
    if (mePrev && meNow && meNow.alive) {
      const gained = meNow.maxBombs > mePrev.maxBombs || meNow.range > mePrev.range
        || meNow.speed > mePrev.speed || meNow.inv.needle > mePrev.inv.needle
        || meNow.inv.remote > mePrev.inv.remote || (!mePrev.mount && meNow.mount)
        || (!mePrev.kick && meNow.kick);
      if (gained) sfx('get', 0.5);
      // 脱困（自救/被救）配音
      if (mePrev.trapped && !meNow.trapped) sfx('save', 0.6);
    }
  }
  lastStatePrev = msg;
}

// ---- 结算动画：胜者立绘 + 彩带 + 对局统计 ----

function showResults(msg) {
  const isDraw = msg.winnerId == null;
  const isWin = msg.winnerId === myId;
  // Hình thông báo thắng/hòa/thua
  const fx = $('overlay-effect');
  fx.innerHTML = '';
  const img = document.createElement('img');
  img.className = 'fx-img';
  img.src = `${isDraw ? '/assets/pic/Draw.png' : isWin ? '/assets/pic/Win.png' : '/assets/pic/lose.png'}${ASSET_V}`;
  img.alt = isDraw ? 'Hòa' : isWin ? 'Chiến Thắng' : 'Thất Bại';
  fx.appendChild(img);
  const avatarBox = $('overlay-avatar');
  avatarBox.innerHTML = '';
  const stats = $('overlay-stats');
  stats.textContent = '';
  if (isDraw) {
    $('overlay-text').textContent = 'Hòa trận!';
  } else {
    $('overlay-text').textContent = isWin ? 'Bạn đã chiến thắng! 🎉' : `「${msg.winnerName}」đã chiến thắng!`;
    const winner = lastState?.players.find((p) => p.id === msg.winnerId);
    if (winner) avatarBox.appendChild(portraitCanvas(winner.char, 96, winner.colorIndex));
  }
  if (lastState) {
    const alive = lastState.players.filter((p) => p.alive).length;
    const used = Math.max(0, 180 - (lastState.timeLeft ?? 180));
    const clock = `${Math.floor(used / 60)}:${String(used % 60).padStart(2, '0')}`;
    stats.textContent = `Thời gian trận đấu: ${clock} · Sống sót: ${alive}/${lastState.players.length}`;
  }
  spawnConfetti(isWin); // Chỉ thắng mới bắn pháo hoa
  $('overlay').classList.remove('hidden');
  // Dừng lại 3s rồi tự động quay về phòng
  clearTimeout(resultsTimer);
  resultsTimer = setTimeout(exitResults, 3000);
}

// Thoát bảng kết quả: Quay về phòng chờ trận tiếp theo
function exitResults() {
  clearTimeout(resultsTimer);
  resultsTimer = 0;
  $('overlay').classList.add('hidden');
  if (isLocalMode) {
    show('lobby');
  } else if (myRoom) {
    renderRoom(myRoom);
    show('room');
  }
}
let resultsTimer = 0;

function spawnConfetti(celebrate) {
  const box = $('overlay-confetti');
  box.innerHTML = '';
  if (!celebrate) return;
  const colors = ['#f59e0b', '#38bdf8', '#22c55e', '#ef4444', '#a78bfa', '#facc15'];
  for (let i = 0; i < 40; i++) {
    const s = document.createElement('span');
    s.style.left = `${Math.random() * 100}%`;
    s.style.background = colors[i % colors.length];
    s.style.animationDelay = `${Math.random() * 0.9}s`;
    s.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
    box.appendChild(s);
  }
}

function renderRoomList(rooms) {
  lobbyRooms = rooms;
  const pages = Math.max(1, Math.ceil(rooms.length / ROOMS_PER_PAGE));
  lobbyPage = Math.min(lobbyPage, pages - 1);
  const slice = rooms.slice(lobbyPage * ROOMS_PER_PAGE, (lobbyPage + 1) * ROOMS_PER_PAGE);

  const ul = $('room-list');
  ul.innerHTML = '';
  for (const r of slice) {
    const closed = r.inGame || r.players >= r.max;
    const li = document.createElement('li');
    li.className = `ldb-room${closed ? ' closed' : ''}`;
    li.title = closed ? (r.inGame ? 'Phòng này đang trong trận đấu' : 'Phòng đã đủ người') : 'Nhấp để vào phòng';

    const thumb = document.createElement('div');
    thumb.className = 'ldb-room-thumb';
    const cv = document.createElement('canvas');
    cv.width = 240;
    cv.height = 208;
    thumb.appendChild(cv);
    drawMapThumb(cv);

    const info = document.createElement('div');
    info.className = 'ldb-room-info';
    const name = document.createElement('div');
    name.className = 'ldb-room-name';
    name.textContent = r.name;
    const mapTag = document.createElement('div');
    mapTag.className = 'ldb-room-map';
    mapTag.textContent = 'Bản đồ: Cướp Biển 14';
    const meta = document.createElement('div');
    meta.className = 'ldb-room-meta';
    const status = document.createElement('span');
    status.className = `ldb-room-status ${r.inGame ? 'playing' : 'waiting'}`;
    status.textContent = r.inGame ? 'Đang đấu' : 'Có thể vào';
    const count = document.createElement('span');
    count.className = 'ldb-room-count';
    count.textContent = `${r.players}/${r.max}`;
    meta.append(status, count);
    info.append(name, mapTag, meta);
    li.append(thumb, info);

    if (!closed) li.onclick = () => send({ t: 'joinRoom', roomId: r.id });
    ul.appendChild(li);
  }
  for (let i = slice.length; i < ROOMS_PER_PAGE; i++) {
    const li = document.createElement('li');
    li.className = 'ldb-room empty';
    li.textContent = 'Trống (Chưa có phòng)';
    ul.appendChild(li);
  }

  $('page-info').textContent = `- ${lobbyPage + 1} -`;
  $('btn-page-prev').disabled = lobbyPage <= 0;
  $('btn-page-next').disabled = lobbyPage >= pages - 1;
}

// Vào nhanh: Vào phòng đầu tiên còn chỗ trống
function quickJoin() {
  if (isLocalMode || !ws || ws.readyState !== 1) {
    startLocalGame();
    return;
  }
  const target = lobbyRooms.find((r) => !r.inGame && r.players < r.max);
  if (target) send({ t: 'joinRoom', roomId: target.id });
  else toast('Hiện chưa có phòng nào trống, hãy nhấn「Luyện Tập」để mở ván mới nhé!');
}

// Chế độ Luyện tập: Tự tạo phòng và bắt đầu ngay (tự bù Máy Bot cho đủ 6 người)
function practice() {
  if (isLocalMode || !ws || ws.readyState !== 1) {
    startLocalGame();
    return;
  }
  send({ t: 'createRoom' });
  send({ t: 'start' });
}

// ---- 房间页（仿盛大经典房间：左槽位+聊天，右角色/颜色/地图/开始按钮） ----

// 盛大经典名册 8 名：仅 宝宝/小海盗 有原版立绘、开放可选，其余置灰锁定（灰剪影代码绘制）
const CHAR_ROSTER = ['xiaoguai', 'baobao', 'pangniu', 'lanmei', 'pidan', 'yangcong', 'haidao', 'emo'];
const ROSTER_NAMES = {
  xiaoguai: 'Bé Bỏng', pangniu: 'Nhanh Nhảu', lanmei: 'Lam Muội', pidan: 'Khè Khè', yangcong: 'Mắt Xanh', emo: 'Tiểu Ác Ma',
};
const isCharOpen = (id) => CHARACTERS.some((c) => c.id === id);
const charDisplayName = (id) => CHARACTERS.find((c) => c.id === id)?.name ?? ROSTER_NAMES[id];

let roomChatRoomId = null;  // 当前聊天日志归属的房间（换房时清空）
let prevPlayers = new Map(); // 上一次房间内的真人 id -> name（进出房系统提示用）

// 未开放角色的灰色剪影（无立绘素材，代码绘制）
function silhouetteCanvas(size = 44) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const body = g.createLinearGradient(0, size * 0.1, 0, size);
  body.addColorStop(0, '#9db4c8');
  body.addColorStop(1, '#5f7688');
  g.fillStyle = body;
  g.beginPath(); // 头
  g.arc(size / 2, size * 0.34, size * 0.21, 0, Math.PI * 2);
  g.fill();
  g.beginPath(); // 圆肩身体
  g.ellipse(size / 2, size * 0.86, size * 0.3, size * 0.34, 0, Math.PI, 0);
  g.fill();
  return cv;
}

function renderRoom(room) {
  if (roomChatRoomId !== room.id) { // 换了房间：清空聊天区重来
    roomChatRoomId = room.id;
    prevPlayers = new Map();
    entranceUntil.clear();
    $('chat-log').innerHTML = '';
    chatSys(`Chào mừng bạn đến với「${room.name}」`);
    for (const p of room.players) if (!p.isBot) queueEntrance(p.id); // 进场动效：满房成员齐亮相
  }
  $('room-title').textContent = room.name;
  $('room-count').textContent = `${room.players.length}/${MAX_SLOTS}`;
  // Thông báo người chơi vào/ra phòng
  const humans = new Map(room.players.filter((p) => !p.isBot).map((p) => [p.id, p.name]));
  if (prevPlayers.size) {
    for (const [id, name] of humans) {
      if (!prevPlayers.has(id)) {
        chatSys(`${name} đã vào phòng`);
        queueEntrance(id);
      }
    }
    for (const [id, name] of prevPlayers) if (!humans.has(id)) chatSys(`${name} đã rời phòng`);
  }
  prevPlayers = humans;
  renderSlots(room);
  buildCharGrid(room);
  renderMyChar(room);
  renderColors(room);
  drawMapThumb($('room-map-thumb'));
  renderActions(room);
}

// 玩家槽位 3×2：立绘头像 + 昵称条 + 状态条（房主/已准备/未准备/Bot）
function renderSlots(room) {
  const grid = $('slots-grid');
  grid.innerHTML = '';
  for (let i = 0; i < MAX_SLOTS; i++) {
    const p = room.players[i];
    const slot = document.createElement('div');
    if (!p) {
      slot.className = 'slot empty';
      slot.innerHTML = '<div class="slot-pad"><span class="slot-wait">Vị trí trống</span></div>'
        + '<div class="slot-state">Chờ người chơi</div>';
    } else {
      const isHost = p.id === room.hostId;
      slot.className = `slot${p.id === myId ? ' me' : ''}`;
      slot.style.setProperty('--tc', teamColor(p.colorIndex));
      const pad = document.createElement('div');
      pad.className = 'slot-pad';
      pad.appendChild(avatarCanvas(p.char, 80, p.colorIndex));
      const name = document.createElement('div');
      name.className = 'slot-name';
      name.textContent = p.name + (p.id === myId ? ' (Tôi)' : '');
      const state = document.createElement('div');
      const kind = isHost ? 'host' : p.isBot ? 'bot' : p.ready ? 'ready' : 'idle';
      state.className = `slot-state ${kind}`;
      state.textContent = isHost ? 'Chủ phòng' : p.isBot ? 'MÁY' : p.ready ? 'Đã sẵn sàng' : 'Chưa sẵn sàng';
      slot.append(pad, name, state);
      const fx = entranceFxNode(p.id);
      if (fx) slot.appendChild(fx);
    }
    grid.appendChild(slot);
  }
}

// 角色名册 4×2（只建一次，之后只更新选中态；锁定角色不可点）
function buildCharGrid(room) {
  const grid = $('char-grid');
  if (!charGridBuilt) {
    charGridBuilt = true;
    CHAR_ROSTER.forEach((id) => {
      const open = isCharOpen(id);
      const card = document.createElement('div');
      card.className = `char-card${open ? '' : ' locked'}`;
      card.dataset.char = id;
      card.title = open ? `Chọn「${charDisplayName(id)}」` : `「${charDisplayName(id)}」chưa mở`;
      if (open) card.onclick = () => send({ t: 'selectChar', char: id });
      const pad = document.createElement('div');
      pad.className = 'char-pad';
      pad.appendChild(open ? portraitCanvas(id, 52, 0) : silhouetteCanvas(52));
      const name = document.createElement('div');
      name.className = 'char-name';
      name.textContent = charDisplayName(id);
      card.append(pad, name);
      grid.appendChild(card);
    });
  }
  const me = room.players.find((p) => p.id === myId);
  for (const card of grid.children) {
    card.classList.toggle('selected', card.dataset.char === me?.char);
  }
}

// 当前角色横幅：立绘 + 角色名 + 初始能力条
function renderMyChar(room) {
  const me = room.players.find((p) => p.id === myId);
  if (!me) return;
  const ch = getChar(me.char);
  const box = $('mychar-portrait');
  box.innerHTML = '';
  box.style.setProperty('--tc', teamColor(me.colorIndex));
  box.appendChild(portraitCanvas(me.char, 96, me.colorIndex));
  $('mychar-name').textContent = ch.name;
  $('mychar-desc').textContent = `${ch.desc} · Chỉ số cơ bản`;
  const stats = [
    ['Tốc độ', ch.speed / 48],
    ['Uy lực', ch.range],
    ['Số bóng', ch.bombs],
  ];
  $('mychar-stats').innerHTML = stats.map(([k, v]) => `
    <div class="mstat"><span>${k}</span><span class="mbar"><i style="width:${Math.min(v / 5, 1) * 100}%"></i></span></div>`).join('');
}

// 队伍颜色：按进房 slot 顺序自动分配，高亮自己的颜色
function renderColors(room) {
  const me = room.players.find((p) => p.id === myId);
  const mine = ((me?.colorIndex ?? 0) % 6 + 6) % 6;
  const row = $('color-row');
  row.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const chip = document.createElement('span');
    chip.className = `cchip${i === mine ? ' mine' : ''}`;
    chip.style.setProperty('--c', teamColor(i));
    chip.title = i === mine ? 'Màu đội của tôi' : '';
    if (i === mine) chip.textContent = '✓';
    row.appendChild(chip);
  }
}

// 聊天日志（最多留 60 行，自动滚到底）
function appendChatLine(line) {
  const log = $('chat-log');
  log.appendChild(line);
  while (log.children.length > 60) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}

function chatSys(text) {
  const el = document.createElement('div');
  el.className = 'chat-line sys';
  el.textContent = text;
  appendChatLine(el);
}

function addChat({ id, name, text, colorIndex }) {
  const line = document.createElement('div');
  line.className = 'chat-line';
  const who = document.createElement('span');
  who.className = 'chat-name';
  who.style.color = teamColor(colorIndex);
  who.textContent = name + (id === myId ? ' (Tôi)' : '');
  const body = document.createElement('span');
  body.textContent = text;
  line.append(who, body);
  appendChatLine(line);
}

function sendChat() {
  const input = $('chat-input');
  const text = input.value.trim();
  if (!text) return;
  send({ t: 'chat', text });
  input.value = '';
  input.focus();
}

function renderActions(room) {
  const isHost = room.hostId === myId;
  $('btn-start').classList.toggle('hidden', !isHost);
  $('btn-ready').classList.toggle('hidden', isHost);
  const hint = $('start-hint');
  if (isHost) {
    const others = room.players.filter((p) => !p.isBot && p.id !== myId);
    const allReady = others.every((p) => p.ready);
    $('btn-start').disabled = !allReady;
    hint.textContent = allReady
      ? 'Bấm Bắt đầu · Tự động thêm Máy (Bot) nếu thiếu người'
      : 'Đang đợi tất cả người chơi sẵn sàng...';
  } else {
    const me = room.players.find((p) => p.id === myId);
    const btn = $('btn-ready');
    btn.textContent = me?.ready ? 'HỦY SẴN SÀNG' : 'SẴN SÀNG';
    btn.classList.toggle('green', !me?.ready);
    btn.classList.toggle('blue', !!me?.ready);
    hint.textContent = me?.ready ? 'Đã sẵn sàng, chờ chủ phòng bắt đầu' : 'Bấm sẵn sàng để chủ phòng bắt đầu trận';
  }
}

const MOUNT_NAMES = { turtle: 'Rùa Xanh', owl: 'Cú Mèo', pirateTurtle: 'Rùa Siêu Tốc', ufo: 'Đĩa Bay UFO' };

// ---- Bảng danh sách người chơi bên phải ----

function renderPlayerList(state) {
  const box = $('player-list');
  box.innerHTML = '';
  for (const p of state.players) {
    const row = document.createElement('div');
    row.className = `player-row${p.alive ? '' : ' dead'}${p.id === myId ? ' me' : ''}`;
    row.style.setProperty('--tc', teamColor(p.colorIndex));
    row.appendChild(avatarCanvas(p.char, 36, p.colorIndex));
    const info = document.createElement('div');
    const status = !p.alive ? 'Tử trận' : (p.trapped ? 'Bị sặc nước' : 'Còn sống');
    const extras = [];
    if (p.mount) extras.push(MOUNT_NAMES[p.mount] ?? p.mount);
    if (p.kick) extras.push('Đá bóng');
    if (p.inv.needle > 0) extras.push(`Kim×${p.inv.needle}`);
    if (p.inv.remote > 0) extras.push(`Điều khiển×${p.inv.remote}`);
    info.innerHTML = `<div class="player-name" style="color:${teamColor(p.colorIndex)}">${escapeHtml(p.name)}${p.id === myId ? ' (Tôi)' : ''}`
      + `${p.isBot ? ' <span class="badge bot">Máy</span>' : ''}</div>`
      + `<div class="player-sub">${getChar(p.char).name} · ${status}${extras.length ? ' · ' + extras.join(' ') : ''}</div>`;
    row.appendChild(info);
    box.appendChild(row);
  }
}

setInterval(() => {
  if (gameRunning && lastState) renderPlayerList(lastState);
}, 500);

// Bảng giải thích vật phẩm
function buildLegend() {
  const box = $('item-legend');
  if (box.dataset.built) return;
  box.dataset.built = '1';
  const ITEMS = [
    ['bubble', 'Bóng nước +1'], ['potion', 'Uy lực +1'], ['shoe', 'Tốc độ +24'],
    ['gremlin', 'Uy lực tối đa'], ['devil', 'Tốc độ tối đa'],
    ['kick', 'Đá bóng nước'], ['needle', 'Kim · Tự cứu khi bị bọc'], ['remote', 'Bóng điều khiển'],
  ];
  for (const [kind, label] of ITEMS) {
    const item = document.createElement('div');
    item.className = 'legend-item';
    const cv = document.createElement('canvas');
    cv.width = 24;
    cv.height = 24;
    drawItemIcon(cv.getContext('2d'), kind, 12, 12, 0);
    const span = document.createElement('span');
    span.textContent = label;
    item.append(cv, span);
    box.appendChild(item);
  }
}

function updateHud(msg) {
  const me = msg.players.find((p) => p.id === myId);
  const alive = msg.players.filter((p) => p.alive).length;
  if (!me) {
    $('hud').textContent = '';
    return;
  }
  const tl = msg.timeLeft ?? 0;
  const clock = `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`;
  const inv = ` · Kim×${me.inv.needle} Điều khiển×${me.inv.remote}`
    + (me.mount ? ` · Thú cưỡi: ${MOUNT_NAMES[me.mount] ?? me.mount}` : '')
    + (me.kick ? ' · Đá bóng' : '');
  // Gợi ý phím bấm động
  const tips = [];
  if (msg.bombs.some((b) => b.remote && b.owner === myId)) tips.push('Space kích nổ từ xa');
  else if (me.inv.remote > 0) tips.push('Ctrl đặt bóng điều khiển');
  if (me.inv.needle > 0) tips.push('Bị bọc bóng: Nhấn Ctrl tự cứu');
  $('hud').textContent = `⏱ ${clock} · ${getChar(me.char).name} · Còn sống ${alive}/${msg.players.length}`
    + ` · Số bóng: ${me.maxBombs} · Uy lực: ${me.range} · Tốc độ: ${me.speed}${inv}`
    + (tips.length ? ` · ${tips.join(' · ')}` : '');
}

// ---- 按钮事件 ----

function doLogin() {
  const name = $('name-input').value.trim() || 'Khò Khò';
  myName = name;
  if (!ws || ws.readyState !== 1) {
    enableLocalMode();
    localSession.playerName = myName;
    route({ t: 'welcome', id: 'p1', name: myName });
    route({
      t: 'lobby',
      rooms: [
        { id: 'room-practice', name: 'Phòng Luyện Tập (5 Máy)', players: 1, max: 6, inGame: false }
      ]
    });
    return;
  }
  send({ t: 'hello', name });
}

$('btn-login').onclick = doLogin;
$('name-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doLogin();
});
$('btn-create').onclick = () => {
  if (isLocalMode || !ws || ws.readyState !== 1) {
    enableLocalMode();
    localSession.openRoom();
    return;
  }
  send({ t: 'createRoom' });
};
$('btn-quick').onclick = quickJoin;
$('btn-practice').onclick = practice;
$('btn-help').onclick = () => $('lobby-help').classList.toggle('hidden');
$('btn-page-prev').onclick = () => { lobbyPage = Math.max(0, lobbyPage - 1); renderRoomList(lobbyRooms); };
$('btn-page-next').onclick = () => { lobbyPage += 1; renderRoomList(lobbyRooms); };
$('btn-ready').onclick = () => {
  const me = myRoom?.players.find((p) => p.id === myId);
  send({ t: 'ready', ready: !me?.ready });
};
$('btn-start').onclick = () => send({ t: 'start' });
$('btn-leave').onclick = () => send({ t: 'leaveRoom' });
$('btn-chat-send').onclick = sendChat;
$('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat();
});
$('btn-back').onclick = exitResults; // 提前退出结算画面（否则 3 秒后自动退出）

// ---- 键盘输入（仅游戏进行中捕获） ----

// 放泡音效的本地预检（与 server placeBomb 判定对齐）：活着、未被泡困、本格无泡、未达水泡
// 上限时才真会放下；有遥控泡在场时空格其实是引爆，不放音效
function canPlaceBombNow() {
  const s = lastState;
  if (!s || s.warmup) return false;
  const me = s.players.find((p) => p.id === myId);
  if (!me || !me.alive || me.trapped) return false;
  if (s.bombs.some((b) => b.remote && b.owner === myId)) return false;
  const tx = Math.floor(me.x / tileSize);
  const ty = Math.floor(me.y / tileSize);
  if (s.bombs.some((b) => b.x === tx && b.y === ty)) return false;
  return s.bombs.filter((b) => b.owner === myId).length < me.maxBombs;
}

window.addEventListener('keydown', (e) => {
  if (!gameRunning) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) {
      send({ t: 'placeBomb' });
      if (canPlaceBombNow()) sfx('snd/放置泡泡_bomb_set.mp3', 0.45); // 放不出泡（已达上限等）时静默
    }
    return;
  }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight'
    || e.code === 'ControlLeft' || e.code === 'ControlRight') { // 使用主动道具（Ctrl 对齐盛大版）
    if (!e.repeat) send({ t: 'useItem' });
    return;
  }
  const d = KEYMAP[e.code];
  if (!d) return;
  e.preventDefault();
  if (!dirs.includes(d)) {
    dirs.push(d);
    sendInput();
  }
});

window.addEventListener('keyup', (e) => {
  const d = KEYMAP[e.code];
  if (!d) return;
  const i = dirs.indexOf(d);
  if (i >= 0) {
    dirs.splice(i, 1);
    if (gameRunning) sendInput();
  }
});

window.addEventListener('blur', () => {
  dirs = [];
  if (gameRunning) sendInput();
});

// ---- Xử lý điều khiển cảm ứng cho Mobile / Tablet ----
function setupMobileControls() {
  const dpadBtns = document.querySelectorAll('.m-dpad .m-btn');
  dpadBtns.forEach((btn) => {
    const dir = btn.dataset.dir;
    const startMove = (e) => {
      e.preventDefault();
      if (!gameRunning) return;
      if (!dirs.includes(dir)) {
        dirs.push(dir);
        sendInput();
      }
      btn.classList.add('active');
    };
    const endMove = (e) => {
      e.preventDefault();
      const idx = dirs.indexOf(dir);
      if (idx >= 0) {
        dirs.splice(idx, 1);
        if (gameRunning) sendInput();
      }
      btn.classList.remove('active');
    };
    btn.addEventListener('touchstart', startMove, { passive: false });
    btn.addEventListener('touchend', endMove, { passive: false });
    btn.addEventListener('touchcancel', endMove, { passive: false });
    btn.addEventListener('mousedown', startMove);
    btn.addEventListener('mouseup', endMove);
    btn.addEventListener('mouseleave', endMove);
  });

  const bombBtn = document.getElementById('btn-touch-bomb');
  if (bombBtn) {
    const triggerBomb = (e) => {
      e.preventDefault();
      if (!gameRunning) return;
      send({ t: 'placeBomb' });
      if (canPlaceBombNow()) sfx('snd/放置泡泡_bomb_set.mp3', 0.45);
      bombBtn.classList.add('active');
      setTimeout(() => bombBtn.classList.remove('active'), 120);
    };
    bombBtn.addEventListener('touchstart', triggerBomb, { passive: false });
    bombBtn.addEventListener('mousedown', triggerBomb);
  }

  const itemBtn = document.getElementById('btn-touch-item');
  if (itemBtn) {
    const triggerItem = (e) => {
      e.preventDefault();
      if (!gameRunning) return;
      send({ t: 'useItem' });
      itemBtn.classList.add('active');
      setTimeout(() => itemBtn.classList.remove('active'), 120);
    };
    itemBtn.addEventListener('touchstart', triggerItem, { passive: false });
    itemBtn.addEventListener('mousedown', triggerItem);
  }
}

setupMobileControls();

connect();
