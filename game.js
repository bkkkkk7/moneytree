(() => {
  "use strict";

  const BET_LEVELS = [100, 250, 500, 1000, 2500];
  const SYMBOLS = [
    { mark: "福", kind: "ruby", multiplier: 8 },
    { mark: "玉", kind: "jade", multiplier: 6 },
    { mark: "龍", kind: "gold", multiplier: 10 },
    { mark: "◆", kind: "violet", multiplier: 5 },
    { mark: "元", kind: "pearl", multiplier: 4 },
    { mark: "8", kind: "gold", multiplier: 3 },
  ];
  const PLAYERS = ["SEOUL_88", "GOLDEN_K", "행운가득", "MIRA_77", "LUCKY.P", "JEJU_STAR", "부자되자", "MOON_21"];
  const TREE_POSITIONS = [
    [20, 38], [29, 29], [39, 24], [50, 29], [61, 23], [72, 31], [80, 42],
    [25, 50], [36, 43], [48, 46], [59, 41], [70, 50], [31, 59], [43, 55],
    [56, 57], [66, 61], [19, 57], [77, 58], [45, 34], [56, 35], [35, 35],
    [14, 45], [17, 32], [23, 25], [31, 20], [42, 18], [52, 20], [64, 18],
    [75, 23], [85, 35], [23, 44], [31, 39], [41, 40], [52, 39], [63, 36],
    [74, 42], [25, 56], [37, 52], [49, 52], [61, 49], [72, 55], [28, 64],
    [39, 61], [51, 63], [63, 65], [74, 62], [45, 27], [67, 29], [54, 31],
  ];
  const MAX_FRUIT_COUNT = 96;
  const STORAGE_KEY = "golden-tree-jackpot-state-v1";
  const CHANNEL_NAME = "golden-tree-jackpot-live-v1";

  const els = {
    game: document.querySelector("#game"),
    treeStage: document.querySelector("#treeStage"),
    treeWrap: document.querySelector("#treeWrap"),
    coinFruitLayer: document.querySelector("#coinFruitLayer"),
    sparkLayer: document.querySelector("#sparkLayer"),
    jackpotValue: document.querySelector("#jackpotValue"),
    chargeLabel: document.querySelector("#chargeLabel"),
    chargePercent: document.querySelector("#chargePercent"),
    chargeBar: document.querySelector("#chargeBar"),
    chargeSpark: document.querySelector("#chargeSpark"),
    chargeTrack: document.querySelector(".charge-track"),
    nearMessage: document.querySelector("#nearMessage"),
    betToast: document.querySelector("#betToast"),
    jackpotBurst: document.querySelector("#jackpotBurst"),
    winnerName: document.querySelector("#winnerName"),
    onlineCount: document.querySelector("#onlineCount"),
    feedText: document.querySelector("#feedText"),
    feedPlus: document.querySelector("#feedPlus"),
    communityFeed: document.querySelector(".community-feed"),
    reels: document.querySelector("#reels"),
    reelFrame: document.querySelector("#reelFrame"),
    resultMessage: document.querySelector("#resultMessage"),
    winLine: document.querySelector("#winLine"),
    balanceValue: document.querySelector("#balanceValue"),
    betValue: document.querySelector("#betValue"),
    betMinus: document.querySelector("#betMinus"),
    betPlus: document.querySelector("#betPlus"),
    spinButton: document.querySelector("#spinButton"),
    soundButton: document.querySelector("#soundButton"),
  };

  const initialShared = readStoredState();
  const state = {
    balance: 125000,
    betIndex: 2,
    spinning: false,
    soundOn: false,
    jackpot: initialShared.jackpot,
    progress: initialShared.progress,
    fruitCount: initialShared.fruitCount,
    processedEvents: new Set(),
    audioContext: null,
    channel: "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL_NAME) : null,
  };

  function readStoredState() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (stored && Date.now() - stored.updatedAt < 1000 * 60 * 30) {
        return {
          jackpot: Number(stored.jackpot) || 12847500,
          progress: Math.min(99.4, Math.max(68, Number(stored.progress) || 76.8)),
          fruitCount: Math.min(MAX_FRUIT_COUNT, Number(stored.fruitCount) || 7),
        };
      }
    } catch (_error) {
      // A corrupt demo state should never stop the game from loading.
    }
    return { jackpot: 12847500, progress: 76.8, fruitCount: 7 };
  }

  function saveSharedState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      jackpot: Math.round(state.jackpot),
      progress: Number(state.progress.toFixed(2)),
      fruitCount: state.fruitCount,
      updatedAt: Date.now(),
    }));
  }

  function formatWon(value) {
    return new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency: "KRW",
      maximumFractionDigits: 0,
    }).format(Math.round(value));
  }

  function randomSymbol() {
    return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  }

  function createSymbol(symbol) {
    const cell = document.createElement("div");
    cell.className = "symbol";
    cell.dataset.kind = symbol.kind;
    cell.dataset.mark = symbol.mark;
    cell.textContent = symbol.mark;
    return cell;
  }

  function buildReels() {
    els.reels.replaceChildren();
    for (let column = 0; column < 5; column += 1) {
      const reel = document.createElement("div");
      reel.className = "reel";
      reel.dataset.column = String(column);
      for (let row = 0; row < 3; row += 1) {
        reel.append(createSymbol(SYMBOLS[(column * 2 + row) % SYMBOLS.length]));
      }
      els.reels.append(reel);
    }
  }

  function updateSymbol(cell, symbol) {
    cell.dataset.kind = symbol.kind;
    cell.dataset.mark = symbol.mark;
    cell.textContent = symbol.mark;
  }

  function renderPersistentFruit() {
    els.coinFruitLayer.replaceChildren();
    for (let index = 0; index < state.fruitCount; index += 1) {
      addFruitAt(index, false);
    }
  }

  function fruitPosition(index) {
    const base = TREE_POSITIONS[index % TREE_POSITIONS.length];
    const layer = Math.floor(index / TREE_POSITIONS.length);
    if (layer === 0) return base;
    const xJitter = ((index * 17) % 7 - 3) * 1.15;
    const yJitter = ((index * 11) % 5 - 2) * 1.25;
    return [
      Math.min(87, Math.max(13, base[0] + xJitter)),
      Math.min(67, Math.max(17, base[1] + yJitter)),
    ];
  }

  function fruitGainForBet(amount) {
    if (amount >= 2500) return 7;
    if (amount >= 1000) return 5;
    if (amount >= 500) return 4;
    if (amount >= 250) return 3;
    return 2;
  }

  function addFruitAt(index, animate = true) {
    const position = fruitPosition(index);
    const size = [22, 25, 28, 31][index % 4];
    const fruit = document.createElement("span");
    fruit.className = "coin-fruit";
    fruit.style.left = `${position[0]}%`;
    fruit.style.top = `${position[1]}%`;
    fruit.style.width = `${size}px`;
    fruit.style.height = `${size}px`;
    fruit.style.zIndex = String(5 + index % 4);
    if (!animate) fruit.style.animationDelay = "-2s";
    els.coinFruitLayer.append(fruit);
    if (animate) sparkleAt(position[0], position[1]);
  }

  function sparkleAt(x, y) {
    for (let index = 0; index < 7; index += 1) {
      const spark = document.createElement("i");
      spark.className = "spark";
      spark.style.left = `${x + (Math.random() - 0.5) * 8}%`;
      spark.style.top = `${y + (Math.random() - 0.5) * 8}%`;
      spark.style.animationDelay = `${index * 45}ms`;
      els.sparkLayer.append(spark);
      window.setTimeout(() => spark.remove(), 1100);
    }
  }

  function renderMoney() {
    els.balanceValue.textContent = formatWon(state.balance);
    els.betValue.textContent = formatWon(BET_LEVELS[state.betIndex]);
    els.jackpotValue.textContent = formatWon(state.jackpot);
  }

  function renderProgress() {
    const value = Math.min(100, state.progress);
    const label = `${value.toFixed(1)}%`;
    els.chargePercent.textContent = label;
    els.chargeBar.style.width = label;
    els.chargeSpark.style.left = label;
    els.chargeTrack.setAttribute("aria-valuenow", String(Math.round(value)));

    const isNear = value >= 88;
    els.treeWrap.classList.toggle("is-near", isNear);
    if (value >= 96) {
      els.chargeLabel.textContent = "곧 황금 기운이 폭발합니다";
      els.nearMessage.textContent = "지금 이 순간, 모든 베팅이 잭팟을 흔들고 있어요";
    } else if (isNear) {
      els.chargeLabel.textContent = "나무가 심상치 않게 흔들립니다";
      els.nearMessage.textContent = "잭팟이 아주 가까워진 것 같아요";
    } else {
      els.chargeLabel.textContent = "황금 기운이 차오르는 중";
      els.nearMessage.textContent = "베팅할수록 나무에 황금 열매가 늘어나요";
    }
  }

  function renderAll() {
    renderMoney();
    renderProgress();
    renderPersistentFruit();
  }

  function setBetIndex(nextIndex) {
    if (state.spinning) return;
    state.betIndex = Math.min(BET_LEVELS.length - 1, Math.max(0, nextIndex));
    els.betMinus.disabled = state.betIndex === 0;
    els.betPlus.disabled = state.betIndex === BET_LEVELS.length - 1;
    renderMoney();
    playTone(260 + state.betIndex * 55, 0.05, "sine", 0.025);
  }

  function playTone(frequency, duration, type = "sine", volume = 0.04, delay = 0) {
    if (!state.soundOn) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    state.audioContext ||= new AudioContext();
    const context = state.audioContext;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function playCoinSound() {
    playTone(760, 0.12, "sine", 0.04);
    playTone(1120, 0.16, "sine", 0.03, 0.08);
  }

  function showToast(message) {
    els.betToast.textContent = message;
    els.betToast.classList.remove("is-visible");
    void els.betToast.offsetWidth;
    els.betToast.classList.add("is-visible");
  }

  function animateTreeImpact() {
    els.treeWrap.classList.remove("is-fed");
    void els.treeWrap.offsetWidth;
    els.treeWrap.classList.add("is-fed");
    window.setTimeout(() => els.treeWrap.classList.remove("is-fed"), 760);
  }

  function animateCoinsToTree(amount, isLocal, startFruitIndex, fruitGain) {
    const sourceRect = (isLocal ? els.spinButton : els.communityFeed).getBoundingClientRect();
    const stageRect = els.treeWrap.getBoundingClientRect();
    const count = isLocal ? Math.min(11, fruitGain + 4) : Math.max(4, fruitGain + 1);

    for (let index = 0; index < count; index += 1) {
      const destination = fruitPosition(startFruitIndex + index % Math.max(1, fruitGain));
      const coin = document.createElement("span");
      coin.className = "flying-coin";
      coin.textContent = "₩";
      const startX = sourceRect.left + sourceRect.width * (0.35 + Math.random() * 0.3);
      const startY = sourceRect.top + sourceRect.height * 0.35;
      const endX = stageRect.left + stageRect.width * (destination[0] / 100) + (Math.random() - 0.5) * 40;
      const endY = stageRect.top + stageRect.height * (destination[1] / 100) + (Math.random() - 0.5) * 28;
      coin.style.left = `${startX}px`;
      coin.style.top = `${startY}px`;
      document.body.append(coin);

      const delay = index * 70;
      const animation = coin.animate([
        { transform: "translate3d(0,0,0) scale(0.7) rotate(0deg)", opacity: 0 },
        { transform: `translate3d(${(endX - startX) * 0.38}px, ${-120 - Math.random() * 45}px, 0) scale(1.2) rotate(180deg)`, opacity: 1, offset: 0.42 },
        { transform: `translate3d(${endX - startX}px, ${endY - startY}px, 0) scale(0.6) rotate(540deg)`, opacity: 1 },
      ], {
        duration: 760 + Math.random() * 180,
        delay,
        easing: "cubic-bezier(.25,.65,.25,1)",
        fill: "forwards",
      });
      animation.onfinish = () => {
        coin.remove();
        sparkleAt(destination[0], destination[1]);
        if (index === count - 1) {
          animateTreeImpact();
          playCoinSound();
        }
      };
    }
  }

  function animateJackpotValue(previousValue, nextValue) {
    const start = performance.now();
    const duration = 620;
    function frame(now) {
      const elapsed = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      els.jackpotValue.textContent = formatWon(previousValue + (nextValue - previousValue) * eased);
      if (elapsed < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function updateFeed(player, amount, delta) {
    els.feedText.textContent = player === "내 베팅"
      ? `내가 ${formatWon(amount)} 베팅 · 나무가 더 빛납니다`
      : `${player}님이 ${formatWon(amount)} 베팅 · 나무가 더 빛납니다`;
    els.feedPlus.textContent = `+${delta.toFixed(1)}%`;
    els.communityFeed.classList.remove("is-updated");
    void els.communityFeed.offsetWidth;
    els.communityFeed.classList.add("is-updated");
  }

  function applyCommunityBet(event, options = {}) {
    if (state.processedEvents.has(event.id)) return;
    state.processedEvents.add(event.id);
    if (state.processedEvents.size > 120) {
      state.processedEvents = new Set(Array.from(state.processedEvents).slice(-60));
    }

    const previousJackpot = state.jackpot;
    state.jackpot += event.contribution;
    state.progress = Math.min(100, state.progress + event.delta);
    const startFruitIndex = state.fruitCount;
    const availableFruitSlots = MAX_FRUIT_COUNT - state.fruitCount;
    const fruitGain = Math.min(availableFruitSlots, fruitGainForBet(event.amount));

    animateJackpotValue(previousJackpot, state.jackpot);
    animateCoinsToTree(event.amount, Boolean(event.local), startFruitIndex, fruitGain);
    if (fruitGain > 0) {
      state.fruitCount += fruitGain;
      for (let offset = 0; offset < fruitGain; offset += 1) {
        window.setTimeout(() => {
          addFruitAt(startFruitIndex + offset, true);
          if (offset === fruitGain - 1) saveSharedState();
        }, 560 + offset * 125);
      }
    }

    updateFeed(event.player, event.amount, event.delta);
    renderProgress();
    saveSharedState();

    if (!options.remote && state.channel) {
      state.channel.postMessage({ type: "community-bet", payload: { ...event, local: false } });
    }

    if (state.progress >= 100) {
      window.setTimeout(() => triggerJackpot(event.player), 980);
    }
  }

  function makeBetEvent(player, amount, local = false) {
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      player,
      amount,
      contribution: Math.max(70, Math.round(amount * 0.085)),
      delta: Number((0.26 + Math.sqrt(amount) / 70).toFixed(2)),
      local,
    };
  }

  async function spinReels(bet) {
    const reels = Array.from(els.reels.querySelectorAll(".reel"));
    const finalGrid = Array.from({ length: 5 }, () => Array.from({ length: 3 }, randomSymbol));
    const forcedWin = Math.random() < 0.28;
    if (forcedWin) {
      const winner = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
      const length = Math.random() < 0.18 ? 4 : 3;
      for (let column = 0; column < length; column += 1) finalGrid[column][1] = winner;
    }

    reels.forEach((reel) => reel.classList.add("is-spinning"));
    const shuffleTimer = window.setInterval(() => {
      reels.forEach((reel) => {
        reel.querySelectorAll(".symbol").forEach((cell) => updateSymbol(cell, randomSymbol()));
      });
      playTone(120 + Math.random() * 35, 0.03, "square", 0.008);
    }, 80);

    await new Promise((resolve) => window.setTimeout(resolve, 650));
    for (let column = 0; column < reels.length; column += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      reels[column].classList.remove("is-spinning");
      reels[column].querySelectorAll(".symbol").forEach((cell, row) => updateSymbol(cell, finalGrid[column][row]));
      playTone(220 + column * 45, 0.06, "triangle", 0.025);
    }
    window.clearInterval(shuffleTimer);
    return evaluateGrid(finalGrid, bet);
  }

  function evaluateGrid(grid, bet) {
    let bestWin = 0;
    let winningCells = [];
    for (let row = 0; row < 3; row += 1) {
      const firstMark = grid[0][row].mark;
      let count = 1;
      while (count < 5 && grid[count][row].mark === firstMark) count += 1;
      if (count >= 3) {
        const symbol = SYMBOLS.find((candidate) => candidate.mark === firstMark);
        const win = Math.round(bet * symbol.multiplier * (count === 4 ? 1.8 : count === 5 ? 4 : 1));
        if (win > bestWin) {
          bestWin = win;
          winningCells = Array.from({ length: count }, (_, column) => [column, row]);
        }
      }
    }
    return { amount: bestWin, cells: winningCells };
  }

  function showWin(result) {
    els.reels.querySelectorAll(".symbol").forEach((cell) => cell.classList.remove("is-winner"));
    els.winLine.classList.remove("is-visible");
    if (result.amount <= 0) {
      els.resultMessage.textContent = "아쉽지만 나무는 더 풍성해졌어요";
      return;
    }

    result.cells.forEach(([column, row]) => {
      const reel = els.reels.children[column];
      reel.children[row].classList.add("is-winner");
    });
    els.winLine.classList.add("is-visible");
    state.balance += result.amount;
    els.resultMessage.textContent = `당첨 ${formatWon(result.amount)}!`;
    showToast(`황금 당첨 +${formatWon(result.amount)}`);
    renderMoney();
    [523, 659, 784, 1047].forEach((frequency, index) => playTone(frequency, 0.3, "sine", 0.035, index * 0.09));
  }

  async function placeBet() {
    if (state.spinning) return;
    const bet = BET_LEVELS[state.betIndex];
    if (state.balance < bet) {
      state.balance = 125000;
      showToast("데모 코인이 충전되었습니다");
      renderMoney();
      return;
    }

    state.spinning = true;
    state.balance -= bet;
    els.spinButton.disabled = true;
    els.spinButton.classList.add("is-firing");
    els.resultMessage.textContent = "황금 기운을 보내는 중…";
    renderMoney();
    showToast(`${formatWon(bet)} 베팅 · 황금 열매 +${fruitGainForBet(bet)}`);
    applyCommunityBet(makeBetEvent("내 베팅", bet, true));

    const result = await spinReels(bet);
    showWin(result);
    state.spinning = false;
    els.spinButton.disabled = false;
    els.spinButton.classList.remove("is-firing");
  }

  function createConfetti() {
    const colors = ["#ffe96c", "#ff8b36", "#f04743", "#78e8bc", "#fff7c2"];
    for (let index = 0; index < 90; index += 1) {
      const piece = document.createElement("i");
      piece.className = "confetti";
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colors[index % colors.length];
      piece.style.transform = `rotate(${Math.random() * 180}deg)`;
      document.body.append(piece);
      const drift = (Math.random() - 0.5) * 260;
      const animation = piece.animate([
        { transform: `translate3d(0,-20px,0) rotate(0deg)`, opacity: 1 },
        { transform: `translate3d(${drift}px,${window.innerHeight + 80}px,0) rotate(${720 + Math.random() * 720}deg)`, opacity: 0.85 },
      ], { duration: 2300 + Math.random() * 2200, delay: Math.random() * 550, easing: "cubic-bezier(.15,.65,.35,1)" });
      animation.onfinish = () => piece.remove();
    }
  }

  function triggerJackpot(lastPlayer) {
    if (els.jackpotBurst.classList.contains("is-visible")) return;
    const winner = lastPlayer === "내 베팅" && Math.random() < 0.45
      ? "내가 커뮤니티 잭팟의 주인공입니다!"
      : `${PLAYERS[Math.floor(Math.random() * PLAYERS.length)]}님 당첨!`;
    els.winnerName.textContent = winner;
    els.jackpotBurst.classList.add("is-visible");
    createConfetti();
    [262, 330, 392, 523, 659, 784].forEach((frequency, index) => playTone(frequency, 0.5, "triangle", 0.05, index * 0.1));

    window.setTimeout(() => {
      els.jackpotBurst.classList.remove("is-visible");
      state.progress = 68 + Math.random() * 4;
      state.jackpot = 10000000 + Math.round(Math.random() * 900000);
      state.fruitCount = 5;
      renderAll();
      saveSharedState();
      if (state.channel) state.channel.postMessage({ type: "jackpot-reset", payload: {
        progress: state.progress,
        jackpot: state.jackpot,
        fruitCount: state.fruitCount,
      } });
    }, 4200);
  }

  function simulateCommunityBet() {
    if (!document.hidden && !els.jackpotBurst.classList.contains("is-visible")) {
      const player = PLAYERS[Math.floor(Math.random() * PLAYERS.length)];
      const amount = BET_LEVELS[Math.floor(Math.random() * BET_LEVELS.length)];
      applyCommunityBet(makeBetEvent(player, amount));
      const onlineDelta = Math.random() > 0.5 ? 1 : -1;
      const currentOnline = Number(els.onlineCount.textContent) || 24;
      els.onlineCount.textContent = String(Math.min(31, Math.max(18, currentOnline + onlineDelta)));
    }
    window.setTimeout(simulateCommunityBet, 2500 + Math.random() * 2900);
  }

  function bindLiveChannel() {
    if (!state.channel) return;
    state.channel.addEventListener("message", (message) => {
      if (message.data?.type === "community-bet") {
        applyCommunityBet(message.data.payload, { remote: true });
      }
      if (message.data?.type === "jackpot-reset") {
        Object.assign(state, message.data.payload);
        renderAll();
        saveSharedState();
      }
      if (message.data?.type === "state-request") {
        state.channel.postMessage({ type: "state-response", payload: {
          progress: state.progress,
          jackpot: state.jackpot,
          fruitCount: state.fruitCount,
        } });
      }
      if (message.data?.type === "state-response" && message.data.payload.jackpot > state.jackpot) {
        state.progress = message.data.payload.progress;
        state.jackpot = message.data.payload.jackpot;
        state.fruitCount = message.data.payload.fruitCount;
        renderAll();
      }
    });
    state.channel.postMessage({ type: "state-request" });
  }

  els.betMinus.addEventListener("click", () => setBetIndex(state.betIndex - 1));
  els.betPlus.addEventListener("click", () => setBetIndex(state.betIndex + 1));
  els.spinButton.addEventListener("click", placeBet);
  els.soundButton.addEventListener("click", async () => {
    state.soundOn = !state.soundOn;
    els.soundButton.setAttribute("aria-pressed", String(state.soundOn));
    els.soundButton.setAttribute("aria-label", state.soundOn ? "사운드 끄기" : "사운드 켜기");
    if (state.soundOn) {
      playTone(523, 0.12, "sine", 0.04);
      playTone(784, 0.18, "sine", 0.035, 0.08);
    }
  });

  buildReels();
  renderAll();
  setBetIndex(state.betIndex);
  bindLiveChannel();
  window.setTimeout(simulateCommunityBet, 1800);
})();
