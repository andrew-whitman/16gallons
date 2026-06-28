const SIZE = 4;
const WIN_VALUE = 2048;
const BEST_SCORE_KEY = "16gallons-best-score";
const THEME_KEY = "16gallons-theme";

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
const statusAnnouncerEl = document.getElementById("status-announcer");

let waterEl;
let appEl;
let undoState = null;
let previousMaxTile = 0;

let grid = createEmptyGrid();
let tiles = [];
let score = 0;
let bestScore = Number(localStorage.getItem(BEST_SCORE_KEY)) || 0;
let hasWon = false;
let keepPlaying = false;
let isGameOver = false;
let touchStart = null;

bestScoreEl.textContent = String(bestScore);

initTheme();
initBoardCells();
renderConversionGuide();
initSidebar();
startGame();
bindEvents();

function createEmptyGrid() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
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

function initBoardCells() {
  boardEl.innerHTML = "";

  waterEl = document.createElement("div");
  waterEl.id = "water";
  waterEl.className = "water";
  waterEl.setAttribute("aria-hidden", "true");
  waterEl.innerHTML = `<div class="water__fill"></div>`;
  boardEl.appendChild(waterEl);

  for (let i = 0; i < SIZE * SIZE; i += 1) {
    const cell = document.createElement("div");
    cell.className = "cell";
    boardEl.appendChild(cell);
  }
}

function startGame() {
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
  announce("New game started.");
}

function requestNewGame() {
  if (score > 0 || hasWon || isGameOver) {
    const confirmed = window.confirm(
      "Start a new game? Your current progress will be lost.",
    );
    if (!confirmed) return;
  }

  startGame();
}

function bindEvents() {
  newGameBtn.addEventListener("click", requestNewGame);
  undoBtn.addEventListener("click", performUndo);
  overlayActionBtn.addEventListener("click", handleOverlayAction);
  themeToggleBtn.addEventListener("click", toggleTheme);
  sidebarOpenBtn.addEventListener("click", openSidebar);
  sidebarCloseBtn.addEventListener("click", closeSidebar);
  sidebarBackdropEl.addEventListener("click", closeSidebar);
  window.addEventListener("keydown", handleKeydown, { passive: false });

  boardEl.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length !== 1) return;
      touchStart = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
      };
    },
    { passive: true },
  );

  boardEl.addEventListener(
    "touchend",
    (event) => {
      if (!touchStart || event.changedTouches.length !== 1) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - touchStart.x;
      const dy = touch.clientY - touchStart.y;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      if (Math.max(absX, absY) < 24) {
        touchStart = null;
        return;
      }

      if (absX > absY) {
        move(dx > 0 ? "right" : "left");
      } else {
        move(dy > 0 ? "down" : "up");
      }

      touchStart = null;
    },
    { passive: true },
  );
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
    startGame();
    return;
  }

  if (hasWon) {
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

  for (let i = 0; i < SIZE; i += 1) {
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
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

function spawnTile() {
  const emptyCells = [];

  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
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
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
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
    bestScore = nextScore;
    bestScoreEl.textContent = String(bestScore);
    localStorage.setItem(BEST_SCORE_KEY, String(bestScore));
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

function updateWaterLevel() {
  const maxTile = getMaxTile();
  waterEl.style.setProperty("--water-height", `${waterFillPercent(maxTile)}%`);
}

function render() {
  const boardRect = boardEl.getBoundingClientRect();
  const gap = 12;
  const cellSize = (boardRect.width - gap * (SIZE + 1)) / SIZE;

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

    element.className = `tile tile--${tile.value}`;
    element.textContent = volumeLabel(tile.value);

    if (tile.isNew) element.classList.add("tile--new");
    if (tile.mergedFrom) element.classList.add("tile--merged");

    element.style.width = `${cellSize}px`;
    element.style.height = `${cellSize}px`;
    element.style.top = `${gap + tile.row * (cellSize + gap)}px`;
    element.style.left = `${gap + tile.col * (cellSize + gap)}px`;
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

window.addEventListener("resize", render);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
