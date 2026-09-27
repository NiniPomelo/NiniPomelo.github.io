(() => {
  "use strict";

  const prefersReducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = matchMedia("(pointer: fine)");
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const randomBetween = (min, max) => Math.random() * (max - min) + min;
  const formatTime = seconds => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
    const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  };

  const StorageManager = (() => {
    const keys = Object.freeze({
      enabled: "portfolioInteractionEnabled",
      found: "portfolioSecretsFound",
      sudokuBest: "portfolioSudokuBestTime",
      snakeBest: "portfolioSnakeHighScore",
      tetrisBest: "portfolioTetrisHighScore"
    });

    const read = (key, fallback = null) => {
      try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : JSON.parse(value);
      } catch (_) {
        return fallback;
      }
    };

    const write = (key, value) => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (_) {
        // Private browsing or a blocked storage policy should not break the site.
      }
    };

    return {
      keys,
      getEnabled: () => read(keys.enabled, null),
      setEnabled: value => write(keys.enabled, Boolean(value)),
      getFound: () => read(keys.found, []),
      setFound: value => write(keys.found, value),
      getNumber: (key, fallback = 0) => Number(read(key, fallback)) || fallback,
      setNumber: (key, value) => write(key, Number(value))
    };
  })();

  /* Add a registry item plus a renderer/game mapping to extend the system. */
  const SecretRegistry = Object.freeze({
    number: Object.freeze({ id: "number", label: "NUMBER", game: "sudoku", weightFound: .6, weightNew: 2 }),
    snake: Object.freeze({ id: "snake", label: "SNAKE", game: "snake", weightFound: .6, weightNew: 2 }),
    block: Object.freeze({ id: "block", label: "BLOCK", game: "tetris", weightFound: .6, weightNew: 2 })
  });

  const UIBridge = (() => {
    const wrapper = document.createElement("div");
    wrapper.dataset.hiddenInteractionSystem = "true";
    wrapper.innerHTML = `
      <aside class="interaction-prompt" id="interactionPrompt" aria-labelledby="interactionPromptTitle" hidden>
        <span class="interaction-prompt__label">OPTIONAL LAYER</span>
        <h2 id="interactionPromptTitle">Hidden interactions?</h2>
        <p>Turn on a small discovery layer. It only controls easter eggs and mini games; the portfolio stays unchanged.</p>
        <div class="interaction-prompt__actions">
          <button class="secret-button secret-button--primary" type="button" data-interaction-choice="on">TURN ON</button>
          <button class="secret-button" type="button" data-interaction-choice="off">KEEP OFF</button>
        </div>
      </aside>
      <aside class="interaction-dock" id="interactionDock" aria-label="Hidden interaction controls" hidden>
        <div class="interaction-dock__meta">
          <span class="interaction-dock__eyebrow">SECRETS</span>
          <span class="interaction-counter" id="interactionCounter" aria-live="polite">0 / 3</span>
        </div>
        <button class="interaction-toggle" id="interactionToggle" type="button" aria-pressed="false" title="Toggle hidden interactions" data-secret-interactive>OFF</button>
      </aside>
      <div class="secret-layer" id="secretLayer" aria-live="polite"></div>
      <div class="secret-toast" id="secretToast" role="status" aria-live="polite"></div>
      <section class="game-overlay" id="gameOverlay" aria-modal="true" role="dialog" aria-labelledby="gameTitle" hidden>
        <div class="secret-game-shell">
          <div class="game-shell__header">
            <div>
              <span class="game-shell__eyebrow" id="gameEyebrow">SECRET 01</span>
              <h2 class="game-shell__title" id="gameTitle">Mini Game</h2>
            </div>
            <div class="game-shell__stats" id="gameStats"></div>
            <button class="game-icon-button" id="gameExit" type="button" aria-label="Exit game" title="Exit game" data-secret-interactive>&times;</button>
          </div>
          <div class="game-mount" id="gameMount"></div>
          <div class="game-pause" id="gamePause" aria-hidden="true">
            <div class="game-pause__panel">
              <h3>Paused</h3>
              <p>The game paused when this tab became inactive.</p>
              <button class="secret-button secret-button--primary" id="gameResume" type="button" data-secret-interactive>RESUME</button>
            </div>
          </div>
        </div>
      </section>`;
    document.body.appendChild(wrapper);

    const elements = {
      prompt: wrapper.querySelector("#interactionPrompt"),
      dock: wrapper.querySelector("#interactionDock"),
      toggle: wrapper.querySelector("#interactionToggle"),
      counter: wrapper.querySelector("#interactionCounter"),
      layer: wrapper.querySelector("#secretLayer"),
      toast: wrapper.querySelector("#secretToast"),
      overlay: wrapper.querySelector("#gameOverlay"),
      gameTitle: wrapper.querySelector("#gameTitle"),
      gameEyebrow: wrapper.querySelector("#gameEyebrow"),
      gameStats: wrapper.querySelector("#gameStats"),
      gameMount: wrapper.querySelector("#gameMount"),
      gameExit: wrapper.querySelector("#gameExit"),
      pause: wrapper.querySelector("#gamePause"),
      resume: wrapper.querySelector("#gameResume")
    };

    let toastTimer = 0;
    const showToast = (message, duration = 3200) => {
      clearTimeout(toastTimer);
      elements.toast.textContent = message;
      elements.toast.classList.add("is-visible");
      toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), duration);
    };

    wrapper.addEventListener("pointerover", event => {
      if (finePointer.matches && event.target.closest("button, .secret-egg")) document.body.classList.add("hovering");
    });
    wrapper.addEventListener("pointerout", event => {
      if (finePointer.matches && event.target.closest("button, .secret-egg")) document.body.classList.remove("hovering");
    });

    return { wrapper, elements, showToast };
  })();

  const InteractionManager = (() => {
    let enabled = false;
    const validSecrets = Object.keys(SecretRegistry);
    const found = new Set(StorageManager.getFound().filter(id => validSecrets.includes(id)));

    const updateUI = () => {
      const { dock, toggle, counter } = UIBridge.elements;
      dock.hidden = false;
      toggle.setAttribute("aria-pressed", String(enabled));
      toggle.textContent = enabled ? "ON" : "OFF";
      counter.textContent = `${found.size} / ${validSecrets.length}`;
      counter.setAttribute("aria-hidden", String(!enabled));
      dock.classList.toggle("is-complete", found.size === validSecrets.length);
    };

    const setEnabled = (value, persist = true) => {
      enabled = Boolean(value);
      if (persist) StorageManager.setEnabled(enabled);
      updateUI();
      if (enabled) EasterEggSpawner.start();
      else EasterEggSpawner.stop();
    };

    const discover = id => {
      if (!SecretRegistry[id]) return false;
      const isNew = !found.has(id);
      if (isNew) {
        found.add(id);
        StorageManager.setFound([...found]);
        updateUI();
        const complete = found.size === validSecrets.length;
        UIBridge.showToast(complete
          ? `SECRET ${found.size} / ${validSecrets.length} FOUND - ALL INTERACTIONS UNLOCKED`
          : `SECRET ${found.size} / ${validSecrets.length} FOUND - ${SecretRegistry[id].label}`);
      }
      return isNew;
    };

    const init = () => {
      const saved = StorageManager.getEnabled();
      updateUI();
      if (saved === null) {
        UIBridge.elements.prompt.hidden = false;
        setEnabled(false, false);
      } else {
        setEnabled(saved, false);
      }

      UIBridge.elements.prompt.addEventListener("click", event => {
        const choice = event.target.closest("[data-interaction-choice]");
        if (!choice) return;
        UIBridge.elements.prompt.hidden = true;
        setEnabled(choice.dataset.interactionChoice === "on");
        UIBridge.elements.toggle.focus();
      });
      UIBridge.elements.toggle.addEventListener("click", () => setEnabled(!enabled));
    };

    return {
      init,
      setEnabled,
      discover,
      isEnabled: () => enabled,
      isFound: id => found.has(id),
      foundCount: () => found.size
    };
  })();

  const EasterEggSpawner = (() => {
    let spawnTimer = 0;
    let activeEgg = null;
    let lifetimeTimer = 0;
    let digitTimer = 0;
    let firstSchedule = true;

    const clearTimers = () => {
      clearTimeout(spawnTimer);
      clearTimeout(lifetimeTimer);
      clearInterval(digitTimer);
      spawnTimer = 0;
      lifetimeTimer = 0;
      digitTimer = 0;
    };

    const chooseSecret = () => {
      const weighted = Object.values(SecretRegistry).map(secret => ({
        secret,
        weight: InteractionManager.isFound(secret.id) ? secret.weightFound : secret.weightNew
      }));
      const total = weighted.reduce((sum, item) => sum + item.weight, 0);
      let roll = Math.random() * total;
      for (const item of weighted) {
        roll -= item.weight;
        if (roll <= 0) return item.secret;
      }
      return weighted[0].secret;
    };

    const overlaps = (a, b, padding = 10) => !(
      a.right + padding < b.left ||
      a.left - padding > b.right ||
      a.bottom + padding < b.top ||
      a.top - padding > b.bottom
    );

    const findSafePosition = () => {
      const size = innerWidth <= 800 ? 48 : 54;
      const edge = innerWidth <= 800 ? 18 : 38;
      const topEdge = innerWidth <= 800 ? 112 : 86;
      const bottomEdge = innerWidth <= 800 ? 76 : 70;
      const maxX = innerWidth - edge - size;
      const maxY = innerHeight - bottomEdge - size;
      if (maxX <= edge || maxY <= topEdge) return null;

      const exclusions = [...document.querySelectorAll(
        "header, a, button, input, select, textarea, canvas, .project-card, .project, .filter-wrap, .contact-actions, .tool-panel, .game-panel, .skill-group, .timeline-item, h1, h2, h3, p, .interaction-dock, .interaction-prompt"
      )].filter(element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      }).map(element => element.getBoundingClientRect());

      for (let attempt = 0; attempt < 64; attempt += 1) {
        const x = randomBetween(edge, maxX);
        const y = randomBetween(topEdge, maxY);
        const candidate = { left: x, top: y, right: x + size, bottom: y + size };
        if (!exclusions.some(rect => overlaps(candidate, rect))) return { x, y, size };
      }
      return null;
    };

    const renderEgg = (button, id) => {
      if (id === "number") {
        button.classList.add("secret-number");
        button.innerHTML = '<span class="secret-number__digit">0</span>';
        const digit = button.firstElementChild;
        let cycles = 0;
        digitTimer = setInterval(() => {
          digit.textContent = Math.floor(Math.random() * 10);
          cycles += 1;
          if (cycles > 10) {
            clearInterval(digitTimer);
            digitTimer = 0;
            digit.textContent = "9";
          }
        }, 72);
      } else if (id === "snake") {
        button.classList.add("secret-snake");
        button.innerHTML = '<span class="secret-snake__body"><i></i><i></i><i></i><i></i></span>';
      } else {
        button.classList.add("secret-block");
        button.innerHTML = '<span class="secret-block__shape"><i></i><i></i><i></i><i></i></span>';
      }
    };

    const removeActive = (scheduleNext = true) => {
      clearTimeout(lifetimeTimer);
      clearInterval(digitTimer);
      lifetimeTimer = 0;
      digitTimer = 0;
      if (activeEgg) {
        const egg = activeEgg;
        activeEgg = null;
        egg.classList.add("is-leaving");
        setTimeout(() => egg.remove(), prefersReducedMotion.matches ? 0 : 360);
      }
      if (scheduleNext && InteractionManager.isEnabled() && !GameManager.isOpen()) schedule(false);
    };

    const spawn = forcedId => {
      clearTimeout(spawnTimer);
      spawnTimer = 0;
      if (!InteractionManager.isEnabled() || document.hidden || GameManager.isOpen() || activeEgg) return false;
      const secret = forcedId && SecretRegistry[forcedId] ? SecretRegistry[forcedId] : chooseSecret();
      const position = findSafePosition();
      firstSchedule = false;
      if (!position) {
        schedule(false);
        return false;
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = "secret-egg";
      button.dataset.secret = secret.id;
      button.setAttribute("aria-label", `Open hidden ${secret.label} interaction`);
      button.style.setProperty("--egg-left", `${position.x}px`);
      button.style.setProperty("--egg-top", `${position.y}px`);
      button.style.width = `${position.size}px`;
      button.style.height = `${position.size}px`;
      renderEgg(button, secret.id);

      const activate = () => {
        removeActive(false);
        InteractionManager.discover(secret.id);
        GameManager.open(secret.game, secret.id);
      };
      button.addEventListener("click", activate, { once: true });
      button.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate();
        }
      });

      if (finePointer.matches && !prefersReducedMotion.matches) {
        button.addEventListener("pointermove", event => {
          const rect = button.getBoundingClientRect();
          const x = clamp((event.clientX - rect.left - rect.width / 2) * .12, -5, 5);
          const y = clamp((event.clientY - rect.top - rect.height / 2) * .12, -5, 5);
          button.style.setProperty("--egg-x", `${x}px`);
          button.style.setProperty("--egg-y", `${y}px`);
        });
        button.addEventListener("pointerleave", () => {
          button.style.setProperty("--egg-x", "0px");
          button.style.setProperty("--egg-y", "0px");
        });
      }

      UIBridge.elements.layer.appendChild(button);
      activeEgg = button;
      requestAnimationFrame(() => button.classList.add("is-visible"));
      lifetimeTimer = setTimeout(() => removeActive(true), randomBetween(8000, 15000));
      return true;
    };

    const schedule = initial => {
      clearTimeout(spawnTimer);
      if (!InteractionManager.isEnabled() || document.hidden || GameManager.isOpen() || activeEgg) return;
      const isInitial = initial ?? firstSchedule;
      const delay = isInitial ? randomBetween(8000, 15000) : randomBetween(15000, 45000);
      spawnTimer = setTimeout(() => spawn(), delay);
    };

    const start = () => {
      if (!spawnTimer && !activeEgg && !document.hidden && !GameManager.isOpen()) schedule(firstSchedule);
    };

    const stop = () => {
      clearTimers();
      removeActive(false);
    };

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        clearTimeout(spawnTimer);
        spawnTimer = 0;
        removeActive(false);
      } else if (InteractionManager.isEnabled() && !GameManager.isOpen()) {
        schedule(false);
      }
    });

    return { start, stop, spawn, schedule, removeActive };
  })();

  const SudokuGame = () => {
    const puzzles = [
      {
        puzzle: "530070000600195000098000060800060003400803001700020006060000280000419005000080079",
        solution: "534678912672195348198342567859761423426853791713924856961537284287419635345286179"
      },
      {
        puzzle: "000260701680070090190004500820100040004602900050003028009300074040050036703018000",
        solution: "435269781682571493197834562826195347374682915951743628519326874248957136763418259"
      }
    ];
    let root;
    let puzzleIndex = 0;
    let puzzle = puzzles[0];
    let values = [];
    let selected = -1;
    let elapsed = 0;
    let timer = 0;
    let paused = false;
    let complete = false;
    let best = StorageManager.getNumber(StorageManager.keys.sudokuBest, 0);

    const updateStats = () => GameManager.setStats([
      ["TIME", formatTime(elapsed)],
      ["BEST", best ? formatTime(best) : "--:--"]
    ]);

    const setStatus = message => {
      const status = root.querySelector(".game-status-line");
      if (status) status.textContent = message;
    };

    const render = () => {
      const board = root.querySelector(".sudoku-board");
      board.innerHTML = "";
      values.forEach((value, index) => {
        const cell = document.createElement("button");
        const fixed = puzzle.puzzle[index] !== "0";
        cell.type = "button";
        cell.className = "sudoku-cell";
        cell.dataset.index = index;
        cell.textContent = value === "0" ? "" : value;
        cell.setAttribute("aria-label", `Row ${Math.floor(index / 9) + 1}, column ${index % 9 + 1}${value !== "0" ? `, ${value}` : ", empty"}`);
        if (fixed) cell.classList.add("is-fixed");
        if (selected >= 0) {
          const row = Math.floor(index / 9);
          const column = index % 9;
          const selectedRow = Math.floor(selected / 9);
          const selectedColumn = selected % 9;
          const selectedValue = values[selected];
          if (row === selectedRow || column === selectedColumn) cell.classList.add("is-peer");
          if (selectedValue !== "0" && value === selectedValue) cell.classList.add("is-match");
          if (index === selected) cell.classList.add("is-selected");
        }
        if (!fixed && value !== "0" && value !== puzzle.solution[index]) cell.classList.add("is-invalid");
        cell.addEventListener("click", () => {
          selected = index;
          render();
        });
        board.appendChild(cell);
      });
    };

    const checkComplete = () => {
      if (values.join("") !== puzzle.solution) return;
      complete = true;
      clearInterval(timer);
      timer = 0;
      if (!best || elapsed < best) {
        best = elapsed;
        StorageManager.setNumber(StorageManager.keys.sudokuBest, best);
      }
      updateStats();
      setStatus("Puzzle complete. Your best time has been saved on this device.");
    };

    const inputValue = value => {
      if (paused || complete || selected < 0 || puzzle.puzzle[selected] !== "0") return;
      values[selected] = value;
      render();
      if (value !== "0" && value !== puzzle.solution[selected]) setStatus("That number conflicts with the solution. Try another value.");
      else setStatus("Use the row and column highlights to compare nearby values.");
      checkComplete();
    };

    const startPuzzle = index => {
      puzzleIndex = index % puzzles.length;
      puzzle = puzzles[puzzleIndex];
      values = puzzle.puzzle.split("");
      selected = values.findIndex(value => value === "0");
      elapsed = 0;
      paused = false;
      complete = false;
      clearInterval(timer);
      timer = setInterval(() => {
        if (!paused && !complete) {
          elapsed += 1;
          updateStats();
        }
      }, 1000);
      updateStats();
      render();
      setStatus("Select an empty cell, then choose a number or use your keyboard.");
    };

    const keyHandler = event => {
      if (event.key >= "1" && event.key <= "9") inputValue(event.key);
      else if (event.key === "Backspace" || event.key === "Delete" || event.key === "0") inputValue("0");
      else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) && selected >= 0) {
        event.preventDefault();
        const moves = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 };
        selected = clamp(selected + moves[event.key], 0, 80);
        render();
        root.querySelector(`[data-index="${selected}"]`)?.focus();
      }
    };

    const mount = mountRoot => {
      root = mountRoot;
      root.innerHTML = `
        <div class="game-layout">
          <div class="game-board-wrap"><div class="sudoku-board" role="grid" aria-label="Sudoku board"></div></div>
          <aside class="game-side">
            <p class="game-side__copy">Fill every row, column and 3 x 3 area with the numbers 1 through 9.</p>
            <div class="sudoku-pad" aria-label="Number pad">
              ${[1,2,3,4,5,6,7,8,9].map(number => `<button class="sudoku-number" type="button" data-number="${number}">${number}</button>`).join("")}
              <button class="sudoku-number" type="button" data-number="0">CLEAR</button>
            </div>
            <div class="game-controls">
              <button class="game-control" type="button" data-action="reset">RESET</button>
              <button class="game-control game-control--accent" type="button" data-action="new">NEW GAME</button>
            </div>
            <div class="game-status-line" role="status"></div>
          </aside>
        </div>`;
      root.querySelector(".sudoku-pad").addEventListener("click", event => {
        const button = event.target.closest("[data-number]");
        if (button) inputValue(button.dataset.number);
      });
      root.querySelector('[data-action="reset"]').addEventListener("click", () => startPuzzle(puzzleIndex));
      root.querySelector('[data-action="new"]').addEventListener("click", () => startPuzzle(puzzleIndex + 1));
      addEventListener("keydown", keyHandler);
      startPuzzle(0);
    };

    return {
      mount,
      pause: () => { paused = true; },
      resume: () => { if (!complete) paused = false; },
      destroy: () => {
        clearInterval(timer);
        removeEventListener("keydown", keyHandler);
      }
    };
  };

  const SnakeGame = () => {
    let root;
    let canvas;
    let context;
    let snake;
    let food;
    let direction;
    let nextDirection;
    let score;
    let best = StorageManager.getNumber(StorageManager.keys.snakeBest, 0);
    let frame = 0;
    let lastStep = 0;
    let paused = false;
    let gameOver = false;
    let destroyed = false;
    let swipeStart = null;
    const cells = 20;
    const size = 400;
    const cell = size / cells;

    const updateStats = () => GameManager.setStats([["SCORE", score], ["BEST", best]]);
    const setStatus = message => { root.querySelector(".game-status-line").textContent = message; };

    const placeFood = () => {
      do {
        food = { x: Math.floor(Math.random() * cells), y: Math.floor(Math.random() * cells) };
      } while (snake.some(segment => segment.x === food.x && segment.y === food.y));
    };

    const draw = () => {
      context.fillStyle = "#0d0c20";
      context.fillRect(0, 0, size, size);
      context.strokeStyle = "rgba(255,255,255,.045)";
      context.lineWidth = 1;
      for (let i = 1; i < cells; i += 1) {
        context.beginPath();
        context.moveTo(i * cell, 0);
        context.lineTo(i * cell, size);
        context.stroke();
        context.beginPath();
        context.moveTo(0, i * cell);
        context.lineTo(size, i * cell);
        context.stroke();
      }
      context.fillStyle = "#ff62b0";
      context.shadowColor = "#ff62b0";
      context.shadowBlur = 14;
      context.fillRect(food.x * cell + 4, food.y * cell + 4, cell - 8, cell - 8);
      context.shadowBlur = 0;
      snake.forEach((segment, index) => {
        context.fillStyle = index === 0 ? "#fff" : `hsl(${176 + index * 2} 72% ${58 - Math.min(index, 12)}%)`;
        context.fillRect(segment.x * cell + 2, segment.y * cell + 2, cell - 4, cell - 4);
      });
    };

    const stopLoop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };

    const finish = () => {
      gameOver = true;
      stopLoop();
      if (score > best) {
        best = score;
        StorageManager.setNumber(StorageManager.keys.snakeBest, best);
      }
      updateStats();
      setStatus("Game over. Restart to try a new route.");
    };

    const step = () => {
      direction = nextDirection;
      const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };
      if (head.x < 0 || head.x >= cells || head.y < 0 || head.y >= cells || snake.some(segment => segment.x === head.x && segment.y === head.y)) {
        finish();
        return;
      }
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) {
        score += 1;
        placeFood();
        updateStats();
      } else {
        snake.pop();
      }
    };

    const loop = timestamp => {
      if (destroyed || paused || gameOver) return;
      if (!lastStep) lastStep = timestamp;
      if (timestamp - lastStep >= Math.max(72, 122 - score * 2)) {
        step();
        lastStep = timestamp;
      }
      draw();
      frame = requestAnimationFrame(loop);
    };

    const startLoop = () => {
      if (!frame && !paused && !gameOver && !destroyed) {
        lastStep = 0;
        frame = requestAnimationFrame(loop);
      }
    };

    const setDirection = newDirection => {
      if (newDirection.x + direction.x === 0 && newDirection.y + direction.y === 0) return;
      nextDirection = newDirection;
    };

    const directions = {
      up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 }
    };

    const togglePause = () => {
      if (gameOver) return;
      paused = !paused;
      if (paused) {
        stopLoop();
        setStatus("Paused. Press Space or PAUSE to continue.");
      } else {
        setStatus("Use arrow keys, WASD, swipe, or the touch pad.");
        startLoop();
      }
    };

    const keyHandler = event => {
      const keyMap = {
        ArrowUp: directions.up, w: directions.up, W: directions.up,
        ArrowDown: directions.down, s: directions.down, S: directions.down,
        ArrowLeft: directions.left, a: directions.left, A: directions.left,
        ArrowRight: directions.right, d: directions.right, D: directions.right
      };
      if (keyMap[event.key]) {
        event.preventDefault();
        setDirection(keyMap[event.key]);
      } else if (event.code === "Space") {
        event.preventDefault();
        togglePause();
      }
    };

    const restart = () => {
      stopLoop();
      snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
      direction = directions.right;
      nextDirection = directions.right;
      score = 0;
      paused = false;
      gameOver = false;
      placeFood();
      updateStats();
      setStatus("Use arrow keys, WASD, swipe, or the touch pad.");
      draw();
      startLoop();
    };

    const pointerDown = event => { swipeStart = { x: event.clientX, y: event.clientY }; };
    const pointerUp = event => {
      if (!swipeStart) return;
      const dx = event.clientX - swipeStart.x;
      const dy = event.clientY - swipeStart.y;
      swipeStart = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
      setDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? directions.right : directions.left) : (dy > 0 ? directions.down : directions.up));
    };

    const mount = mountRoot => {
      root = mountRoot;
      root.innerHTML = `
        <div class="game-layout">
          <div class="game-board-wrap"><canvas class="game-canvas" width="400" height="400" aria-label="Snake game board"></canvas></div>
          <aside class="game-side">
            <p class="game-side__copy">Guide the line toward each pink point without touching the edge or your own path.</p>
            <div class="touch-pad" aria-label="Snake direction controls">
              <button class="game-control up" type="button" data-direction="up" aria-label="Move up">&#8593;</button>
              <button class="game-control left" type="button" data-direction="left" aria-label="Move left">&#8592;</button>
              <button class="game-control down" type="button" data-direction="down" aria-label="Move down">&#8595;</button>
              <button class="game-control right" type="button" data-direction="right" aria-label="Move right">&#8594;</button>
            </div>
            <div class="game-controls">
              <button class="game-control" type="button" data-action="pause">PAUSE</button>
              <button class="game-control game-control--accent" type="button" data-action="restart">RESTART</button>
            </div>
            <div class="game-status-line" role="status"></div>
          </aside>
        </div>`;
      canvas = root.querySelector("canvas");
      context = canvas.getContext("2d");
      root.querySelectorAll("[data-direction]").forEach(button => button.addEventListener("click", () => setDirection(directions[button.dataset.direction])));
      root.querySelector('[data-action="pause"]').addEventListener("click", togglePause);
      root.querySelector('[data-action="restart"]').addEventListener("click", restart);
      canvas.addEventListener("pointerdown", pointerDown);
      canvas.addEventListener("pointerup", pointerUp);
      addEventListener("keydown", keyHandler);
      restart();
    };

    return {
      mount,
      pause: () => { if (!gameOver) { paused = true; stopLoop(); } },
      resume: () => { if (!gameOver) { paused = false; startLoop(); } },
      destroy: () => {
        destroyed = true;
        stopLoop();
        removeEventListener("keydown", keyHandler);
        canvas?.removeEventListener("pointerdown", pointerDown);
        canvas?.removeEventListener("pointerup", pointerUp);
      }
    };
  };

  const TetrisGame = () => {
    const columns = 10;
    const rows = 20;
    const block = 24;
    const shapes = [
      [[1,1,1,1]],
      [[1,1],[1,1]],
      [[0,1,0],[1,1,1]],
      [[0,1,1],[1,1,0]],
      [[1,1,0],[0,1,1]],
      [[1,0,0],[1,1,1]],
      [[0,0,1],[1,1,1]]
    ];
    const colors = ["#45e5dc", "#ffd166", "#a78bfa", "#73f2a7", "#ff62b0", "#6ea8ff", "#ff8f70"];
    let root;
    let canvas;
    let context;
    let board;
    let piece;
    let score;
    let best = StorageManager.getNumber(StorageManager.keys.tetrisBest, 0);
    let frame = 0;
    let lastDrop = 0;
    let paused = false;
    let gameOver = false;
    let destroyed = false;

    const updateStats = () => GameManager.setStats([["SCORE", score], ["BEST", best]]);
    const setStatus = message => { root.querySelector(".game-status-line").textContent = message; };
    const randomPiece = () => {
      const type = Math.floor(Math.random() * shapes.length);
      return { matrix: shapes[type].map(row => [...row]), color: colors[type], x: 3, y: -1 };
    };

    const collision = (candidate, offsetX = 0, offsetY = 0, matrix = candidate.matrix) => {
      for (let y = 0; y < matrix.length; y += 1) {
        for (let x = 0; x < matrix[y].length; x += 1) {
          if (!matrix[y][x]) continue;
          const boardX = candidate.x + x + offsetX;
          const boardY = candidate.y + y + offsetY;
          if (boardX < 0 || boardX >= columns || boardY >= rows || (boardY >= 0 && board[boardY][boardX])) return true;
        }
      }
      return false;
    };

    const drawBlock = (x, y, color) => {
      context.fillStyle = color;
      context.fillRect(x * block + 1, y * block + 1, block - 2, block - 2);
      context.fillStyle = "rgba(255,255,255,.22)";
      context.fillRect(x * block + 3, y * block + 3, block - 6, 3);
    };

    const draw = () => {
      context.fillStyle = "#0d0c20";
      context.fillRect(0, 0, columns * block, rows * block);
      context.strokeStyle = "rgba(255,255,255,.045)";
      for (let x = 1; x < columns; x += 1) {
        context.beginPath(); context.moveTo(x * block, 0); context.lineTo(x * block, rows * block); context.stroke();
      }
      for (let y = 1; y < rows; y += 1) {
        context.beginPath(); context.moveTo(0, y * block); context.lineTo(columns * block, y * block); context.stroke();
      }
      board.forEach((row, y) => row.forEach((value, x) => { if (value) drawBlock(x, y, value); }));
      piece.matrix.forEach((row, y) => row.forEach((value, x) => {
        if (value && piece.y + y >= 0) drawBlock(piece.x + x, piece.y + y, piece.color);
      }));
    };

    const rotateMatrix = matrix => matrix[0].map((_, index) => matrix.map(row => row[index]).reverse());
    const move = dx => {
      if (!paused && !gameOver && !collision(piece, dx, 0)) piece.x += dx;
      draw();
    };
    const rotate = () => {
      if (paused || gameOver) return;
      const rotated = rotateMatrix(piece.matrix);
      for (const offset of [0, -1, 1, -2, 2]) {
        if (!collision(piece, offset, 0, rotated)) {
          piece.x += offset;
          piece.matrix = rotated;
          break;
        }
      }
      draw();
    };

    const clearLines = () => {
      let cleared = 0;
      for (let y = rows - 1; y >= 0; y -= 1) {
        if (board[y].every(Boolean)) {
          board.splice(y, 1);
          board.unshift(Array(columns).fill(null));
          cleared += 1;
          y += 1;
        }
      }
      if (cleared) {
        score += [0, 100, 300, 500, 800][cleared];
        updateStats();
        setStatus(`${cleared} line${cleared > 1 ? "s" : ""} cleared.`);
      }
    };

    const finish = () => {
      gameOver = true;
      cancelAnimationFrame(frame);
      frame = 0;
      if (score > best) {
        best = score;
        StorageManager.setNumber(StorageManager.keys.tetrisBest, best);
      }
      updateStats();
      setStatus("Game over. Restart for a fresh stack.");
    };

    const lockPiece = () => {
      piece.matrix.forEach((row, y) => row.forEach((value, x) => {
        const boardY = piece.y + y;
        if (value && boardY >= 0) board[boardY][piece.x + x] = piece.color;
      }));
      clearLines();
      piece = randomPiece();
      if (collision(piece)) finish();
    };

    const softDrop = () => {
      if (paused || gameOver) return;
      if (!collision(piece, 0, 1)) piece.y += 1;
      else lockPiece();
      draw();
    };

    const hardDrop = () => {
      if (paused || gameOver) return;
      let distance = 0;
      while (!collision(piece, 0, 1)) { piece.y += 1; distance += 1; }
      score += distance * 2;
      lockPiece();
      updateStats();
      draw();
    };

    const loop = timestamp => {
      if (destroyed || paused || gameOver) return;
      if (!lastDrop) lastDrop = timestamp;
      if (timestamp - lastDrop > Math.max(220, 650 - Math.floor(score / 500) * 45)) {
        softDrop();
        lastDrop = timestamp;
      }
      draw();
      frame = requestAnimationFrame(loop);
    };

    const startLoop = () => {
      if (!frame && !paused && !gameOver && !destroyed) {
        lastDrop = 0;
        frame = requestAnimationFrame(loop);
      }
    };
    const stopLoop = () => { cancelAnimationFrame(frame); frame = 0; };

    const keyHandler = event => {
      const handled = ["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", "x", "X", " "];
      if (!handled.includes(event.key)) return;
      event.preventDefault();
      if (event.key === "ArrowLeft") move(-1);
      else if (event.key === "ArrowRight") move(1);
      else if (event.key === "ArrowDown") softDrop();
      else if (event.key === "ArrowUp" || event.key === "x" || event.key === "X") rotate();
      else if (event.key === " ") hardDrop();
    };

    const restart = () => {
      stopLoop();
      board = Array.from({ length: rows }, () => Array(columns).fill(null));
      piece = randomPiece();
      score = 0;
      paused = false;
      gameOver = false;
      updateStats();
      setStatus("Move, rotate and clear complete horizontal lines.");
      draw();
      startLoop();
    };

    const mount = mountRoot => {
      root = mountRoot;
      root.innerHTML = `
        <div class="game-layout">
          <div class="game-board-wrap"><canvas class="game-canvas tetris-canvas" width="240" height="480" aria-label="Block stacking game board"></canvas></div>
          <aside class="game-side">
            <p class="game-side__copy">Build complete horizontal lines. Keep the stack below the top edge.</p>
            <div class="game-controls">
              <button class="game-control" type="button" data-action="left" aria-label="Move left">LEFT</button>
              <button class="game-control" type="button" data-action="right" aria-label="Move right">RIGHT</button>
              <button class="game-control" type="button" data-action="rotate">ROTATE</button>
              <button class="game-control" type="button" data-action="down">DOWN</button>
              <button class="game-control game-control--accent" type="button" data-action="drop">DROP</button>
              <button class="game-control" type="button" data-action="restart">RESTART</button>
            </div>
            <div class="game-status-line" role="status"></div>
          </aside>
        </div>`;
      canvas = root.querySelector("canvas");
      context = canvas.getContext("2d");
      const actions = { left: () => move(-1), right: () => move(1), rotate, down: softDrop, drop: hardDrop, restart };
      root.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", () => actions[button.dataset.action]()));
      addEventListener("keydown", keyHandler);
      restart();
    };

    return {
      mount,
      pause: () => { if (!gameOver) { paused = true; stopLoop(); } },
      resume: () => { if (!gameOver) { paused = false; startLoop(); } },
      destroy: () => {
        destroyed = true;
        stopLoop();
        removeEventListener("keydown", keyHandler);
      }
    };
  };

  const GameManager = (() => {
    const gameDefinitions = Object.freeze({
      sudoku: { title: "SUDOKU", eyebrow: "SECRET 01 - NUMBER", create: SudokuGame },
      snake: { title: "SNAKE", eyebrow: "SECRET 02 - SNAKE", create: SnakeGame },
      tetris: { title: "BLOCKS", eyebrow: "SECRET 03 - BLOCK", create: TetrisGame }
    });
    let activeGame = null;
    let activeName = null;
    let savedScroll = 0;
    let savedRoute = "";
    let previousFocus = null;
    let closingTimer = 0;

    const setStats = items => {
      UIBridge.elements.gameStats.innerHTML = items.map(([label, value]) => `<span>${label}<strong>${value}</strong></span>`).join("");
    };

    const lockPage = () => {
      savedScroll = scrollY;
      savedRoute = location.hash;
      document.body.style.position = "fixed";
      document.body.style.top = `-${savedScroll}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.width = "100%";
      document.body.classList.add("game-mode");
    };

    const unlockPage = () => {
      document.body.classList.remove("game-mode");
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.style.width = "";
      if (location.hash !== savedRoute) history.replaceState(history.state, "", savedRoute || location.pathname);
      scrollTo(0, savedScroll);
    };

    const showPause = show => {
      UIBridge.elements.pause.classList.toggle("is-visible", show);
      UIBridge.elements.pause.setAttribute("aria-hidden", String(!show));
      if (show) UIBridge.elements.resume.focus();
    };

    const open = (name) => {
      const definition = gameDefinitions[name];
      if (!definition || activeGame) return;
      clearTimeout(closingTimer);
      EasterEggSpawner.removeActive(false);
      previousFocus = document.activeElement;
      activeName = name;
      UIBridge.elements.gameTitle.textContent = definition.title;
      UIBridge.elements.gameEyebrow.textContent = definition.eyebrow;
      UIBridge.elements.gameMount.innerHTML = "";
      UIBridge.elements.overlay.hidden = false;
      lockPage();
      activeGame = definition.create();
      activeGame.mount(UIBridge.elements.gameMount);
      requestAnimationFrame(() => {
        UIBridge.elements.overlay.classList.add("is-open");
        UIBridge.elements.gameExit.focus();
      });
    };

    const close = () => {
      if (!activeGame) return;
      activeGame.destroy();
      activeGame = null;
      activeName = null;
      showPause(false);
      UIBridge.elements.overlay.classList.remove("is-open");
      unlockPage();
      closingTimer = setTimeout(() => {
        UIBridge.elements.overlay.hidden = true;
        UIBridge.elements.gameMount.innerHTML = "";
        previousFocus?.focus?.();
        if (InteractionManager.isEnabled()) EasterEggSpawner.schedule(false);
      }, prefersReducedMotion.matches ? 0 : 350);
    };

    const pauseForVisibility = () => {
      if (!activeGame) return;
      activeGame.pause?.();
      showPause(true);
    };

    const resume = () => {
      if (!activeGame) return;
      showPause(false);
      activeGame.resume?.();
      UIBridge.elements.gameExit.focus();
    };

    const trapFocus = event => {
      if (event.key !== "Tab" || !activeGame) return;
      const focusable = [...UIBridge.elements.overlay.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
        .filter(element => !element.closest('[aria-hidden="true"]'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };

    UIBridge.elements.gameExit.addEventListener("click", close);
    UIBridge.elements.resume.addEventListener("click", resume);
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && activeGame) {
        event.preventDefault();
        close();
      } else {
        trapFocus(event);
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && activeGame) pauseForVisibility();
    });

    return {
      open,
      close,
      setStats,
      pauseForVisibility,
      resume,
      isOpen: () => Boolean(activeGame),
      activeName: () => activeName
    };
  })();

  InteractionManager.init();

  if (["localhost", "127.0.0.1"].includes(location.hostname)) {
    window.__portfolioInteraction = Object.freeze({
      setEnabled: InteractionManager.setEnabled,
      spawnSecret: EasterEggSpawner.spawn,
      openGame: GameManager.open,
      closeGame: GameManager.close,
      pauseGame: GameManager.pauseForVisibility,
      resumeGame: GameManager.resume,
      state: () => ({ enabled: InteractionManager.isEnabled(), found: InteractionManager.foundCount(), game: GameManager.activeName() })
    });
  }
})();
