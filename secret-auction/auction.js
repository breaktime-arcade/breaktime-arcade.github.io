/* 100점 비밀 경매 · 쉬는시간 오락실 */
(() => {
  'use strict';

  const firebaseConfig = {
    apiKey: "AIzaSyAbb_dwxYre6gjKAR475FRlY2zrCjNljmw",
    authDomain: "brain-survival-7641e.firebaseapp.com",
    databaseURL: "https://brain-survival-7641e-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "brain-survival-7641e",
    storageBucket: "brain-survival-7641e.firebasestorage.app",
    messagingSenderId: "355144559680",
    appId: "1:355144559680:web:ec057fa79878888eeb03a5"
  };
  const sdkBase = 'https://www.gstatic.com/firebasejs/11.10.0/';
  const namespace = 'auctionV1';
  const rounds = 5;
  const bidTime = 17_000;
  const revealTime = 7_000;
  const span = bidTime + revealTime;
  const startingCash = 100;
  const slots = Array.from({ length: 8 }, (_, i) => String(i));
  const catalog = [
    ['🧭', '황동 나침반'], ['🪙', '행운의 동전'], ['🍵', '찻잔 세트'], ['🎟️', '옛날 영화표'],
    ['🪴', '미니 화분'], ['🧩', '나무 퍼즐'], ['🖋️', '은빛 만년필'], ['🎲', '수정 주사위'],
    ['🔔', '유리 종'], ['⏳', '모래시계'], ['📻', '복고 라디오'], ['📸', '필름 카메라'],
    ['🎻', '작은 바이올린'], ['🎞️', '영사기'], ['🕰️', '황금 태엽시계'], ['🔭', '별빛 망원경'],
    ['🏺', '푸른 도자기'], ['🎷', '빈티지 색소폰'], ['🎠', '회전목마 오르골'], ['🚂', '황금 모형기차'],
    ['🧸', '한정판 곰인형'], ['💎', '보랏빛 보석'], ['👑', '별빛 왕관'], ['🦜', '유리 앵무새']
  ];
  const lotPoints = [[12, 22, 34], [15, 24, 37], [16, 28, 40], [18, 30, 43], [20, 32, 46]];
  const namesA = ['말랑', '느긋한', '씩씩한', '졸린', '날쌘', '반짝이는', '배고픈', '용감한', '신나는', '행복한', '수줍은', '재빠른'];
  const namesB = ['판다', '수달', '토끼', '햄스터', '고양이', '치타', '여우', '다람쥐', '오리', '펭귄', '사슴', '코알라'];
  const codeChars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const publicRoom = 'ARCADE';
  const $ = (id) => document.getElementById(id);
  const clamp = (number, low, high) => Math.min(Math.max(number, low), high);
  const pick = (items) => items[Math.floor(Math.random() * items.length)];
  const randomNick = () => pick(namesA) + pick(namesB);

  function availableNick(seats) {
    const taken = new Set(toRoster(seats).map((person) => person.nick));
    let nick = randomNick();
    while (taken.has(nick)) nick = randomNick();
    return nick;
  }

  let view = 'home';
  let room = null;
  let match = null;
  let networkPromise;
  let online;
  let isConnected = false;
  let offset = 0;
  let busy = false;
  let soundOn = false;
  let soundContext;
  let pickedLot = null;
  let displayedRound = '';
  let lastStage = '';
  let playTick = 0;

  function buildRules() {
    const roomPath = `root.child('${namespace}/rooms/' + $room)`;
    const st = `${roomPath}.child('state')`;
    const seats = `${roomPath}.child('seats')`;
    const gameStarted = `${st}.child('match').exists()`;
    const beforeFinish = `now < ${st}.child('start').val() + ${rounds * span}`;
    const openLobby = `(!${gameStarted} || !(${beforeFinish}))`;
    const at = (slot, field) => `${seats}.child('${slot}/${field}').val()`;
    const incoming = (slot) => `newData.child('roster/${slot}')`;
    const everyOccupiedSeat = slots.map((slot) => `(!${seats}.child('${slot}').exists() || (${incoming(slot)}.child('uid').val() == ${at(slot, 'uid')} && ${incoming(slot)}.child('nick').val() == ${at(slot, 'nick')}))`).join(' && ');
    const anyOtherSeat = slots.map((slot) => `(newData.child('seat').val() != '${slot}' && newData.child('roster/${slot}').exists())`).join(' || ');
    const knownSeat = slots.map((slot) => `${st}.child('roster/${slot}/uid').val() == auth.uid`).join(' || ');
    const uniqueSeat = slots.map((slot) => `($slot == '${slot}' || newData.parent().child('${slot}/uid').val() != auth.uid)`).join(' && ');
    const nickRule = "newData.isString() && newData.val().matches(/^[가-힣]{2,8}$/)";
    const entityRule = {
      '.validate': "newData.hasChildren(['uid','nick'])",
      uid: { '.validate': 'newData.isString() && newData.val().length <= 128' },
      nick: { '.validate': nickRule },
      '$other': { '.validate': false }
    };
    const validRoom = "$room.matches(/^[2-9A-HJ-NP-Z]{6}$/)";
    const matchRules = Object.fromEntries(Array.from({ length: rounds }, (_, round) => {
      const deadline = `${st}.child('start').val() + ${round * span + bidTime}`;
      const isCurrent = `${st}.child('match').val() == $match`;
      return [String(round), {
        '.read': `auth != null && ${isCurrent} && now >= ${deadline}`,
        '$uid': {
          '.read': `auth != null && auth.uid == $uid && ${isCurrent}`,
          '.write': `auth != null && auth.uid == $uid && ${isCurrent} && !data.exists() && newData.exists() && (${knownSeat}) && now >= ${st}.child('start').val() + ${round * span} && now < ${deadline}`,
          '.validate': "newData.hasChildren(['lot','amount']) && ((newData.child('lot').val() == -1 && newData.child('amount').val() == 0) || (newData.child('lot').val() >= 0 && newData.child('amount').val() >= 1))",
          lot: { '.validate': 'newData.isNumber() && newData.val() >= -1 && newData.val() <= 2 && newData.val() % 1 == 0' },
          amount: { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 100 && newData.val() % 1 == 0' },
          '$other': { '.validate': false }
        }
      }];
    }));
    const presenceRule = "!newData.exists() || (newData.child('nick').isString() && newData.child('nick').val().matches(/^[가-힣]{2,8}$/) && newData.child('t').isNumber())";
    const selfWrite = 'auth != null && auth.uid === $uid';
    const oldPresence = { '$uid': { '.write': selfWrite, '.validate': presenceRule } };
    return { rules: {
      presence: { '.read': 'auth != null', ...oldPresence },
      show: { '.read': 'auth != null', '.write': "auth != null && root.child('presence/' + auth.uid).exists()" },
      answers: {
        '.read': 'auth != null', '.write': 'auth != null && !newData.exists()',
        '$key': { '.write': 'auth != null && !newData.exists()', '$uid': {
          '.write': "auth != null && auth.uid === $uid && !data.exists() && root.child('show/key').val() === $key && now <= root.child('show/tEnd').val() + 1500",
          '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 3'
        } }
      },
      pg: {
        '.read': 'auth != null', '.write': "auth != null && root.child('pg/presence/' + auth.uid).exists()",
        presence: oldPresence, cells: { '$i': { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 7' } }
      },
      [namespace]: { rooms: { '$room': {
        state: {
          '.read': 'auth != null',
          '.write': `auth != null && ${validRoom} && newData.exists() && ((!data.exists() && !newData.child('match').exists() && !newData.child('start').exists() && !newData.child('seat').exists() && !newData.child('roster').exists()) || (data.exists() && ${openLobby} && newData.hasChildren(['match','start','seat','roster']) && newData.child('createdAt').val() == data.child('createdAt').val() && !${roomPath}.child('bids/' + newData.child('match').val()).exists() && newData.child('match').val() != data.child('match').val() && newData.child('start').val() >= now - 3000 && newData.child('start').val() <= now + 1000 && newData.child('roster/' + newData.child('seat').val() + '/uid').val() == auth.uid && (${anyOtherSeat}) && ${everyOccupiedSeat}))`,
          '.validate': "newData.hasChildren(['createdAt'])",
          createdAt: { '.validate': 'newData.isNumber() && newData.val() <= now + 1000 && (data.exists() || newData.val() >= now - 3000)' },
          match: { '.validate': "newData.isString() && newData.val().matches(/^[-_A-Za-z0-9]{20}$/)" },
          start: { '.validate': 'newData.isNumber()' },
          seat: { '.validate': "newData.isString() && newData.val().matches(/^[0-7]$/)" },
          roster: { '$slot': {
            ...entityRule,
            '.validate': `${entityRule['.validate']} && $slot.matches(/^[0-7]$/) && newData.child('uid').val() == ${seats}.child($slot + '/uid').val() && newData.child('nick').val() == ${seats}.child($slot + '/nick').val()`
          } },
          '$other': { '.validate': false }
        },
        seats: { '.read': 'auth != null', '$slot': {
          ...entityRule,
          '.write': `auth != null && $slot.matches(/^[0-7]$/) && ((!newData.exists() && (!data.exists() || data.child('uid').val() == auth.uid)) || (${st}.exists() && (!data.exists() || data.child('uid').val() == auth.uid) && newData.child('uid').val() == auth.uid && (${openLobby} || ${st}.child('roster/' + $slot + '/uid').val() == auth.uid) && ${uniqueSeat}))`
        } },
        bids: { '$match': matchRules }
      } } }
    } };
  }

  function seededRandom(key) {
    let seed = 2166136261;
    for (const char of key) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
    return () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 4294967296;
    };
  }

  function makeLots(key) {
    const random = seededRandom(key);
    const pool = catalog.slice();
    return lotPoints.map((points) => {
      const lots = points.map((value) => {
        const [icon, name] = pool.splice(Math.floor(random() * pool.length), 1)[0];
        return { icon, name, value };
      });
      for (let i = lots.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [lots[i], lots[j]] = [lots[j], lots[i]];
      }
      return lots;
    });
  }

  function getPhase(start, time) {
    const elapsed = Math.max(0, time - start);
    const round = Math.floor(elapsed / span);
    if (round >= rounds) return { type: 'end', round: rounds - 1, left: 0, past: rounds };
    const current = elapsed % span;
    if (current < bidTime) return { type: 'bid', round, left: bidTime - current, past: round };
    return { type: 'reveal', round, left: span - current, past: round + 1 };
  }

  function tally(players, lots, revealed) {
    const standings = players.map((player) => ({ ...player, cash: startingCash, points: 0 }));
    const results = [];
    for (let round = 0; round < rounds && revealed.has(round); round++) {
      const raw = revealed.get(round);
      const bids = standings.map((player) => {
        const bid = raw[player.uid];
        const valid = Number.isInteger(bid?.lot) && bid.lot >= 0 && bid.lot < 3 && Number.isInteger(bid.amount) && bid.amount >= 1 && bid.amount <= player.cash;
        return { player, bid, valid };
      });
      const items = lots[round].map((lot, index) => {
        const offers = bids.filter((offer) => offer.valid && offer.bid.lot === index);
        const high = Math.max(0, ...offers.map((offer) => offer.bid.amount));
        const top = offers.filter((offer) => offer.bid.amount === high);
        const winner = top.length === 1 ? top[0].player : null;
        if (winner) {
          winner.cash -= high;
          winner.points += lot.value;
        }
        return { lot, high, winner: winner?.nick, tie: top.length > 1 };
      });
      results.push({ items, bids: bids.map(({ player, bid, valid }) => ({ nick: player.nick, bid, valid })) });
    }
    standings.sort((a, b) => b.points - a.points || b.cash - a.cash || a.slot.localeCompare(b.slot));
    standings.forEach((player, index) => {
      const earlier = standings[index - 1];
      player.place = earlier && earlier.points === player.points && earlier.cash === player.cash ? earlier.place : index + 1;
    });
    return { standings, results };
  }

  function clock() { return Date.now() + offset; }

  function status(message = '', kind = 'error') {
    $('notice').textContent = message;
    $('notice').dataset.kind = kind;
    $('notice').hidden = !message;
  }

  function setView(next) {
    view = next;
    for (const name of ['home', 'lobby', 'game']) $(name).hidden = name !== next;
  }

  function item(tag, value, className) {
    const element = document.createElement(tag);
    if (value !== undefined) element.textContent = value;
    if (className) element.className = className;
    return element;
  }

  function playSound(kind = 'click') {
    if (!soundOn) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!soundContext) soundContext = new Audio();
      if (soundContext.state === 'suspended') void soundContext.resume().catch(() => {});
      const now = soundContext.currentTime;
      const tones = kind === 'reveal' ? [392, 523, 659] : kind === 'end' ? [392, 523, 659, 784] : [kind === 'tick' ? 440 : 640];
      tones.forEach((frequency, index) => {
        const oscillator = soundContext.createOscillator();
        const gain = soundContext.createGain();
        const start = now + index * 0.085;
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.095, start + 0.016);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.19);
        oscillator.connect(gain).connect(soundContext.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.2);
      });
    } catch { /* Audio is optional. */ }
  }

  function firebase() {
    if (networkPromise) return networkPromise;
    networkPromise = (async () => {
      const [appSdk, authSdk, dbSdk] = await Promise.all(['app', 'auth', 'database'].map((name) => import(`${sdkBase}firebase-${name}.js`)));
      const app = appSdk.initializeApp(firebaseConfig, 'secret-auction');
      const auth = authSdk.initializeAuth(app, { persistence: [authSdk.browserSessionPersistence, authSdk.inMemoryPersistence] });
      await auth.authStateReady();
      const user = auth.currentUser ?? (await authSdk.signInAnonymously(auth)).user;
      const db = dbSdk.getDatabase(app);
      const api = { ...dbSdk, db, uid: user.uid };
      const receivedClock = new Promise((resolve) => {
        dbSdk.onValue(dbSdk.ref(db, '.info/serverTimeOffset'), (snapshot) => {
          offset = Number(snapshot.val()) || 0;
          resolve();
        });
      });
      const initialConnection = new Promise((resolve) => {
        dbSdk.onValue(dbSdk.ref(db, '.info/connected'), (snapshot) => {
          isConnected = snapshot.val() === true;
          if (isConnected) {
            resolve();
            if (room?.slot !== null && room?.slot !== undefined) void renewSeat(room);
          }
          if (view === 'lobby') renderLobby();
        });
      });
      await Promise.all([receivedClock, initialConnection]);
      online = api;
      return api;
    })().catch((error) => {
      networkPromise = undefined;
      const existing = online;
      online = undefined;
      if (existing) existing.goOffline(existing.db);
      throw error;
    });
    return networkPromise;
  }

  function roomRef(current, path) {
    return online.ref(online.db, `${namespace}/rooms/${current.code}/${path}`);
  }

  function gameError(error) {
    if (error?.code === 'auth/operation-not-allowed') return 'Firebase Authentication에서 익명 로그인을 활성화해 주세요.';
    if (error?.code === 'auth/unauthorized-domain' || error?.code === 'auth/app-not-authorized') return 'Firebase 인증 설정에서 GitHub Pages 도메인과 웹 API 키 설정을 확인해 주세요.';
    if (/permission.denied/i.test(String(error?.code ?? error?.message))) return '요청을 저장하지 못했어요. 경매 마감 여부 또는 Firebase에 경매 규칙이 적용됐는지 확인해 주세요.';
    return error?.userMessage || '연결할 수 없어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.';
  }

  function fail(message) { return Object.assign(new Error(message), { userMessage: message }); }

  async function publicAction(button, work) {
    if (busy) return;
    busy = true;
    status('', 'info');
    button.disabled = true;
    try { await work(); }
    catch (error) { status(gameError(error)); }
    finally {
      busy = false;
      button.disabled = false;
      if (view === 'lobby') renderLobby();
    }
  }

  function liveConnection() {
    let timer;
    return Promise.race([
      firebase(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(fail('Firebase 연결 시간이 길어지고 있어요. 잠시 후 다시 시도해 주세요.')), 8500); })
    ]).finally(() => clearTimeout(timer));
  }

  async function createRoom() {
    await liveConnection();
    for (let attempt = 0; attempt < 5; attempt++) {
      const random = crypto.getRandomValues(new Uint8Array(6));
      const code = Array.from(random, (n) => codeChars[n % codeChars.length]).join('');
      if (code === publicRoom) continue;
      const result = await createLobbyState(code);
      if (result.committed) { await enterRoom(code, result.snapshot.val()); return; }
    }
    throw fail('새 방 코드를 만들 수 없어요. 다시 눌러 주세요.');
  }

  function createLobbyState(code) {
    return online.runTransaction(roomRef({ code }, 'state'), (state) => state ? undefined : { createdAt: online.serverTimestamp() }, { applyLocally: false });
  }

  async function joinPublicRoom() {
    await liveConnection();
    const state = (await online.get(roomRef({ code: publicRoom }, 'state'))).val();
    const ready = state ?? (await createLobbyState(publicRoom)).snapshot.val();
    await enterRoom(publicRoom, ready);
  }

  function active(state) { return state?.match && clock() < state.start + rounds * span; }

  function toRoster(data) {
    return Object.entries(data ?? {}).filter(([, player]) => player?.uid).map(([slot, player]) => ({ slot, ...player }));
  }

  async function enterRoom(code, known) {
    await liveConnection();
    const state = known ?? (await online.get(roomRef({ code }, 'state'))).val();
    if (!state?.createdAt) throw fail('방을 찾을 수 없어요. 초대 링크나 방 코드를 확인해 주세요.');
    const seats = (await online.get(roomRef({ code }, 'seats'))).val();
    const current = { code, state, seats, slot: null, nick: availableNick(seats), stops: [], lobbyFor: null, entered: false, seatTask: null };
    room = current;
    try {
      if (active(state)) {
        const mine = toRoster(state.roster).find((person) => person.uid === online.uid);
        if (mine) {
          current.nick = mine.nick;
          await claimSeat(current, [mine.slot]);
        }
      } else {
        current.lobbyFor = state.match ?? null;
        await claimSeat(current);
      }
    } catch (error) {
      if (!/permission.denied/i.test(String(error?.code ?? error?.message))) { room = null; throw error; }
      current.state = (await online.get(roomRef(current, 'state'))).val();
      if (!active(current.state)) { room = null; throw error; }
    }
    current.entered = true;
    $('code').value = code;
    syncRoom(current);
    const watch = (path, callback) => online.onValue(roomRef(current, path), (snapshot) => {
      if (room !== current) return;
      callback(snapshot.val());
    }, (error) => { if (room === current) status(gameError(error)); });
    current.stops.push(watch('state', (value) => { current.state = value; syncRoom(current); }));
    current.stops.push(watch('seats', (value) => { current.seats = value; if (view === 'lobby') renderLobby(); }));
  }

  function syncRoom(current) {
    if (room !== current || !current.entered) return;
    const state = current.state;
    if (state?.match && state.match !== current.lobbyFor) {
      if (match?.key !== state.match) setMatch('live', state.match, state.start, toRoster(state.roster), online.uid);
    } else {
      clearMatch();
      setView('lobby');
      renderLobby();
    }
  }

  function claimSeat(current, candidates) {
    if (current.seatTask) return current.seatTask;
    const seatWork = async () => {
      const occupied = toRoster(current.seats);
      const own = occupied.find((person) => person.uid === online.uid);
      const available = candidates ?? (own ? [own.slot] : slots.filter((slot) => !current.seats?.[slot]));
      for (const slot of available) {
        if (room !== current || !isConnected) return false;
        const reference = roomRef(current, `seats/${slot}`);
        const disconnect = online.onDisconnect(reference);
        let committed = false;
        try {
          await disconnect.remove();
          const result = await online.runTransaction(reference, (seat) => {
            if (seat && seat.uid !== online.uid) return;
            return { uid: online.uid, nick: seat?.nick ?? current.nick };
          }, { applyLocally: false });
          committed = result.committed;
          if (!committed) continue;
          current.slot = slot;
          current.nick = result.snapshot.val().nick;
          current.disconnect = disconnect;
          return true;
        } catch (error) {
          if (!/permission.denied/i.test(String(error?.code ?? error?.message))) throw error;
          const latest = (await online.get(reference)).val();
          if (!latest || latest.uid === online.uid) throw error;
        } finally {
          if (!committed && isConnected) void disconnect.cancel().catch(() => {});
        }
      }
      return false;
    };
    current.seatTask = seatWork().finally(() => { current.seatTask = null; });
    return current.seatTask;
  }

  async function renewSeat(current) {
    try { await claimSeat(current, [current.slot]); }
    catch { /* The match roster remains available to returning players. */ }
    if (room === current && view === 'lobby') renderLobby();
  }

  function renderLobby() {
    if (!room) return;
    const roster = toRoster(room.seats);
    $('room-code').textContent = room.code === publicRoom ? `${room.code} · 공개` : room.code;
    $('lobby-state').textContent = isConnected ? `${roster.length} / 8명` : '연결 복구 중';
    const seated = roster.find((player) => player.uid === online.uid);
    $('my-name').textContent = seated ? `내 닉네임 · ${seated.nick}` : '대기 중';
    $('seats').replaceChildren(...slots.map((slot) => {
      const player = room.seats?.[slot];
      const row = item('li', undefined, `seat${player ? '' : ' empty'}`);
      if (player) row.append(item('span', '', 'dot'), player.nick, player.uid === online.uid ? ' · 나' : '');
      else row.textContent = '빈자리';
      return row;
    }));
    $('lobby-help').textContent = seated ? '두 명 이상 접속하면 누구나 경매를 시작할 수 있어요.' : '빈자리가 생기면 자리를 잡으세요. 경매가 시작되면 관전할 수 있어요.';
    $('start').textContent = seated ? '경매 시작' : '빈자리 참가';
    $('start').disabled = !isConnected || busy || (seated ? roster.length < 2 : roster.length >= slots.length);
    $('shuffle').disabled = !isConnected || !seated || busy;
  }

  async function startLive() {
    const current = room;
    if (!isConnected) throw fail('연결이 복구되면 다시 시도해 주세요.');
    if (!toRoster(current.seats).some((player) => player.uid === online.uid)) {
      if (!await claimSeat(current)) throw fail('빈자리가 없어요. 자리가 나면 다시 시도해 주세요.');
      return;
    }
    const roster = toRoster(current.seats);
    if (roster.length < 2) throw fail('두 명 이상 모이면 시작할 수 있어요.');
    const matchKey = online.push(roomRef(current, 'bids')).key;
    let result;
    try {
      result = await online.runTransaction(roomRef(current, 'state'), (state) => {
        if (!state || active(state)) return;
        return {
          createdAt: state.createdAt, match: matchKey, start: online.serverTimestamp(), seat: current.slot,
          roster: Object.fromEntries(roster.map(({ slot, uid, nick }) => [slot, { uid, nick }]))
        };
      }, { applyLocally: false });
    } catch (error) {
      if (!/permission.denied/i.test(String(error?.code ?? error?.message))) throw error;
      const latest = (await online.get(roomRef(current, 'state'))).val();
      if (room !== current) return;
      if (!active(latest)) throw fail('대기실 인원이 바뀌었어요. 다시 시도해 주세요.');
      current.state = latest;
      syncRoom(current);
      return;
    }
    if (room !== current) return;
    if (result.snapshot.val()?.match && active(result.snapshot.val())) {
      current.state = result.snapshot.val();
      syncRoom(current);
    } else if (!result.committed) throw fail('대기실 인원이 바뀌었어요. 다시 시도해 주세요.');
  }

  async function changeNick() {
    const current = room;
    const nick = availableNick(current.seats);
    await online.set(roomRef(current, `seats/${current.slot}`), { uid: online.uid, nick });
    current.nick = nick;
  }

  function clearMatch() {
    match?.stopOwn?.();
    match = null;
  }

  function exit() {
    const previous = room;
    room = null;
    clearMatch();
    status();
    setView('home');
    if (!previous) return;
    previous.stops.forEach((stop) => stop());
    void (async () => {
      try {
        await previous.seatTask;
        if (previous.slot !== null && isConnected && room?.code !== previous.code) {
          await online.remove(roomRef(previous, `seats/${previous.slot}`));
          await previous.disconnect?.cancel();
        }
      } catch { /* The registered disconnect operation also clears the seat. */ }
    })();
  }

  function setMatch(mode, key, start, players, uid) {
    clearMatch();
    match = { mode, key, start, players, uid, lots: makeLots(key), revealed: new Map(), own: undefined, sending: false, lastRead: 0 };
    displayedRound = '';
    lastStage = '';
    playTick = 0;
    $('mode').textContent = mode === 'live' ? `방 ${room.code}` : 'AI 연습';
    $('game-invite').hidden = mode !== 'live';
    setView('game');
    tick();
  }

  function newPractice() {
    const players = ['나', '여우수집가', '판다상인', '수달감정사'].map((nick, i) => ({ slot: String(i), uid: `practice${i}`, nick }));
    setMatch('practice', `practice-${Date.now()}-${Math.random()}`, Date.now(), players, players[0].uid);
  }

  function practiceOffers(current, round, standings) {
    const random = seededRandom(`${current.key}.${round}`);
    return Object.fromEntries(standings.filter((player) => player.uid !== current.uid && player.cash > 0).map((player) => {
      const lots = current.lots[round];
      const slot = Number(player.slot);
      const favored = lots.findIndex((lot) => lot.value === Math[slot === 2 ? 'min' : 'max'](...lots.map((entry) => entry.value)));
      const lot = random() < (slot === 3 ? .46 : .69) ? favored : Math.floor(random() * 3);
      const value = lots[lot].value;
      const fraction = [.48, .68, .52, .59][slot];
      const amount = clamp(Math.round(value * (fraction + random() * .49) + (round === rounds - 1 ? 6 : 0)), 1, player.cash);
      return [player.uid, { lot, amount }];
    }));
  }

  function refreshReveals(current, needed) {
    if (current.loading || !isConnected || current.revealed.size >= needed || Date.now() - current.lastRead < 450) return;
    current.loading = true;
    current.lastRead = Date.now();
    const missing = Array.from({ length: needed }, (_, round) => round).filter((round) => !current.revealed.has(round));
    void Promise.allSettled(missing.map(async (round) => {
      const result = await online.get(roomRef(room, `bids/${current.key}/${round}`));
      if (match === current) current.revealed.set(round, result.val() ?? {});
    })).finally(() => { current.loading = false; });
  }

  function ownBidFor(current, round) {
    current.stopOwn?.();
    current.stopOwn = null;
    current.own = undefined;
    current.sending = false;
    if (current.mode !== 'live' || !current.players.some((player) => player.uid === current.uid)) return;
    current.stopOwn = online.onValue(roomRef(room, `bids/${current.key}/${round}/${current.uid}`), (snapshot) => {
      if (match === current && current.ownRound === round) current.own = snapshot.val() ?? null;
    }, () => { /* A changed match is handled by the room-state subscription. */ });
  }

  function drawRanking(standings) {
    $('ranking').replaceChildren(...standings.map((player) => {
      const li = item('li', undefined, player.uid === match.uid ? 'me' : '');
      const score = item('span', `${player.points}점`, 'score');
      score.append(item('span', `잔액 ${player.cash}`, 'cash'));
      li.append(item('span', player.place, 'rank'), item('span', `${player.nick}${player.uid === match.uid && match.mode === 'live' ? ' · 나' : ''}`, 'name'), score);
      return li;
    }));
  }

  function setLots(lots) {
    $('lots').replaceChildren(...lots.map((lot, i) => {
      const button = item('button', undefined, 'lot');
      button.type = 'button';
      button.dataset.lot = i;
      button.setAttribute('aria-pressed', 'false');
      const icon = item('span', lot.icon, 'item');
      icon.setAttribute('aria-hidden', 'true');
      button.append(icon, item('span', lot.name, 'item-name'), item('span', `승점 ${lot.value}`, 'value'));
      return button;
    }));
  }

  function displayReveal(result, round) {
    const section = item('div', undefined, 'reveal');
    section.append(item('h3', `${round + 1}라운드 낙찰 결과`));
    const items = item('ul', undefined, 'result-list');
    for (const { lot, high, winner, tie } of result.items) {
      const line = item('li', `${lot.icon} ${lot.name} `);
      line.append(item('strong', winner ? `${winner} · ${high}점 낙찰` : tie ? `최고액 ${high}점 동률 · 유찰` : '유효 입찰 없음 · 유찰'));
      items.append(line);
    }
    const details = item('details');
    details.append(item('summary', '전체 입찰 내역'));
    const bids = item('ul', undefined, 'receipts');
    for (const offer of result.bids) {
      const action = offer.valid ? `${result.items[offer.bid.lot].lot.name} · ${offer.bid.amount}점` : offer.bid?.amount > 0 ? '예산 초과 · 무효' : offer.bid ? '기권' : '미제출';
      bids.append(item('li', `${offer.nick} · ${action}`));
    }
    details.append(bids);
    section.append(items, details);
    return section;
  }

  function displayEnd(current, results, standings) {
    const winners = standings.filter((player) => player.place === 1);
    const box = item('div', undefined, 'panel stack end reveal');
    box.append(item('h2', winners.length === 1 ? `${winners[0].nick} 우승!` : '공동 우승!'));
    box.append(item('p', winners.length > 1 ? winners.map((player) => player.nick).join(' · ') : `최종 승점 ${winners[0].points}점 · 남은 예산 ${winners[0].cash}점`, 'help'));
    const replay = item('button', current.mode === 'live' ? '대기실 돌아가기' : '다시 연습하기', 'button primary');
    replay.type = 'button';
    replay.addEventListener('click', () => {
      if (current.mode === 'practice') newPractice();
      else returnToLobby();
    });
    box.append(replay);
    const history = item('details');
    history.append(item('summary', '5라운드 전체 경매 기록'));
    history.append(...results.map(displayReveal));
    return [box, history];
  }

  function returnToLobby() {
    const current = room;
    current.lobbyFor = match.key;
    clearMatch();
    syncRoom(current);
    if (isConnected) void claimSeat(current).then(() => { if (room === current && view === 'lobby') renderLobby(); }).catch((error) => { if (room === current) status(gameError(error)); });
  }

  function bidUi(canBid, mine, current, phase) {
    const selected = current.own?.lot >= 0 ? current.own.lot : pickedLot;
    for (const button of $('lots').children) {
      const picked = Number(button.dataset.lot) === selected;
      button.disabled = !canBid;
      button.classList.toggle('is-picked', picked);
      button.setAttribute('aria-pressed', String(picked));
    }
    $('bid-form').hidden = !canBid;
    if (canBid) {
      const amount = $('amount');
      if (+amount.max !== mine.cash) {
        amount.max = mine.cash;
        if (+amount.value > mine.cash) amount.value = mine.cash;
      }
      $('chosen').textContent = pickedLot === null ? '· 상품을 먼저 고르세요' : `· ${current.lots[phase.round][pickedLot].name}`;
      $('submit-bid').disabled = pickedLot === null;
    }
    let message = '';
    if (phase.type === 'bid') {
      if (!mine) message = '관전 중 · 대기실로 돌아가면 다음 판에 참가할 수 있어요.';
      else if (current.mode === 'live' && !isConnected) message = '연결 복구 중 · 다른 참가자의 경매는 계속 진행돼요.';
      else if (current.sending) message = '입찰 접수 확인 중…';
      else if (current.own) message = current.own.amount ? `입찰 완료 · ${current.lots[phase.round][current.own.lot].name}에 ${current.own.amount}점` : '이번 라운드 기권 완료';
      else if (current.mode === 'live' && (current.own === undefined || current.revealed.size < phase.past)) message = '입찰 기록과 잔액 확인 중…';
      else if (mine.cash === 0) message = '예산을 모두 사용했어요. 낙찰 결과를 기다려 주세요.';
      else message = '마감 뒤 입찰 금액을 함께 공개해요.';
    }
    if ($('bid-status').textContent !== message) $('bid-status').textContent = message;
  }

  function tick() {
    if (!match || view !== 'game') return;
    const current = match;
    const phase = getPhase(current.start, current.mode === 'live' ? clock() : Date.now());
    if (current.mode === 'live') refreshReveals(current, phase.past);
    else {
      for (let round = current.revealed.size; round < phase.past; round++) {
        const { standings } = tally(current.players, current.lots, current.revealed);
        const bids = practiceOffers(current, round, standings);
        if (current.ownRound === round && current.own) bids[current.uid] = current.own;
        current.revealed.set(round, bids);
      }
    }

    const roundKey = `${current.key}-${phase.round}`;
    if (displayedRound !== roundKey) {
      displayedRound = roundKey;
      current.ownRound = phase.round;
      ownBidFor(current, phase.round);
      pickedLot = null;
      $('amount').max = startingCash;
      $('amount').value = 10;
      setLots(current.lots[phase.round]);
    }
    const standingKey = [...current.revealed.keys()].sort().join(',');
    if (!current.summary || standingKey !== current.standingKey) {
      current.standingKey = standingKey;
      current.summary = tally(current.players, current.lots, current.revealed);
      drawRanking(current.summary.standings);
      const mine = current.summary.standings.find((person) => person.uid === current.uid);
      $('stats').hidden = !mine;
      if (mine) {
        $('budget').textContent = `${mine.cash}점`;
        $('points').textContent = `${mine.points}점`;
      }
    }

    const { standings, results } = current.summary;
    const mine = standings.find((person) => person.uid === current.uid);
    const loaded = results.length >= phase.past;
    const stageKey = `${roundKey}-${phase.type}-${loaded}`;
    if (lastStage !== stageKey) {
      lastStage = stageKey;
      const part = $('stage');
      part.replaceChildren();
      $('round-label').textContent = phase.type === 'end' ? '경매 종료' : `${phase.round + 1} / ${rounds} 라운드`;
      $('stage-title').textContent = { bid: '비밀 입찰', reveal: '입찰 공개', end: '최종 순위' }[phase.type];
      $('ranking-title').textContent = phase.type === 'end' && loaded ? '최종 순위' : '현재 순위';
      $('lots').hidden = phase.type !== 'bid';
      if (phase.type !== 'bid') {
        if (!loaded) part.append(item('p', '마감된 입찰을 불러오는 중…', 'help'));
        else if (phase.type === 'reveal') {
          part.append(displayReveal(results[phase.round], phase.round));
          playSound('reveal');
        } else {
          part.append(...displayEnd(current, results, standings));
          playSound('end');
        }
      }
    }

    const seconds = Math.ceil(phase.left / 1000);
    $('count').hidden = phase.type === 'end';
    $('count').textContent = `${seconds}초`;
    $('count').classList.toggle('rush', phase.type === 'bid' && seconds <= 3);
    $('progress').hidden = phase.type === 'end';
    $('progress').firstElementChild.style.transform = `scaleX(${phase.left / (phase.type === 'bid' ? bidTime : revealTime)})`;
    if (phase.type === 'bid' && seconds <= 3 && playTick !== seconds) playSound('tick');
    playTick = phase.type === 'bid' ? seconds : 0;
    const ready = current.mode === 'practice' || (isConnected && current.own !== undefined);
    bidUi(Boolean(phase.type === 'bid' && ready && loaded && mine?.cash > 0 && !current.own && !current.sending), mine, current, phase);
  }

  async function bid(pass) {
    const current = match;
    if (!current || $('bid-form').hidden || current.sending || current.own) return;
    const phase = getPhase(current.start, current.mode === 'live' ? clock() : Date.now());
    if (phase.type !== 'bid' || phase.round !== current.ownRound) return;
    const amount = pass ? 0 : Number($('amount').value);
    if (!pass && (pickedLot === null || !Number.isInteger(amount) || amount < 1 || amount > Number($('amount').max))) return;
    const offer = { lot: pass ? -1 : pickedLot, amount };
    current.sending = true;
    status();
    tick();
    try {
      if (current.mode === 'live') await online.set(roomRef(room, `bids/${current.key}/${phase.round}/${current.uid}`), offer);
      if (match === current && current.ownRound === phase.round) {
        current.own = offer;
        playSound();
      }
    } catch (error) {
      if (match === current && current.ownRound === phase.round) status(gameError(error));
    } finally {
      if (match === current && current.ownRound === phase.round) {
        current.sending = false;
        tick();
      }
    }
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* Embedded browsers can deny clipboard access. */ }
    const area = item('textarea', text);
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0.01';
    document.body.append(area);
    area.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } finally { area.remove(); }
    return copied;
  }

  async function share() {
    if (!room) return;
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('room', room.code);
    if (await copy(url.href)) status('초대 링크를 복사했어요. 친구에게 보내 주세요.', 'info');
    else window.prompt('초대 링크를 복사하세요.', url.href);
  }

  $('rules').value = JSON.stringify(buildRules(), null, 2);
  $('copy-rules').addEventListener('click', async () => {
    if (await copy($('rules').value)) $('copy-rules').textContent = '복사 완료';
    else { $('rules').focus(); $('rules').select(); }
  });
  const invited = new URLSearchParams(location.search).get('room')?.trim().toUpperCase();
  if (invited && /^[2-9A-HJ-NP-Z]{6}$/.test(invited)) $('code').value = invited;
  $('public-room').addEventListener('click', () => void publicAction($('public-room'), joinPublicRoom));
  $('create').addEventListener('click', () => void publicAction($('create'), createRoom));
  $('join').addEventListener('submit', (event) => {
    event.preventDefault();
    const code = $('code').value.trim().toUpperCase();
    if (!/^[2-9A-HJ-NP-Z]{6}$/.test(code)) { status('방 코드 6자리를 확인해 주세요.'); return; }
    void publicAction($('join').querySelector('button'), () => enterRoom(code));
  });
  $('practice').addEventListener('click', () => { if (!busy) { status(); newPractice(); } });
  $('start').addEventListener('click', () => void publicAction($('start'), startLive));
  $('shuffle').addEventListener('click', () => void publicAction($('shuffle'), changeNick));
  [$('invite'), $('game-invite')].forEach((button) => button.addEventListener('click', () => void share()));
  document.querySelectorAll('[data-exit]').forEach((button) => button.addEventListener('click', exit));
  $('lots').addEventListener('click', (event) => {
    const button = event.target.closest('[data-lot]');
    if (!button || button.disabled) return;
    pickedLot = Number(button.dataset.lot);
    playSound();
    tick();
  });
  for (const [id, delta] of [['less', -5], ['more', 5], ['max', 100]]) {
    $(id).addEventListener('click', () => { const amount = $('amount'); amount.value = clamp((Number(amount.value) || 0) + delta, 1, Number(amount.max)); });
  }
  $('bid-form').addEventListener('submit', (event) => { event.preventDefault(); void bid(false); });
  $('pass').addEventListener('click', () => void bid(true));
  $('sound').addEventListener('click', () => {
    soundOn = !soundOn;
    $('sound').textContent = soundOn ? '소리 끄기' : '소리 켜기';
    $('sound').setAttribute('aria-pressed', String(soundOn));
    playSound();
  });
  $('fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { window.open(location.href, '_blank', 'noopener'); }
  });
  window.addEventListener('pageshow', () => { if (room?.slot !== null && room?.slot !== undefined && isConnected) void renewSeat(room); });
  setInterval(tick, 120);
})();
