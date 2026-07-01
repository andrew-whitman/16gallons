const WIN_VALUE = 2048;
const BEST_SCORE_KEY = "16gallons-best-score";
const THEME_KEY = "16gallons-theme";
const DIFFICULTY_KEY = "16gallons-difficulty";
const DIFFICULTY_SIZES = {
  hard: 4,
  easy: 5,
};

function trackEvent(name, properties = {}) {
  if (typeof posthog === "undefined") return;
  posthog.capture(name, properties);
}

function gameEventProperties(extra = {}) {
  return {
    difficulty,
    board_size: boardSize,
    ...extra,
  };
}

function trackGameEvent(name, properties = {}) {
  trackEvent(name, gameEventProperties(properties));
}

function syncAnalyticsContext() {
  if (typeof posthog === "undefined") return;

  const context = {
    difficulty,
    board_size: boardSize,
  };

  posthog.register(context);
  posthog.register_for_session(context);
  posthog.setPersonProperties({
    last_difficulty: difficulty,
    last_board_size: boardSize,
  });
}

const VOLUME_LABELS = {
  1: "1 fl oz",
  2: "4 tbsp",
  4: "1/2 cup",
  8: "1 cup",
  16: "1 pint",
  32: "1 quart",
  64: "1/2 gallon",
  128: "1 gallon",
  256: "2 gallons",
  512: "4 gallons",
  1024: "8 gallons",
  2048: "16 gallons",
  4096: "32 gallons",
  8192: "64 gallons",
  16384: "128 gallons",
  32768: "256 gallons",
};

const boardEl = document.getElementById("board");
const scoreEl = document.getElementById("score");
const bestScoreEl = document.getElementById("best-score");
const newGameBtn = document.getElementById("new-game");
const undoBtn = document.getElementById("undo");
const overlayEl = document.getElementById("overlay");
const overlayMessageEl = document.getElementById("overlay-message");
const overlayActionBtn = document.getElementById("overlay-action");
const sidebarEl = document.getElementById("sidebar");
const sidebarOpenBtn = document.getElementById("sidebar-open");
const sidebarCloseBtn = document.getElementById("sidebar-close");
const sidebarBackdropEl = document.getElementById("sidebar-backdrop");
const conversionListEl = document.getElementById("conversion-list");
const themeToggleBtn = document.getElementById("theme-toggle");
const difficultyHardBtn = document.getElementById("difficulty-hard");
const difficultyEasyBtn = document.getElementById("difficulty-easy");
const statusAnnouncerEl = document.getElementById("status-announcer");

let waterEl;
let appEl;
let undoState = null;
let previousMaxTile = 0;
let difficulty = loadDifficulty();
let boardSize = DIFFICULTY_SIZES[difficulty];

let grid = createEmptyGrid();
let tiles = [];
let score = 0;
let bestScore = 0;
let hasWon = false;
let keepPlaying = false;
let isGameOver = false;
let touchStart = null;
let touchLocked = false;
let boardMetrics = null;

const SWIPE_THRESHOLD = 16;
const BOARD_GAP = 12;

bestScoreEl.textContent = String(bestScore);

initTheme();
loadBestScore();
syncAnalyticsContext();
initBoardCells();
updateDifficultyToggle();
renderConversionGuide();
initSidebar();
startGame("initial");
bindEvents();

function loadDifficulty() {
  const stored = localStorage.getItem(DIFFICULTY_KEY);

  if (stored === "easy") {
    return "easy";
  }

  if (stored === "normal") {
    localStorage.setItem(DIFFICULTY_KEY, "hard");
    return "hard";
  }

  return "hard";
}

function migrateBestScoreKey(fromDifficulty, toDifficulty) {
  const fromKey = `${BEST_SCORE_KEY}-${fromDifficulty}`;
  const toKey = `${BEST_SCORE_KEY}-${toDifficulty}`;
  const fromScore = Number(localStorage.getItem(fromKey)) || 0;
  const toScore = Number(localStorage.getItem(toKey)) || 0;

  if (fromScore > toScore) {
    localStorage.setItem(toKey, String(fromScore));
  }

  localStorage.removeItem(fromKey);
}

function bestScoreStorageKey() {
  return `${BEST_SCORE_KEY}-${difficulty}`;
}

function loadBestScore() {
  migrateBestScoreKey("normal", "hard");

  let storedScore = Number(localStorage.getItem(bestScoreStorageKey())) || 0;

  if (!storedScore && difficulty === "hard") {
    const legacyScore = Number(localStorage.getItem(BEST_SCORE_KEY)) || 0;
    if (legacyScore) {
      storedScore = legacyScore;
      localStorage.setItem(bestScoreStorageKey(), String(legacyScore));
    }
  }

  bestScore = storedScore;
  bestScoreEl.textContent = String(bestScore);
}

function createEmptyGrid() {
  return Array.from({ length: boardSize }, () => Array(boardSize).fill(null));
}

function initTheme() {
  updateThemeToggle(getTheme());
}

function getTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  updateThemeToggle(theme);
  trackEvent("theme_changed", { theme });
}

function toggleTheme() {
  setTheme(getTheme() === "dark" ? "light" : "dark");
}

function updateThemeToggle(theme) {
  const isDark = theme === "dark";
  themeToggleBtn.setAttribute("aria-pressed", String(isDark));
  themeToggleBtn.setAttribute(
    "aria-label",
    isDark ? "Switch to light theme" : "Switch to dark theme",
  );
}

function updateDifficultyToggle() {
  const isEasy = difficulty === "easy";
  difficultyHardBtn.setAttribute("aria-checked", String(!isEasy));
  difficultyEasyBtn.setAttribute("aria-checked", String(isEasy));
}

function requestDifficultyChange(nextDifficulty) {
  if (nextDifficulty === difficulty) return;

  if (score > 0 || hasWon || isGameOver) {
    const confirmed = window.confirm(
      "Switch board size? Your current progress will be lost.",
    );
    if (!confirmed) return;
  }

  setDifficulty(nextDifficulty);
}

function setDifficulty(nextDifficulty) {
  difficulty = nextDifficulty;
  boardSize = DIFFICULTY_SIZES[difficulty];
  localStorage.setItem(DIFFICULTY_KEY, difficulty);
  updateDifficultyToggle();
  syncAnalyticsContext();
  loadBestScore();
  initBoardCells();
  trackGameEvent("difficulty_changed");
  startGame("difficulty_change");
}

function initBoardCells() {
  boardEl.innerHTML = "";
  boardEl.style.setProperty("--board-size", String(boardSize));
  invalidateBoardMetrics();

  waterEl = document.createElement("div");
  waterEl.id = "water";
  waterEl.className = "water";
  waterEl.setAttribute("aria-hidden", "true");
  waterEl.innerHTML = `<div class="water__fill"></div>`;
  boardEl.appendChild(waterEl);

  for (let i = 0; i < boardSize * boardSize; i += 1) {
    const cell = document.createElement("div");
    cell.className = "cell";
    boardEl.appendChild(cell);
  }
}

function startGame(source = "unknown") {
  grid = createEmptyGrid();
  tiles = [];
  score = 0;
  hasWon = false;
  keepPlaying = false;
  isGameOver = false;
  undoState = null;
  previousMaxTile = 0;
  hideOverlay();
  updateScore(0);
  updateUndoButton();
  boardEl.querySelectorAll(".tile").forEach((tile) => tile.remove());
  spawnTile();
  spawnTile();
  render();
  trackGameEvent("game_started", { source });
  announce("New game started.");
}

function requestNewGame() {
  if (score > 0 || hasWon || isGameOver) {
    const confirmed = window.confirm(
      "Start a new game? Your current progress will be lost.",
    );
    if (!confirmed) return;
  }

  startGame("new_game");
}

function bindEvents() {
  newGameBtn.addEventListener("click", requestNewGame);
  undoBtn.addEventListener("click", performUndo);
  overlayActionBtn.addEventListener("click", handleOverlayAction);
  themeToggleBtn.addEventListener("click", toggleTheme);
  difficultyHardBtn.addEventListener("click", () =>
    requestDifficultyChange("hard"),
  );
  difficultyEasyBtn.addEventListener("click", () =>
    requestDifficultyChange("easy"),
  );
  sidebarOpenBtn.addEventListener("click", openSidebar);
  sidebarCloseBtn.addEventListener("click", closeSidebar);
  sidebarBackdropEl.addEventListener("click", closeSidebar);
  window.addEventListener("keydown", handleKeydown, { passive: false });

  boardEl.addEventListener("touchstart", handleTouchStart, { passive: true });
  boardEl.addEventListener("touchmove", handleTouchMove, { passive: false });
  boardEl.addEventListener("touchend", handleTouchEnd, { passive: true });
  boardEl.addEventListener("touchcancel", handleTouchCancel, { passive: true });

  if (typeof ResizeObserver !== "undefined") {
    const boardObserver = new ResizeObserver(() => {
      invalidateBoardMetrics();
      render();
    });
    boardObserver.observe(boardEl);
  } else {
    window.addEventListener("resize", () => {
      invalidateBoardMetrics();
      render();
    });
  }
}

function handleTouchStart(event) {
  if (event.touches.length !== 1) return;
  touchLocked = false;
  touchStart = {
    x: event.touches[0].clientX,
    y: event.touches[0].clientY,
  };
}

function handleTouchMove(event) {
  if (!touchStart || touchLocked || event.touches.length !== 1) return;

  const touch = event.touches[0];
  const dx = touch.clientX - touchStart.x;
  const dy = touch.clientY - touchStart.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (Math.max(absX, absY) < SWIPE_THRESHOLD) return;

  event.preventDefault();
  touchLocked = true;
  touchStart = null;
  performSwipe(dx, dy);
}

function handleTouchEnd(event) {
  if (touchLocked) {
    touchLocked = false;
    touchStart = null;
    return;
  }

  if (!touchStart || event.changedTouches.length !== 1) {
    touchStart = null;
    return;
  }

  const touch = event.changedTouches[0];
  const dx = touch.clientX - touchStart.x;
  const dy = touch.clientY - touchStart.y;
  touchStart = null;

  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;

  performSwipe(dx, dy);
}

function handleTouchCancel() {
  touchStart = null;
  touchLocked = false;
}

function performSwipe(dx, dy) {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (absX > absY) {
    move(dx > 0 ? "right" : "left");
  } else {
    move(dy > 0 ? "down" : "up");
  }
}

function handleKeydown(event) {
  if (event.key === "Escape") {
    const sidebarVisible = isDesktopSidebar()
      ? !appEl.classList.contains("app--sidebar-collapsed")
      : sidebarEl.classList.contains("sidebar--open");

    if (sidebarVisible) {
      closeSidebar();
      return;
    }
  }

  const keyMap = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    W: "up",
    s: "down",
    S: "down",
    a: "left",
    A: "left",
    d: "right",
    D: "right",
  };

  const direction = keyMap[event.key];
  if (!direction) return;

  event.preventDefault();
  move(direction);
}

function announce(message) {
  statusAnnouncerEl.textContent = "";
  requestAnimationFrame(() => {
    statusAnnouncerEl.textContent = message;
  });
}

function captureState() {
  return {
    grid: grid.map((row) =>
      row.map((cell) => (cell ? { ...cell, mergedFrom: null } : null)),
    ),
    tiles: tiles.map((tile) => ({ ...tile, mergedFrom: null })),
    score,
    hasWon,
    keepPlaying,
    isGameOver,
    previousMaxTile,
  };
}

function restoreState(state) {
  grid = state.grid.map((row) =>
    row.map((cell) => (cell ? { ...cell } : null)),
  );
  tiles = state.tiles.map((tile) => ({ ...tile }));
  score = state.score;
  hasWon = state.hasWon;
  keepPlaying = state.keepPlaying;
  isGameOver = state.isGameOver;
  previousMaxTile = state.previousMaxTile;
  scoreEl.textContent = String(score);
  hideOverlay();
}

function performUndo() {
  if (!undoState) return;

  const restored = undoState;
  undoState = null;
  restoreState(restored);
  updateUndoButton();
  render();
  trackGameEvent("undo_used", { score });
  announce(`Move undone. Score ${score}.`);
}

function updateUndoButton() {
  undoBtn.disabled = !undoState;
}

function renderConversionGuide() {
  conversionListEl.innerHTML = "";

  Object.entries(VOLUME_LABELS).forEach(([value, label]) => {
    const numericValue = Number(value);
    const item = document.createElement("li");
    item.className = "conversion-item";

    const swatch = document.createElement("span");
    swatch.className = `conversion-swatch tile--${value}`;
    swatch.setAttribute("aria-hidden", "true");

    const content = document.createElement("div");
    content.className = "conversion-content";

    const volumeLabelEl = document.createElement("span");
    volumeLabelEl.className = "conversion-label";
    volumeLabelEl.textContent = label;

    const flOz = document.createElement("span");
    flOz.className = "conversion-oz";
    flOz.textContent = formatFlOz(numericValue);

    content.append(volumeLabelEl, flOz);
    item.append(swatch, content);
    item.setAttribute(
      "aria-label",
      `${label}, ${formatFlOz(numericValue)}`,
    );
    conversionListEl.appendChild(item);
  });
}

function formatFlOz(value) {
  return value === 1 ? "1 fl oz" : `${value} fl oz`;
}

function openSidebar() {
  if (isDesktopSidebar()) {
    sidebarEl.classList.remove("sidebar--collapsed");
    appEl.classList.remove("app--sidebar-collapsed");
  } else {
    sidebarEl.classList.add("sidebar--open");
    sidebarBackdropEl.hidden = false;
    document.body.classList.add("sidebar-visible");
  }

  sidebarOpenBtn.setAttribute("aria-expanded", "true");
}

function closeSidebar() {
  if (isDesktopSidebar()) {
    sidebarEl.classList.add("sidebar--collapsed");
    appEl.classList.add("app--sidebar-collapsed");
  } else {
    sidebarEl.classList.remove("sidebar--open");
    sidebarBackdropEl.hidden = true;
    document.body.classList.remove("sidebar-visible");
  }

  sidebarOpenBtn.setAttribute("aria-expanded", "false");
}

function initSidebar() {
  appEl = document.querySelector(".app");

  if (isDesktopSidebar()) {
    sidebarOpenBtn.setAttribute("aria-expanded", "true");
  }

  window
    .matchMedia("(min-width: 900px)")
    .addEventListener("change", handleSidebarBreakpoint);
}

function handleSidebarBreakpoint(event) {
  sidebarEl.classList.remove("sidebar--open", "sidebar--collapsed");
  appEl.classList.remove("app--sidebar-collapsed");
  sidebarBackdropEl.hidden = true;
  document.body.classList.remove("sidebar-visible");
  sidebarOpenBtn.setAttribute(
    "aria-expanded",
    event.matches ? "true" : "false",
  );
}

function isDesktopSidebar() {
  return window.matchMedia("(min-width: 900px)").matches;
}

function handleOverlayAction() {
  if (isGameOver) {
    startGame("retry");
    return;
  }

  if (hasWon) {
    trackGameEvent("keep_playing", { score });
    keepPlaying = true;
    hideOverlay();
    announce("Continuing after reaching 16 gallons.");
  }
}

function move(direction) {
  if (isGameOver) return;

  const snapshot = captureState();

  const vectors = {
    up: { row: -1, col: 0 },
    down: { row: 1, col: 0 },
    left: { row: 0, col: -1 },
    right: { row: 0, col: 1 },
  };

  const vector = vectors[direction];
  const traversal = buildTraversal(vector);
  let moved = false;
  let mergeMessage = null;

  tiles.forEach((tile) => {
    tile.mergedFrom = null;
    tile.isNew = false;
  });

  traversal.forEach(({ row, col }) => {
    const tile = grid[row][col];
    if (!tile) return;

    const { farthest, next } = findFarthestPosition(row, col, vector);
    const nextTile = next ? grid[next.row][next.col] : null;

    if (
      nextTile &&
      nextTile.value === tile.value &&
      !nextTile.mergedFrom &&
      !tile.mergedFrom
    ) {
      const merged = {
        id: tile.id,
        value: tile.value * 2,
        row: next.row,
        col: next.col,
        isNew: false,
        mergedFrom: [tile, nextTile],
      };

      grid[row][col] = null;
      grid[next.row][next.col] = merged;
      removeTile(tile);
      removeTile(nextTile);
      tiles.push(merged);
      updateScore(score + merged.value);
      mergeMessage = `Merged to ${volumeLabel(merged.value)}. Score ${score}.`;

      if (merged.value === WIN_VALUE) {
        hasWon = true;
        trackGameEvent("game_won", { score });
      }

      moved = true;
      return;
    }

    if (farthest.row !== row || farthest.col !== col) {
      grid[row][col] = null;
      grid[farthest.row][farthest.col] = tile;
      tile.row = farthest.row;
      tile.col = farthest.col;
      moved = true;
    }
  });

  if (!moved) return;

  undoState = snapshot;
  updateUndoButton();

  spawnTile();
  render();

  if (mergeMessage) {
    announce(mergeMessage);
  }

  const maxTile = getMaxTile();
  if (maxTile > previousMaxTile) {
    previousMaxTile = maxTile;
    announce(`New highest volume: ${volumeLabel(maxTile)}.`);
  }

  if (!canMove()) {
    isGameOver = true;
    trackGameEvent("game_over", {
      score,
      max_tile: getMaxTile(),
    });
    showOverlay("Game over!", "Try Again");
    announce(`Game over. Final score ${score}.`);
  } else if (hasWon && !keepPlaying) {
    showOverlay("You reached 16 gallons!", "Keep Going");
    announce("You reached 16 gallons!");
  }
}

function getMaxTile() {
  return tiles.reduce((highest, tile) => Math.max(highest, tile.value), 0);
}

function buildTraversal(vector) {
  const rows = [];
  const cols = [];

  for (let i = 0; i < boardSize; i += 1) {
    rows.push(i);
    cols.push(i);
  }

  if (vector.row === 1) rows.reverse();
  if (vector.col === 1) cols.reverse();

  const positions = [];
  rows.forEach((row) => {
    cols.forEach((col) => {
      positions.push({ row, col });
    });
  });

  return positions;
}

function findFarthestPosition(row, col, vector) {
  let previous;
  let current = { row, col };

  do {
    previous = current;
    current = {
      row: previous.row + vector.row,
      col: previous.col + vector.col,
    };
  } while (isWithinBounds(current) && grid[current.row][current.col] === null);

  return {
    farthest: previous,
    next: isWithinBounds(current) ? current : null,
  };
}

function isWithinBounds({ row, col }) {
  return row >= 0 && row < boardSize && col >= 0 && col < boardSize;
}

function spawnTile() {
  const emptyCells = [];

  for (let row = 0; row < boardSize; row += 1) {
    for (let col = 0; col < boardSize; col += 1) {
      if (!grid[row][col]) {
        emptyCells.push({ row, col });
      }
    }
  }

  if (emptyCells.length === 0) return;

  const { row, col } = emptyCells[Math.floor(Math.random() * emptyCells.length)];
  const value = Math.random() < 0.9 ? 1 : 2;
  const tile = {
    id: crypto.randomUUID(),
    value,
    row,
    col,
    isNew: true,
    mergedFrom: null,
  };

  grid[row][col] = tile;
  tiles.push(tile);
}

function canMove() {
  for (let row = 0; row < boardSize; row += 1) {
    for (let col = 0; col < boardSize; col += 1) {
      const tile = grid[row][col];
      if (!tile) return true;

      const neighbors = [
        { row: row + 1, col },
        { row: row - 1, col },
        { row, col: col + 1 },
        { row, col: col - 1 },
      ];

      for (const neighbor of neighbors) {
        if (!isWithinBounds(neighbor)) continue;
        const other = grid[neighbor.row][neighbor.col];
        if (!other || other.value === tile.value) return true;
      }
    }
  }

  return false;
}

function removeTile(tile) {
  tiles = tiles.filter((entry) => entry.id !== tile.id);
}

function updateScore(nextScore) {
  const beatBest = nextScore > bestScore;
  score = nextScore;
  scoreEl.textContent = String(score);

  if (beatBest) {
    const previousBest = bestScore;
    bestScore = nextScore;
    bestScoreEl.textContent = String(bestScore);
    localStorage.setItem(bestScoreStorageKey(), String(bestScore));
    trackGameEvent("best_score_updated", {
      score: nextScore,
      previous_best: previousBest,
    });
    announce(`New best score: ${bestScore}.`);
  }
}

function volumeLabel(value) {
  if (VOLUME_LABELS[value]) {
    return VOLUME_LABELS[value];
  }

  const gallons = value / 128;
  if (Number.isInteger(gallons)) {
    return `${gallons} gallons`;
  }

  return `${value} fl oz`;
}

function waterFillPercent(maxTile) {
  if (maxTile < 1) return 0;

  const minLog = Math.log2(1);
  const maxLog = Math.log2(WIN_VALUE);
  const tileLog = Math.log2(maxTile);

  return Math.min(100, ((tileLog - minLog) / (maxLog - minLog)) * 100);
}

function invalidateBoardMetrics() {
  boardMetrics = null;
}

function measureBoard() {
  const width = boardEl.clientWidth;
  const cellSize = (width - BOARD_GAP * (boardSize + 1)) / boardSize;
  boardMetrics = {
    gap: BOARD_GAP,
    cellSize,
    stride: cellSize + BOARD_GAP,
  };
}

function ensureBoardMetrics() {
  if (!boardMetrics) {
    measureBoard();
  }
}

function updateWaterLevel() {
  const maxTile = getMaxTile();
  waterEl.style.setProperty("--water-height", `${waterFillPercent(maxTile)}%`);
}

function updateTileContent(element, value) {
  let label = element.querySelector(".tile__label");
  let oz = element.querySelector(".tile__oz");

  if (!label) {
    label = document.createElement("span");
    label.className = "tile__label";
    oz = document.createElement("span");
    oz.className = "tile__oz";
    element.replaceChildren(label, oz);
  }

  const kitchenLabel = volumeLabel(value);
  const flOzLabel = formatFlOz(value);

  label.textContent = kitchenLabel;
  oz.textContent = flOzLabel;
  element.setAttribute("aria-label", `${kitchenLabel}, ${flOzLabel}`);
}

function render() {
  ensureBoardMetrics();
  const { gap, cellSize, stride } = boardMetrics;

  const tileElements = new Map(
    [...boardEl.querySelectorAll(".tile")].map((element) => [
      element.dataset.id,
      element,
    ]),
  );

  const activeIds = new Set(tiles.map((tile) => tile.id));

  tileElements.forEach((element, id) => {
    if (!activeIds.has(id)) {
      element.remove();
    }
  });

  tiles.forEach((tile) => {
    let element = tileElements.get(tile.id);

    if (!element) {
      element = document.createElement("div");
      element.className = "tile";
      element.dataset.id = tile.id;
      boardEl.appendChild(element);
    }

    const valueKey = String(tile.value);
    element.className = `tile tile--${tile.value}`;
    if (element.dataset.value !== valueKey) {
      element.dataset.value = valueKey;
      updateTileContent(element, tile.value);
    }

    element.classList.toggle("tile--new", Boolean(tile.isNew));
    element.classList.toggle("tile--merged", Boolean(tile.mergedFrom));

    const x = gap + tile.col * stride;
    const y = gap + tile.row * stride;

    element.style.width = `${cellSize}px`;
    element.style.height = `${cellSize}px`;
    element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  });

  updateWaterLevel();
}

function showOverlay(message, actionLabel) {
  overlayMessageEl.textContent = message;
  overlayActionBtn.textContent = actionLabel;
  overlayEl.classList.remove("hidden");
  overlayEl.setAttribute("aria-hidden", "false");
}

function hideOverlay() {
  overlayEl.classList.add("hidden");
  overlayEl.setAttribute("aria-hidden", "true");
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
