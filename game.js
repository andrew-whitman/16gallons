const SIZE = 4;
const WIN_VALUE = 2048;
const BEST_SCORE_KEY = "16gallons-best-score";

const VOLUME_LABELS = {
  2: "2 tbsp",
  4: "4 tbsp",
  8: "8 tbsp",
  16: "1 pint",
  32: "1 quart",
  64: "½ gallon",
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
const overlayEl = document.getElementById("overlay");
const overlayMessageEl = document.getElementById("overlay-message");
const overlayActionBtn = document.getElementById("overlay-action");

let grid = createEmptyGrid();
let tiles = [];
let score = 0;
let bestScore = Number(localStorage.getItem(BEST_SCORE_KEY)) || 0;
let hasWon = false;
let isGameOver = false;
let touchStart = null;

bestScoreEl.textContent = String(bestScore);

initBoardCells();
startGame();
bindEvents();

function createEmptyGrid() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
}

function initBoardCells() {
  boardEl.innerHTML = "";
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
  isGameOver = false;
  hideOverlay();
  updateScore(0);
  boardEl.querySelectorAll(".tile").forEach((tile) => tile.remove());
  spawnTile();
  spawnTile();
  render();
}

function bindEvents() {
  newGameBtn.addEventListener("click", startGame);
  overlayActionBtn.addEventListener("click", handleOverlayAction);
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
  const keyMap = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
  };

  const direction = keyMap[event.key];
  if (!direction) return;

  event.preventDefault();
  move(direction);
}

function handleOverlayAction() {
  if (isGameOver) {
    startGame();
    return;
  }

  if (hasWon) {
    hideOverlay();
  }
}

function move(direction) {
  if (isGameOver) return;

  const vectors = {
    up: { row: -1, col: 0 },
    down: { row: 1, col: 0 },
    left: { row: 0, col: -1 },
    right: { row: 0, col: 1 },
  };

  const vector = vectors[direction];
  const traversal = buildTraversal(vector);
  let moved = false;

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

  spawnTile();
  render();

  if (!canMove()) {
    isGameOver = true;
    showOverlay("Game over!", "Try Again");
  } else if (hasWon) {
    showOverlay("You reached 16 gallons!", "Keep Going");
  }
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
  const value = Math.random() < 0.9 ? 2 : 4;
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
  score = nextScore;
  scoreEl.textContent = String(score);

  if (score > bestScore) {
    bestScore = score;
    bestScoreEl.textContent = String(bestScore);
    localStorage.setItem(BEST_SCORE_KEY, String(bestScore));
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
