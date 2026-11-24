import { Game, TILE, TICK_RATE } from './engine/game.js';
import { BotBrain } from './engine/bot.js';

export class LocalGameSession {
  constructor(playerName, playerChar, onMessage) {
    this.playerName = playerName || 'Khò Khò';
    this.playerChar = playerChar || 'baobao';
    this.onMessage = onMessage;
    this.game = null;
    this.brains = new Map();
    this.timer = null;
    this.myId = 'p1';
    this.mockRoom = null;
  }

  getBotsConfig() {
    return [
      { id: 'b1', name: 'Bé Bỏng (Máy)', isBot: true, char: 'haidao', colorIndex: 1, ready: true },
      { id: 'b2', name: 'Khè Khè (Máy)', isBot: true, char: 'baobao', colorIndex: 2, ready: true },
      { id: 'b3', name: 'Hải Tặc (Máy)', isBot: true, char: 'haidao', colorIndex: 3, ready: true },
      { id: 'b4', name: 'Mắt Xanh (Máy)', isBot: true, char: 'baobao', colorIndex: 4, ready: true },
      { id: 'b5', name: 'Nhanh Nhảu (Máy)', isBot: true, char: 'haidao', colorIndex: 5, ready: true },
    ];
  }

  openRoom() {
    this.mockRoom = {
      id: 'room-practice',
      name: `Phòng Luyện Tập (${this.playerName})`,
      hostId: this.myId,
      map: 'pirate14',
      players: [
        { id: this.myId, name: this.playerName, isBot: false, char: this.playerChar, colorIndex: 0, ready: true },
        ...this.getBotsConfig(),
      ],
    };
    this.onMessage({ t: 'room', room: this.mockRoom });
  }

  selectChar(char) {
    this.playerChar = char;
    if (this.mockRoom) {
      const me = this.mockRoom.players.find((p) => p.id === this.myId);
      if (me) me.char = char;
      this.onMessage({ t: 'room', room: this.mockRoom });
    }
  }

  leaveRoom() {
    this.mockRoom = null;
    this.onMessage({
      t: 'lobby',
      rooms: [
        { id: 'room-practice', name: 'Phòng Luyện Tập (5 Máy)', players: 1, max: 6, inGame: false }
      ],
    });
  }

  chat(text) {
    this.onMessage({
      t: 'chat',
      id: this.myId,
      name: this.playerName,
      text,
      colorIndex: 0,
    });
  }

  start() {
    const botsConfig = this.getBotsConfig();
    const players = [
      { id: this.myId, name: this.playerName, isBot: false, char: this.playerChar, colorIndex: 0 },
      ...botsConfig,
    ];

    this.game = new Game(
      players.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot, char: p.char })),
      { random: Math.random }
    );

    this.brains.clear();
    for (const p of botsConfig) {
      this.brains.set(p.id, new BotBrain(p.id));
    }

    // Gửi thông báo bắt đầu trận đấu
    this.onMessage({
      t: 'gameStart',
      map: this.game.gridRows(),
      tileSize: TILE,
      yourId: this.myId,
      players: players.map((p) => ({
        id: p.id,
        name: p.name,
        isBot: p.isBot,
        char: p.char,
        colorIndex: p.colorIndex,
      })),
    });

    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 1000 / TICK_RATE);
  }

  setInput(dirs) {
    if (this.game) this.game.setInput(this.myId, dirs);
  }

  placeBomb() {
    if (this.game) this.game.placeBomb(this.myId);
  }

  useItem() {
    if (this.game) this.game.useItem(this.myId);
  }

  tick() {
    if (!this.game) return;

    try {
      // AI của Bot tính toán nước đi
      for (const [botId, brain] of this.brains) {
        const p = this.game.players.get(botId);
        if (!p || !p.alive) continue;
        const act = brain.decide(this.game);
        this.game.setInput(botId, act.dirs);
        if (act.place) this.game.placeBomb(botId);
        if (act.use) this.game.useItem(botId);
      }

      this.game.tick();
    } catch (e) {
      console.error('Local tick error', e);
    }

    const snapshot = this.game.snapshot();
    this.onMessage({
      t: 'state',
      ...snapshot,
    });

    if (this.game.over) {
      clearInterval(this.timer);
      this.timer = null;
      const winner = this.game.winner;
      this.onMessage({
        t: 'gameOver',
        winnerId: winner?.id ?? null,
        winnerName: winner?.name ?? null,
      });
    }
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.game = null;
  }
}
