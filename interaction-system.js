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
      tetrisBest: "portfolioTetrisHighScore",
      minesweeperBest: "portfolioMinesweeperBestTime",
      solitaireBest: "portfolioSolitaireBestTime",
      downstairsBest: "portfolioDownstairsHighScore",
      towerBest: "portfolioTowerHighScore"
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
    number: Object.freeze({ id: "number", order: 1, label: "NUMBER", gameLabel: "SUDOKU", game: "sudoku", renderer: "number" }),
    snake: Object.freeze({ id: "snake", order: 2, label: "SNAKE", gameLabel: "SNAKE", game: "snake", renderer: "snake" }),
    block: Object.freeze({ id: "block", order: 3, label: "BLOCK", gameLabel: "BLOCKS", game: "tetris", renderer: "block" }),
    mine: Object.freeze({ id: "mine", order: 4, label: "MINE", gameLabel: "MINESWEEPER", game: "minesweeper", renderer: "mine" }),
    card: Object.freeze({ id: "card", order: 5, label: "CARD", gameLabel: "SOLITAIRE", game: "solitaire", renderer: "card" }),
    down: Object.freeze({ id: "down", order: 6, label: "DOWN", gameLabel: "DOWNSTAIRS", game: "downstairs", renderer: "down" }),
    up: Object.freeze({ id: "up", order: 7, label: "UP", gameLabel: "TOWER", game: "tower", renderer: "up" })
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
          <button class="interaction-counter" id="interactionCounter" type="button" aria-live="polite" aria-expanded="false" aria-controls="secretCollection" data-secret-interactive>0 / 7</button>
        </div>
        <button class="interaction-toggle" id="interactionToggle" type="button" aria-pressed="false" title="Toggle hidden interactions" data-secret-interactive>OFF</button>
        <div class="secret-collection" id="secretCollection" hidden>
          <span class="secret-collection__label">DISCOVERED</span>
          <div class="secret-collection__list" id="secretCollectionList"></div>
        </div>
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
      collection: wrapper.querySelector("#secretCollection"),
      collectionList: wrapper.querySelector("#secretCollectionList"),
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
    let promptTimer = 0;
    const validSecrets = Object.keys(SecretRegistry);
    const storedFound = StorageManager.getFound();
    const found = new Set((Array.isArray(storedFound) ? storedFound : []).filter(id => validSecrets.includes(id)));

    const updateCollection = () => {
      UIBridge.elements.collectionList.innerHTML = Object.values(SecretRegistry)
        .sort((a, b) => a.order - b.order)
        .map(secret => {
          const unlocked = found.has(secret.id);
          return `<button class="secret-collection__item${unlocked ? " is-found" : ""}" type="button" ${unlocked ? `data-secret-replay="${secret.id}"` : "disabled"}>
            <span>${String(secret.order).padStart(2, "0")}</span><strong>${unlocked ? secret.label : "???"}</strong>
          </button>`;
        }).join("");
    };

    const updateUI = () => {
      const { dock, toggle, counter } = UIBridge.elements;
      dock.hidden = false;
      toggle.setAttribute("aria-pressed", String(enabled));
      toggle.textContent = enabled ? "ON" : "OFF";
      counter.textContent = `${found.size} / ${validSecrets.length}`;
      counter.setAttribute("aria-hidden", String(!enabled));
      dock.classList.toggle("is-complete", found.size === validSecrets.length);
      updateCollection();
    };

    const setEnabled = (value, persist = true) => {
      enabled = Boolean(value);
      if (persist) StorageManager.setEnabled(enabled);
      updateUI();
      if (enabled) EasterEggSpawner.start();
      else EasterEggSpawner.stop();
    };

    const dismissPrompt = () => {
      clearTimeout(promptTimer);
      promptTimer = 0;
      UIBridge.elements.prompt.hidden = true;
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
          ? "ALL SECRETS DISCOVERED"
          : `SECRET FOUND  ${String(found.size).padStart(2, "0")} / ${String(validSecrets.length).padStart(2, "0")}  ${SecretRegistry[id].gameLabel}`, 1050);
      }
      return isNew;
    };

    const init = () => {
      const saved = StorageManager.getEnabled();
      updateUI();
      if (saved === null) {
        setEnabled(false, false);
        promptTimer = setTimeout(() => {
          promptTimer = 0;
          if (StorageManager.getEnabled() === null) UIBridge.elements.prompt.hidden = false;
        }, prefersReducedMotion.matches ? 800 : 2400);
      } else {
        setEnabled(saved, false);
      }

      UIBridge.elements.prompt.addEventListener("click", event => {
        const choice = event.target.closest("[data-interaction-choice]");
        if (!choice) return;
        dismissPrompt();
        setEnabled(choice.dataset.interactionChoice === "on");
        UIBridge.elements.toggle.focus();
      });
      UIBridge.elements.toggle.addEventListener("click", () => {
        dismissPrompt();
        setEnabled(!enabled);
      });
      UIBridge.elements.counter.addEventListener("click", () => {
        const open = UIBridge.elements.collection.hidden;
        UIBridge.elements.collection.hidden = !open;
        UIBridge.elements.counter.setAttribute("aria-expanded", String(open));
      });
      UIBridge.elements.collectionList.addEventListener("click", event => {
        const replay = event.target.closest("[data-secret-replay]");
        if (!replay) return;
        const secret = SecretRegistry[replay.dataset.secretReplay];
        UIBridge.elements.collection.hidden = true;
        UIBridge.elements.counter.setAttribute("aria-expanded", "false");
        if (secret) GameManager.open(secret.game, secret.id);
      });
      document.addEventListener("click", event => {
        if (!UIBridge.elements.dock.contains(event.target)) {
          UIBridge.elements.collection.hidden = true;
          UIBridge.elements.counter.setAttribute("aria-expanded", "false");
        }
      });
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
    let attentionTimer = 0;
    let firstSchedule = true;
    let lastSpawnedSecret = null;
    let lastSuccessfulSpawn = Date.now();
    let lastActivity = Date.now();

    const clearTimers = () => {
      clearTimeout(spawnTimer);
      clearTimeout(lifetimeTimer);
      clearInterval(digitTimer);
      clearTimeout(attentionTimer);
      spawnTimer = 0;
      lifetimeTimer = 0;
      digitTimer = 0;
      attentionTimer = 0;
    };

    const chooseSecret = () => {
      const weighted = Object.values(SecretRegistry).map(secret => ({
        secret,
        weight: secret.id === lastSpawnedSecret ? .2 : (InteractionManager.isFound(secret.id) ? .8 : 3)
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

    const eggRenderers = {
      number(button) {
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
      },
      snake(button) {
        button.innerHTML = '<span class="secret-snake__body"><i></i><i></i><i></i><i></i></span>';
      },
      block(button) {
        button.innerHTML = '<span class="secret-block__shape"><i></i><i></i><i></i><i></i></span>';
      },
      mine(button) {
        button.innerHTML = '<span class="secret-mine__grid"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>';
      },
      card(button) {
        button.innerHTML = '<span class="secret-card__stack"><i>A</i><i>&#9670;</i></span>';
      },
      down(button) {
        button.innerHTML = '<span class="secret-platform secret-platform--down"><i></i><b></b><b></b></span>';
      },
      up(button) {
        button.innerHTML = '<span class="secret-platform secret-platform--up"><i></i><b></b><b></b></span>';
      }
    };

    const renderEgg = (button, secret) => {
      button.classList.add(`secret-${secret.renderer}`);
      eggRenderers[secret.renderer]?.(button);
    };

    const removeActive = (scheduleNext = true) => {
      clearTimeout(lifetimeTimer);
      clearInterval(digitTimer);
      clearTimeout(attentionTimer);
      lifetimeTimer = 0;
      digitTimer = 0;
      attentionTimer = 0;
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
      renderEgg(button, secret);

      const activate = () => {
        removeActive(false);
        const isNew = InteractionManager.discover(secret.id);
        setTimeout(() => GameManager.open(secret.game, secret.id), isNew ? 1000 : 0);
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
      lastSpawnedSecret = secret.id;
      lastSuccessfulSpawn = Date.now();
      requestAnimationFrame(() => button.classList.add("is-visible"));
      attentionTimer = setTimeout(() => button.classList.add("attention-hint"), 5000);
      lifetimeTimer = setTimeout(() => removeActive(true), randomBetween(6000, 10000));
      return true;
    };

    const runSpawnCheck = forcedId => {
      if (!InteractionManager.isEnabled() || document.hidden || GameManager.isOpen() || activeEgg) return false;
      if (Date.now() - lastActivity > 30000) return scheduleRetry();
      const pity = Date.now() - lastSuccessfulSpawn >= 30000;
      const heroFirstView = document.body.dataset.page === "about" && scrollY < innerHeight * .55;
      const probability = pity ? 1 : (heroFirstView ? .6 : .84);
      if (!forcedId && Math.random() > probability) return scheduleRetry();
      return spawn(forcedId);
    };

    const scheduleRetry = () => {
      clearTimeout(spawnTimer);
      spawnTimer = setTimeout(() => runSpawnCheck(), randomBetween(3000, 7000));
      return false;
    };

    const schedule = initial => {
      clearTimeout(spawnTimer);
      if (!InteractionManager.isEnabled() || document.hidden || GameManager.isOpen() || activeEgg) return;
      const isInitial = initial ?? firstSchedule;
      const delay = isInitial ? randomBetween(5000, 10000) : randomBetween(8000, 20000);
      spawnTimer = setTimeout(() => runSpawnCheck(), delay);
    };

    const start = () => {
      if (!spawnTimer && !activeEgg && !document.hidden && !GameManager.isOpen()) schedule(firstSchedule);
    };

    const stop = () => {
      clearTimers();
      removeActive(false);
      firstSchedule = true;
    };

    const noteActivity = () => {
      const wasIdle = Date.now() - lastActivity > 30000;
      lastActivity = Date.now();
      if (wasIdle && InteractionManager.isEnabled() && !GameManager.isOpen() && !activeEgg) scheduleRetry();
    };
    ["scroll", "pointermove", "touchstart", "keydown"].forEach(type =>
      addEventListener(type, noteActivity, { passive: true })
    );

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

  const CanvasScaler = {
    setup(canvas, width, height) {
      const ratio = clamp(devicePixelRatio || 1, 1, 3);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.dataset.logicalWidth = width;
      canvas.dataset.logicalHeight = height;
      const context = canvas.getContext("2d");
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      return context;
    }
  };

  const ReadyFlow = ({ root, title, controls, waitForInput = false, onStart }) => {
    const layer = document.createElement("div");
    layer.className = "game-ready";
    layer.innerHTML = `<div class="game-ready__content"><span>${title}</span><strong>READY?</strong><p>${controls}</p></div>`;
    root.appendChild(layer);
    let timers = [];
    let waiting = false;
    let active = false;

    const clear = () => {
      timers.forEach(clearTimeout);
      timers = [];
    };
    const later = (callback, delay) => {
      const id = setTimeout(callback, delay);
      timers.push(id);
    };
    const finish = () => {
      if (!active) return;
      active = false;
      waiting = false;
      layer.classList.remove("is-visible");
      onStart();
    };
    const run = () => {
      clear();
      active = true;
      waiting = false;
      layer.hidden = false;
      layer.classList.add("is-visible");
      const content = layer.querySelector(".game-ready__content");
      content.innerHTML = `<span>${title}</span><strong>READY?</strong><p>${controls}</p>`;
      const sequence = ["3", "2", "1", "GO"];
      later(() => {
        sequence.forEach((value, index) => later(() => {
          content.innerHTML = `<strong class="game-ready__count">${value}</strong>`;
          if (value === "GO") {
            later(() => {
              if (waitForInput) {
                waiting = true;
                content.innerHTML = `<strong class="game-ready__go">MOVE TO START</strong><p>${controls}</p>`;
              } else {
                finish();
              }
            }, waitForInput ? 420 : 360);
          }
        }, index * 600));
      }, 900);
    };
    const signalInput = () => {
      if (!waiting) return false;
      finish();
      return true;
    };
    const destroy = () => { clear(); layer.remove(); active = false; waiting = false; };
    return { run, signalInput, destroy, isWaiting: () => waiting, isActive: () => active };
  };

  const showGameOver = (root, { label = "GAME OVER", scoreLabel = "SCORE", score, best, onRetry }) => {
    root.querySelector(".game-end")?.remove();
    const layer = document.createElement("div");
    layer.className = "game-end";
    layer.innerHTML = `<div class="game-end__panel">
      <span>${label}</span><h3>GAME OVER</h3>
      <div class="game-end__scores"><p>${scoreLabel}<strong>${score}</strong></p><p>BEST<strong>${best}</strong></p></div>
      <div class="game-controls"><button class="game-control game-control--accent" type="button" data-end="retry">RETRY</button><button class="game-control" type="button" data-end="exit">EXIT</button></div>
    </div>`;
    root.appendChild(layer);
    layer.querySelector('[data-end="retry"]').addEventListener("click", () => { layer.remove(); onRetry(); });
    layer.querySelector('[data-end="exit"]').addEventListener("click", () => GameManager.close());
  };

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
    let timerStarted = false;
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
      if (!timerStarted) {
        timerStarted = true;
        timer = setInterval(() => {
          if (!paused && !complete) {
            elapsed += 1;
            updateStats();
          }
        }, 1000);
      }
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
      timerStarted = false;
      clearInterval(timer);
      timer = 0;
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
    let readyFlow;
    let snake = [];
    let food = { x: 14, y: 10 };
    let direction = { x: 1, y: 0 };
    let nextDirection = { x: 1, y: 0 };
    let score = 0;
    let best = StorageManager.getNumber(StorageManager.keys.snakeBest, 0);
    let frame = 0;
    let lastStep = 0;
    let paused = false;
    let started = false;
    let gameOver = false;
    let destroyed = false;
    let swipeStart = null;
    const cells = 20;
    const size = 400;
    const cell = size / cells;
    const directions = {
      up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 }
    };

    const updateStats = () => GameManager.setStats([["SCORE", score], ["BEST", best]]);
    const setStatus = message => { root.querySelector(".game-status-line").textContent = message; };
    const stepInterval = () => Math.max(90, 175 - Math.floor(score / 5) * 10);

    const placeFood = () => {
      do {
        food = { x: 2 + Math.floor(Math.random() * (cells - 4)), y: 2 + Math.floor(Math.random() * (cells - 4)) };
      } while (snake.some(segment => segment.x === food.x && segment.y === food.y));
    };

    const draw = () => {
      if (!context) return;
      context.fillStyle = "#0d0c20";
      context.fillRect(0, 0, size, size);
      context.strokeStyle = "rgba(255,255,255,.045)";
      context.lineWidth = 1;
      for (let i = 1; i < cells; i += 1) {
        context.beginPath(); context.moveTo(i * cell, 0); context.lineTo(i * cell, size); context.stroke();
        context.beginPath(); context.moveTo(0, i * cell); context.lineTo(size, i * cell); context.stroke();
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

    const stopLoop = () => { cancelAnimationFrame(frame); frame = 0; };
    const finish = () => {
      gameOver = true;
      started = false;
      stopLoop();
      if (score > best) {
        best = score;
        StorageManager.setNumber(StorageManager.keys.snakeBest, best);
      }
      updateStats();
      setStatus("Game over. Choose RETRY when you are ready.");
      showGameOver(root, { label: "SNAKE", score, best, onRetry: restart });
    };

    const step = () => {
      direction = nextDirection;
      const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };
      if (head.x < 0 || head.x >= cells || head.y < 0 || head.y >= cells || snake.some(segment => segment.x === head.x && segment.y === head.y)) return finish();
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) {
        score += 1;
        placeFood();
        updateStats();
      } else snake.pop();
    };

    const loop = timestamp => {
      if (destroyed || paused || gameOver || !started) return;
      if (!lastStep) lastStep = timestamp;
      if (timestamp - lastStep >= stepInterval()) {
        step();
        lastStep = timestamp;
      }
      draw();
      if (!gameOver) frame = requestAnimationFrame(loop);
    };
    const startLoop = () => {
      if (!frame && started && !paused && !gameOver && !destroyed) {
        lastStep = 0;
        frame = requestAnimationFrame(loop);
      }
    };

    const beginFromDirection = newDirection => {
      if (readyFlow?.isActive()) {
        if (!readyFlow.isWaiting()) return;
        direction = newDirection;
        nextDirection = newDirection;
        readyFlow.signalInput();
        return;
      }
      if (!started || paused || gameOver) return;
      if (newDirection.x + direction.x === 0 && newDirection.y + direction.y === 0) return;
      nextDirection = newDirection;
    };

    const togglePause = () => {
      if (gameOver || readyFlow?.isActive() || !started) return;
      paused = !paused;
      if (paused) {
        stopLoop();
        setStatus("Paused. Press P, Space, or PAUSE to continue.");
      } else {
        setStatus("Use arrow keys, WASD, swipe, or the touch pad.");
        startLoop();
      }
    };

    const keyHandler = event => {
      const map = {
        ArrowUp: directions.up, w: directions.up, W: directions.up,
        ArrowDown: directions.down, s: directions.down, S: directions.down,
        ArrowLeft: directions.left, a: directions.left, A: directions.left,
        ArrowRight: directions.right, d: directions.right, D: directions.right
      };
      if (map[event.key]) {
        event.preventDefault();
        beginFromDirection(map[event.key]);
      } else if (event.code === "Space" || event.key === "p" || event.key === "P") {
        event.preventDefault();
        togglePause();
      }
    };

    const restart = () => {
      root.querySelector(".game-end")?.remove();
      stopLoop();
      snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }, { x: 7, y: 10 }];
      direction = directions.right;
      nextDirection = directions.right;
      score = 0;
      paused = false;
      started = false;
      gameOver = false;
      placeFood();
      updateStats();
      draw();
      setStatus("The snake will wait for your first direction after GO.");
      readyFlow.run();
    };

    const pointerDown = event => { swipeStart = { x: event.clientX, y: event.clientY }; };
    const pointerUp = event => {
      if (!swipeStart) return;
      const dx = event.clientX - swipeStart.x;
      const dy = event.clientY - swipeStart.y;
      swipeStart = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
      beginFromDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? directions.right : directions.left) : (dy > 0 ? directions.down : directions.up));
    };
    const resizeCanvas = () => { context = CanvasScaler.setup(canvas, size, size); draw(); };

    const mount = mountRoot => {
      root = mountRoot;
      root.innerHTML = `<div class="game-layout">
        <div class="game-board-wrap"><canvas class="game-canvas" aria-label="Snake game board"></canvas></div>
        <aside class="game-side"><p class="game-side__copy">Guide the line toward each pink point without touching the edge or your own path.</p>
          <div class="touch-pad" aria-label="Snake direction controls">
            <button class="game-control up" type="button" data-direction="up" aria-label="Move up">&#8593;</button>
            <button class="game-control left" type="button" data-direction="left" aria-label="Move left">&#8592;</button>
            <button class="game-control down" type="button" data-direction="down" aria-label="Move down">&#8595;</button>
            <button class="game-control right" type="button" data-direction="right" aria-label="Move right">&#8594;</button>
          </div>
          <div class="game-controls"><button class="game-control" type="button" data-action="pause">PAUSE</button><button class="game-control game-control--accent" type="button" data-action="restart">RESTART</button></div>
          <div class="game-status-line" role="status"></div>
        </aside></div>`;
      canvas = root.querySelector("canvas");
      resizeCanvas();
      readyFlow = ReadyFlow({
        root,
        title: "SNAKE",
        controls: finePointer.matches ? "ARROW KEYS / WASD" : "SWIPE TO MOVE",
        waitForInput: true,
        onStart: () => { started = true; setStatus("Move received. Stay inside the grid."); if (!paused) startLoop(); }
      });
      root.querySelectorAll("[data-direction]").forEach(button => button.addEventListener("click", () => beginFromDirection(directions[button.dataset.direction])));
      root.querySelector('[data-action="pause"]').addEventListener("click", togglePause);
      root.querySelector('[data-action="restart"]').addEventListener("click", restart);
      canvas.addEventListener("pointerdown", pointerDown);
      canvas.addEventListener("pointerup", pointerUp);
      addEventListener("keydown", keyHandler);
      addEventListener("resize", resizeCanvas);
      restart();
    };

    return {
      mount,
      pause: () => { if (!gameOver) { paused = true; stopLoop(); } },
      resume: () => { if (!gameOver) { paused = false; if (started) startLoop(); } },
      destroy: () => {
        destroyed = true;
        stopLoop();
        readyFlow?.destroy();
        removeEventListener("keydown", keyHandler);
        removeEventListener("resize", resizeCanvas);
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
    let readyFlow;
    let board;
    let piece;
    let score;
    let best = StorageManager.getNumber(StorageManager.keys.tetrisBest, 0);
    let frame = 0;
    let lastDrop = 0;
    let paused = false;
    let started = false;
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
      if (started && !paused && !gameOver && !collision(piece, dx, 0)) piece.x += dx;
      draw();
    };
    const rotate = () => {
      if (!started || paused || gameOver) return;
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
      started = false;
      cancelAnimationFrame(frame);
      frame = 0;
      if (score > best) {
        best = score;
        StorageManager.setNumber(StorageManager.keys.tetrisBest, best);
      }
      updateStats();
      setStatus("Game over. Restart for a fresh stack.");
      showGameOver(root, { label: "BLOCKS", score, best, onRetry: restart });
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
      if (!started || paused || gameOver) return;
      if (!collision(piece, 0, 1)) piece.y += 1;
      else lockPiece();
      draw();
    };

    const hardDrop = () => {
      if (!started || paused || gameOver) return;
      let distance = 0;
      while (!collision(piece, 0, 1)) { piece.y += 1; distance += 1; }
      score += distance * 2;
      lockPiece();
      updateStats();
      draw();
    };

    const loop = timestamp => {
      if (destroyed || paused || gameOver || !started) return;
      if (!lastDrop) lastDrop = timestamp;
      if (timestamp - lastDrop > Math.max(220, 650 - Math.floor(score / 500) * 45)) {
        softDrop();
        lastDrop = timestamp;
      }
      draw();
      frame = requestAnimationFrame(loop);
    };

    const startLoop = () => {
      if (!frame && started && !paused && !gameOver && !destroyed) {
        lastDrop = 0;
        frame = requestAnimationFrame(loop);
      }
    };
    const stopLoop = () => { cancelAnimationFrame(frame); frame = 0; };

    const keyHandler = event => {
      const handled = ["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", "x", "X", " ", "p", "P"];
      if (!handled.includes(event.key)) return;
      event.preventDefault();
      if (event.key === "p" || event.key === "P") togglePause();
      else if (event.key === "ArrowLeft") move(-1);
      else if (event.key === "ArrowRight") move(1);
      else if (event.key === "ArrowDown") softDrop();
      else if (event.key === "ArrowUp" || event.key === "x" || event.key === "X") rotate();
      else if (event.key === " ") hardDrop();
    };

    const togglePause = () => {
      if (!started || gameOver || readyFlow?.isActive()) return;
      paused = !paused;
      if (paused) { stopLoop(); setStatus("Paused. Press P or PAUSE to continue."); }
      else { setStatus("Move, rotate and clear complete horizontal lines."); startLoop(); }
    };

    const restart = () => {
      root.querySelector(".game-end")?.remove();
      stopLoop();
      board = Array.from({ length: rows }, () => Array(columns).fill(null));
      piece = randomPiece();
      score = 0;
      paused = false;
      started = false;
      gameOver = false;
      updateStats();
      setStatus("Move, rotate and clear complete horizontal lines.");
      draw();
      readyFlow.run();
    };

    const resizeCanvas = () => { context = CanvasScaler.setup(canvas, columns * block, rows * block); draw(); };

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
              <button class="game-control" type="button" data-action="pause">PAUSE</button>
              <button class="game-control" type="button" data-action="restart">RESTART</button>
            </div>
            <div class="game-status-line" role="status"></div>
          </aside>
        </div>`;
      canvas = root.querySelector("canvas");
      context = CanvasScaler.setup(canvas, columns * block, rows * block);
      readyFlow = ReadyFlow({ root, title: "BLOCKS", controls: "ARROWS / X / SPACE", onStart: () => { started = true; if (!paused) startLoop(); } });
      const actions = { left: () => move(-1), right: () => move(1), rotate, down: softDrop, drop: hardDrop, pause: togglePause, restart };
      root.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", () => actions[button.dataset.action]()));
      addEventListener("keydown", keyHandler);
      addEventListener("resize", resizeCanvas);
      restart();
    };

    return {
      mount,
      pause: () => { if (!gameOver) { paused = true; stopLoop(); } },
      resume: () => { if (!gameOver) { paused = false; if (started) startLoop(); } },
      destroy: () => {
        destroyed = true;
        stopLoop();
        readyFlow?.destroy();
        removeEventListener("keydown", keyHandler);
        removeEventListener("resize", resizeCanvas);
      }
    };
  };

  const MinesweeperGame = () => {
    const size = 9;
    const mineTotal = 10;
    let root;
    let cells = [];
    let minesPlaced = false;
    let elapsed = 0;
    let timer = 0;
    let timerStarted = false;
    let paused = false;
    let ended = false;
    let flagMode = false;
    let longPressTimer = 0;
    let suppressClick = false;
    let best = StorageManager.getNumber(StorageManager.keys.minesweeperBest, 0);

    const neighbors = index => {
      const row = Math.floor(index / size);
      const column = index % size;
      const result = [];
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const y = row + dy;
        const x = column + dx;
        if (x >= 0 && x < size && y >= 0 && y < size) result.push(y * size + x);
      }
      return result;
    };
    const flaggedCount = () => cells.filter(cell => cell.flagged).length;
    const updateStats = () => GameManager.setStats([
      ["TIME", formatTime(elapsed)], ["BEST", best ? formatTime(best) : "--:--"], ["MINES", Math.max(0, mineTotal - flaggedCount())]
    ]);
    const setStatus = message => { root.querySelector(".game-status-line").textContent = message; };
    const startTimer = () => {
      if (timerStarted) return;
      timerStarted = true;
      timer = setInterval(() => { if (!paused && !ended) { elapsed += 1; updateStats(); } }, 1000);
    };
    const placeMines = firstIndex => {
      const blocked = new Set([firstIndex, ...neighbors(firstIndex)]);
      const choices = Array.from({ length: size * size }, (_, index) => index).filter(index => !blocked.has(index));
      for (let i = choices.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [choices[i], choices[j]] = [choices[j], choices[i]];
      }
      choices.slice(0, mineTotal).forEach(index => { cells[index].mine = true; });
      cells.forEach((cell, index) => { cell.count = neighbors(index).filter(item => cells[item].mine).length; });
      minesPlaced = true;
    };
    const render = () => {
      const board = root.querySelector(".mine-board");
      board.innerHTML = cells.map((cell, index) => {
        const classes = ["mine-cell", cell.revealed ? "is-revealed" : "", cell.flagged ? "is-flagged" : "", cell.revealed && cell.mine ? "is-mine" : ""].filter(Boolean).join(" ");
        const content = cell.flagged ? "F" : (cell.revealed ? (cell.mine ? '<i class="mine-dot"></i>' : (cell.count || "")) : "");
        return `<button class="${classes}" type="button" data-cell="${index}" data-count="${cell.count}" aria-label="Cell ${index + 1}${cell.flagged ? ", flagged" : ""}">${content}</button>`;
      }).join("");
      updateStats();
    };
    const revealArea = start => {
      const queue = [start];
      const seen = new Set();
      while (queue.length) {
        const index = queue.shift();
        if (seen.has(index) || cells[index].flagged) continue;
        seen.add(index);
        cells[index].revealed = true;
        if (cells[index].count === 0 && !cells[index].mine) neighbors(index).forEach(next => queue.push(next));
      }
    };
    const finish = won => {
      ended = true;
      clearInterval(timer);
      timer = 0;
      if (won) {
        if (!best || elapsed < best) { best = elapsed; StorageManager.setNumber(StorageManager.keys.minesweeperBest, best); }
        setStatus("Board cleared. Best time saved on this device.");
      } else {
        cells.forEach(cell => { if (cell.mine) cell.revealed = true; });
        setStatus("Mine triggered. The full layout is now visible.");
      }
      render();
      showGameOver(root, { label: won ? "BOARD CLEARED" : "MINESWEEPER", scoreLabel: "TIME", score: formatTime(elapsed), best: best ? formatTime(best) : "--:--", onRetry: restart });
    };
    const reveal = index => {
      if (paused || ended || cells[index].flagged || cells[index].revealed) return;
      if (!minesPlaced) { placeMines(index); startTimer(); }
      if (cells[index].mine) return finish(false);
      revealArea(index);
      render();
      if (cells.filter(cell => cell.revealed && !cell.mine).length === size * size - mineTotal) finish(true);
    };
    const toggleFlag = index => {
      if (paused || ended || cells[index].revealed) return;
      cells[index].flagged = !cells[index].flagged;
      render();
    };
    const restart = () => {
      root.querySelector(".game-end")?.remove();
      clearInterval(timer);
      cells = Array.from({ length: size * size }, () => ({ mine: false, count: 0, revealed: false, flagged: false }));
      minesPlaced = false;
      elapsed = 0;
      timer = 0;
      timerStarted = false;
      paused = false;
      ended = false;
      flagMode = false;
      root.querySelector('[data-action="flag"]').classList.remove("is-active");
      setStatus("First reveal is always safe, including its surrounding cells.");
      render();
    };
    const clickHandler = event => {
      const button = event.target.closest("[data-cell]");
      if (!button) return;
      if (suppressClick) { suppressClick = false; return; }
      const index = Number(button.dataset.cell);
      if (flagMode) toggleFlag(index); else reveal(index);
    };
    const contextHandler = event => {
      const button = event.target.closest("[data-cell]");
      if (!button) return;
      event.preventDefault();
      toggleFlag(Number(button.dataset.cell));
    };
    const pointerDown = event => {
      const button = event.target.closest("[data-cell]");
      if (!button || event.pointerType === "mouse") return;
      longPressTimer = setTimeout(() => { suppressClick = true; toggleFlag(Number(button.dataset.cell)); }, 520);
    };
    const cancelLongPress = () => { clearTimeout(longPressTimer); longPressTimer = 0; };
    const mount = mountRoot => {
      root = mountRoot;
      root.innerHTML = `<div class="game-layout mine-layout">
        <div class="game-board-wrap"><div class="mine-board" role="grid" aria-label="Minesweeper board"></div></div>
        <aside class="game-side"><p class="game-side__copy">Reveal every safe glass tile. Right-click or long press to place a flag.</p>
          <div class="game-controls"><button class="game-control" type="button" data-action="flag">FLAG MODE</button><button class="game-control game-control--accent" type="button" data-action="restart">RESTART</button></div>
          <div class="game-status-line" role="status"></div>
        </aside></div>`;
      const board = root.querySelector(".mine-board");
      board.addEventListener("click", clickHandler);
      board.addEventListener("contextmenu", contextHandler);
      board.addEventListener("pointerdown", pointerDown);
      board.addEventListener("pointerup", cancelLongPress);
      board.addEventListener("pointercancel", cancelLongPress);
      board.addEventListener("pointerleave", cancelLongPress);
      root.querySelector('[data-action="flag"]').addEventListener("click", event => { flagMode = !flagMode; event.currentTarget.classList.toggle("is-active", flagMode); });
      root.querySelector('[data-action="restart"]').addEventListener("click", restart);
      restart();
    };
    return {
      mount,
      pause: () => { paused = true; },
      resume: () => { if (!ended) paused = false; },
      destroy: () => { clearInterval(timer); clearTimeout(longPressTimer); }
    };
  };

  const SolitaireGame = () => {
    const suits = ["S", "H", "D", "C"];
    const suitMarks = { S: "&spades;", H: "&hearts;", D: "&diams;", C: "&clubs;" };
    const isRed = suit => suit === "H" || suit === "D";
    let root;
    let stock = [];
    let waste = [];
    let tableau = [];
    let foundations = {};
    let selected = null;
    let initialOrder = [];
    let elapsed = 0;
    let timer = 0;
    let timerStarted = false;
    let paused = false;
    let ended = false;
    let best = StorageManager.getNumber(StorageManager.keys.solitaireBest, 0);

    const makeDeck = () => suits.flatMap(suit => Array.from({ length: 13 }, (_, index) => ({
      id: `${suit}${index + 1}`, suit, rank: index + 1, faceUp: false
    })));
    const shuffle = deck => {
      for (let i = deck.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      return deck;
    };
    const rankLabel = rank => ({ 1: "A", 11: "J", 12: "Q", 13: "K" }[rank] || rank);
    const updateStats = () => GameManager.setStats([["TIME", formatTime(elapsed)], ["BEST", best ? formatTime(best) : "--:--"]]);
    const setStatus = message => { root.querySelector(".game-status-line").textContent = message; };
    const startTimer = () => {
      if (timerStarted) return;
      timerStarted = true;
      timer = setInterval(() => { if (!paused && !ended) { elapsed += 1; updateStats(); } }, 1000);
    };
    const cardHTML = (card, source, column = "", index = "") => {
      if (!card) return "";
      const selectedClass = selected && selected.source === source && selected.column === column && selected.index === Number(index) ? " is-selected" : "";
      return `<button class="sol-card ${card.faceUp ? (isRed(card.suit) ? "is-red" : "is-dark") : "is-back"}${selectedClass}" type="button" draggable="${card.faceUp}" data-source="${source}" data-column="${column}" data-index="${index}" data-card="${card.id}" aria-label="${card.faceUp ? `${rankLabel(card.rank)} ${card.suit}` : "Face down card"}">
        ${card.faceUp ? `<span>${rankLabel(card.rank)}</span><b>${suitMarks[card.suit]}</b>` : ""}
      </button>`;
    };
    const render = () => {
      const board = root.querySelector(".solitaire-board");
      const wasteCard = waste[waste.length - 1];
      board.innerHTML = `<div class="solitaire-top">
        <button class="sol-pile sol-stock ${stock.length ? "has-cards" : ""}" type="button" data-source="stock" aria-label="Draw from stock"><span>${stock.length || "↻"}</span></button>
        <div class="sol-pile sol-waste" data-drop="waste">${cardHTML(wasteCard, "waste")}</div>
        <div class="solitaire-spacer"></div>
        ${suits.map(suit => `<div class="sol-pile sol-foundation" data-foundation="${suit}" data-drop="foundation"><small>${suitMarks[suit]}</small>${cardHTML(foundations[suit][foundations[suit].length - 1], "foundation", suit, foundations[suit].length - 1)}</div>`).join("")}
      </div>
      <div class="sol-tableau">${tableau.map((column, columnIndex) => `<div class="sol-column" data-column-destination="${columnIndex}" data-drop="tableau">${column.map((card, cardIndex) => cardHTML(card, "tableau", columnIndex, cardIndex)).join("")}</div>`).join("")}</div>`;
      updateStats();
    };
    const deal = deck => {
      tableau = Array.from({ length: 7 }, () => []);
      foundations = { S: [], H: [], D: [], C: [] };
      waste = [];
      for (let column = 0; column < 7; column += 1) {
        for (let row = 0; row <= column; row += 1) {
          const card = deck.pop();
          card.faceUp = row === column;
          tableau[column].push(card);
        }
      }
      stock = deck.map(card => ({ ...card, faceUp: false }));
    };
    const selectedCards = () => {
      if (!selected) return [];
      if (selected.source === "waste") return waste.length ? [waste[waste.length - 1]] : [];
      if (selected.source === "tableau") return tableau[selected.column].slice(selected.index);
      if (selected.source === "foundation") {
        const pile = foundations[selected.column];
        return pile.length ? [pile[pile.length - 1]] : [];
      }
      return [];
    };
    const removeSelected = () => {
      if (selected.source === "waste") waste.pop();
      else if (selected.source === "tableau") tableau[selected.column].splice(selected.index);
      else if (selected.source === "foundation") foundations[selected.column].pop();
    };
    const canPlaceTableau = (card, column) => {
      const top = column[column.length - 1];
      return top ? top.faceUp && isRed(top.suit) !== isRed(card.suit) && top.rank === card.rank + 1 : card.rank === 13;
    };
    const moveToTableau = destination => {
      const cards = selectedCards();
      if (!cards.length || !canPlaceTableau(cards[0], tableau[destination])) return false;
      removeSelected();
      tableau[destination].push(...cards);
      selected = null;
      startTimer();
      setStatus("Move accepted.");
      render();
      return true;
    };
    const moveToFoundation = suit => {
      const cards = selectedCards();
      if (cards.length !== 1 || cards[0].suit !== suit || cards[0].rank !== foundations[suit].length + 1) return false;
      removeSelected();
      foundations[suit].push(cards[0]);
      selected = null;
      startTimer();
      render();
      if (suits.every(item => foundations[item].length === 13)) finish();
      return true;
    };
    const finish = () => {
      ended = true;
      clearInterval(timer);
      if (!best || elapsed < best) { best = elapsed; StorageManager.setNumber(StorageManager.keys.solitaireBest, best); }
      updateStats();
      showGameOver(root, { label: "SOLITAIRE COMPLETE", scoreLabel: "TIME", score: formatTime(elapsed), best: formatTime(best), onRetry: newGame });
    };
    const drawStock = () => {
      if (paused || ended) return;
      startTimer();
      selected = null;
      if (stock.length) {
        const card = stock.pop(); card.faceUp = true; waste.push(card);
      } else {
        stock = waste.reverse().map(card => ({ ...card, faceUp: false }));
        waste = [];
      }
      render();
    };
    const selectCard = (source, column, index) => {
      const numericColumn = source === "tableau" ? Number(column) : column;
      const numericIndex = Number(index || 0);
      if (source === "tableau") {
        const card = tableau[numericColumn][numericIndex];
        if (!card.faceUp) {
          if (numericIndex === tableau[numericColumn].length - 1) { card.faceUp = true; startTimer(); selected = null; render(); }
          return;
        }
      }
      selected = { source, column: numericColumn, index: numericIndex };
      render();
    };
    const autoFoundation = () => {
      const cards = selectedCards();
      if (cards.length === 1) moveToFoundation(cards[0].suit);
    };
    const clickHandler = event => {
      if (paused || ended) return;
      const stockButton = event.target.closest('[data-source="stock"]');
      if (stockButton) return drawStock();
      const foundation = event.target.closest("[data-foundation]");
      const columnZone = event.target.closest("[data-column-destination]");
      const card = event.target.closest(".sol-card");
      if (foundation && selected && moveToFoundation(foundation.dataset.foundation)) return;
      if (columnZone && selected && moveToTableau(Number(columnZone.dataset.columnDestination))) return;
      if (card) selectCard(card.dataset.source, card.dataset.column, card.dataset.index);
      else selected = null;
    };
    const doubleClickHandler = event => {
      const card = event.target.closest(".sol-card");
      if (!card || !card.draggable) return;
      selectCard(card.dataset.source, card.dataset.column, card.dataset.index);
      autoFoundation();
    };
    const dragStart = event => {
      const card = event.target.closest(".sol-card");
      if (!card || !card.draggable) return event.preventDefault();
      selected = { source: card.dataset.source, column: card.dataset.source === "tableau" ? Number(card.dataset.column) : card.dataset.column, index: Number(card.dataset.index || 0) };
      event.dataTransfer.setData("text/plain", card.dataset.card);
    };
    const dropHandler = event => {
      event.preventDefault();
      const foundation = event.target.closest("[data-foundation]");
      const column = event.target.closest("[data-column-destination]");
      if (foundation) moveToFoundation(foundation.dataset.foundation);
      else if (column) moveToTableau(Number(column.dataset.columnDestination));
    };
    const restart = () => {
      root.querySelector(".game-end")?.remove();
      clearInterval(timer);
      const lookup = Object.fromEntries(makeDeck().map(card => [card.id, card]));
      deal(initialOrder.map(id => ({ ...lookup[id] })));
      selected = null; elapsed = 0; timer = 0; timerStarted = false; paused = false; ended = false;
      setStatus("Tap a source card, then tap its destination. Double-click sends eligible cards home.");
      render();
    };
    const newGame = () => {
      root.querySelector(".game-end")?.remove();
      const deck = shuffle(makeDeck());
      initialOrder = deck.map(card => card.id);
      restart();
    };
    const mount = mountRoot => {
      root = mountRoot;
      root.innerHTML = `<div class="solitaire-layout"><div class="solitaire-board" aria-label="Klondike solitaire board"></div>
        <aside class="game-side solitaire-side"><p class="game-side__copy">Build alternating descending columns, then move each suit from Ace to King.</p>
          <div class="game-controls"><button class="game-control" type="button" data-action="restart">RESTART</button><button class="game-control game-control--accent" type="button" data-action="new">NEW GAME</button></div>
          <div class="game-status-line" role="status"></div>
        </aside></div>`;
      const board = root.querySelector(".solitaire-board");
      board.addEventListener("click", clickHandler);
      board.addEventListener("dblclick", doubleClickHandler);
      board.addEventListener("dragstart", dragStart);
      board.addEventListener("dragover", event => event.preventDefault());
      board.addEventListener("drop", dropHandler);
      root.querySelector('[data-action="restart"]').addEventListener("click", restart);
      root.querySelector('[data-action="new"]').addEventListener("click", newGame);
      newGame();
    };
    return { mount, pause: () => { paused = true; }, resume: () => { if (!ended) paused = false; }, destroy: () => clearInterval(timer) };
  };

  const PlatformGame = mode => {
    const tower = mode === "tower";
    const width = 300;
    const height = 520;
    let root;
    let canvas;
    let context;
    let readyFlow;
    let player;
    let platforms = [];
    let controls = { left: false, right: false };
    let score = 0;
    let best = StorageManager.getNumber(tower ? StorageManager.keys.towerBest : StorageManager.keys.downstairsBest, 0);
    let frame = 0;
    let previousTime = 0;
    let started = false;
    let paused = false;
    let gameOver = false;
    let destroyed = false;
    let platformId = 0;
    let lastLanded = null;

    const scoreLabel = tower ? "HEIGHT" : "FLOOR";
    const updateStats = () => GameManager.setStats([[scoreLabel, tower ? `${Math.floor(score)} M` : Math.floor(score)], ["BEST", tower ? `${Math.floor(best)} M` : Math.floor(best)]]);
    const setStatus = message => { root.querySelector(".game-status-line").textContent = message; };
    const makePlatform = (y, index = 0) => {
      const difficulty = Math.min(1, score / (tower ? 500 : 40));
      const platformWidth = randomBetween(74 - difficulty * 22, 104 - difficulty * 25);
      const moving = tower && index % 5 === 3;
      return { id: platformId++, x: randomBetween(8, width - platformWidth - 8), y, w: platformWidth, h: 8, moving, vx: moving ? (Math.random() > .5 ? .55 : -.55) : 0 };
    };
    const initializeWorld = () => {
      platformId = 0;
      platforms = [];
      if (tower) {
        for (let y = 500, index = 0; y >= 20; y -= randomBetween(62, 76), index += 1) platforms.push(makePlatform(y, index));
        const base = platforms[0];
        player = { x: base.x + base.w / 2 - 9, y: base.y - 19, w: 18, h: 18, vx: 0, vy: -8.2 };
      } else {
        for (let y = 105, index = 0; y <= 510; y += randomBetween(70, 86), index += 1) platforms.push(makePlatform(y, index));
        const base = platforms[0];
        player = { x: base.x + base.w / 2 - 9, y: base.y - 19, w: 18, h: 18, vx: 0, vy: 0 };
        lastLanded = base.id;
      }
    };
    const draw = () => {
      if (!context) return;
      const gradient = context.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "#15122e");
      gradient.addColorStop(1, tower ? "#182846" : "#2c1742");
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
      context.strokeStyle = "rgba(255,255,255,.04)";
      for (let y = 40; y < height; y += 40) { context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
      platforms.forEach(platform => {
        context.fillStyle = platform.moving ? "#ff62b0" : "#45e5dc";
        context.shadowColor = context.fillStyle;
        context.shadowBlur = 10;
        context.fillRect(platform.x, platform.y, platform.w, platform.h);
      });
      context.shadowBlur = 0;
      context.fillStyle = "#fff";
      context.beginPath(); context.arc(player.x + player.w / 2, player.y + player.h / 2, player.w / 2, 0, Math.PI * 2); context.fill();
      context.strokeStyle = "#a78bfa"; context.lineWidth = 3;
      context.beginPath(); context.arc(player.x + player.w / 2, player.y + player.h / 2, player.w / 2 + 4, 0, Math.PI * 2); context.stroke();
    };
    const stopLoop = () => { cancelAnimationFrame(frame); frame = 0; };
    const finish = () => {
      gameOver = true; started = false; stopLoop();
      const roundedScore = Math.floor(score);
      if (roundedScore > best) {
        best = roundedScore;
        StorageManager.setNumber(tower ? StorageManager.keys.towerBest : StorageManager.keys.downstairsBest, best);
      }
      updateStats();
      showGameOver(root, { label: tower ? "TOWER" : "DOWNSTAIRS", scoreLabel, score: tower ? `${roundedScore} M` : roundedScore, best: tower ? `${best} M` : best, onRetry: restart });
    };
    const updatePlatforms = delta => {
      platforms.forEach(platform => {
        if (platform.moving) {
          platform.x += platform.vx * delta;
          if (platform.x < 4 || platform.x + platform.w > width - 4) platform.vx *= -1;
        }
      });
      if (tower) {
        if (player.y < 185) {
          const shift = 185 - player.y;
          player.y = 185;
          platforms.forEach(platform => { platform.y += shift; });
          score += shift * .18;
          updateStats();
        }
        platforms = platforms.filter(platform => platform.y < height + 30);
        let highest = Math.min(...platforms.map(platform => platform.y));
        while (highest > -40) {
          highest -= randomBetween(62, 82);
          platforms.push(makePlatform(highest, platformId));
        }
      } else {
        const speed = Math.min(2.15, .55 + score * .025);
        platforms.forEach(platform => { platform.y -= speed * delta; });
        player.y -= speed * delta;
        platforms = platforms.filter(platform => platform.y > -24);
        let lowest = Math.max(...platforms.map(platform => platform.y));
        while (lowest < height + 30) {
          lowest += randomBetween(70, 92 + Math.min(18, score * .2));
          platforms.push(makePlatform(lowest, platformId));
        }
      }
    };
    const update = delta => {
      const acceleration = controls.left ? -0.42 : (controls.right ? .42 : 0);
      player.vx = clamp((player.vx + acceleration * delta) * .9, -3.4, 3.4);
      player.x = clamp(player.x + player.vx * delta, 0, width - player.w);
      const previousBottom = player.y + player.h;
      player.vy += .34 * delta;
      player.y += player.vy * delta;
      updatePlatforms(delta);
      if (player.vy >= 0) {
        const landed = platforms.find(platform => previousBottom <= platform.y + 4 && player.y + player.h >= platform.y && player.x + player.w > platform.x && player.x < platform.x + platform.w);
        if (landed) {
          player.y = landed.y - player.h;
          if (tower) player.vy = -8.4;
          else {
            player.vy = 0;
            if (lastLanded !== landed.id) { lastLanded = landed.id; score += 1; updateStats(); }
          }
        }
      }
      if (player.y > height + 35 || player.y < -45) finish();
    };
    const loop = timestamp => {
      if (!started || paused || gameOver || destroyed) return;
      const delta = previousTime ? clamp((timestamp - previousTime) / 16.67, .4, 2) : 1;
      previousTime = timestamp;
      update(delta);
      draw();
      if (!gameOver) frame = requestAnimationFrame(loop);
    };
    const startLoop = () => { if (!frame && started && !paused && !gameOver) { previousTime = 0; frame = requestAnimationFrame(loop); } };
    const togglePause = () => {
      if (!started || gameOver || readyFlow?.isActive()) return;
      paused = !paused;
      if (paused) { stopLoop(); setStatus("Paused. Press P or PAUSE to continue."); }
      else { setStatus(tower ? "Keep landing above the camera line." : "Move toward the next platform below."); startLoop(); }
    };
    const setControl = (key, value) => { controls[key] = value; };
    const keyDown = event => {
      if (["ArrowLeft", "a", "A"].includes(event.key)) { event.preventDefault(); setControl("left", true); }
      else if (["ArrowRight", "d", "D"].includes(event.key)) { event.preventDefault(); setControl("right", true); }
      else if (event.key === "p" || event.key === "P" || event.code === "Space") { event.preventDefault(); togglePause(); }
    };
    const keyUp = event => {
      if (["ArrowLeft", "a", "A"].includes(event.key)) setControl("left", false);
      if (["ArrowRight", "d", "D"].includes(event.key)) setControl("right", false);
    };
    const restart = () => {
      root.querySelector(".game-end")?.remove(); stopLoop();
      controls = { left: false, right: false }; score = 0; paused = false; started = false; gameOver = false; lastLanded = null;
      initializeWorld(); updateStats(); draw();
      setStatus(tower ? "Auto-jump is active. Guide the character toward higher platforms." : "Use left and right to land on the next platform below.");
      readyFlow.run();
    };
    const bindHold = (button, key) => {
      const start = event => { event.preventDefault(); setControl(key, true); };
      const end = () => setControl(key, false);
      button.addEventListener("pointerdown", start);
      ["pointerup", "pointercancel", "pointerleave"].forEach(type => button.addEventListener(type, end));
    };
    const resizeCanvas = () => { context = CanvasScaler.setup(canvas, width, height); draw(); };
    const mount = mountRoot => {
      root = mountRoot;
      root.innerHTML = `<div class="game-layout platform-layout"><div class="game-board-wrap"><canvas class="game-canvas platform-canvas" aria-label="${tower ? "Tower climbing" : "Downstairs"} game board"></canvas></div>
        <aside class="game-side"><p class="game-side__copy">${tower ? "The character jumps automatically. Steer toward the next platform." : "The world rises continuously. Drop toward safe platforms below."}</p>
          <div class="platform-controls"><button class="game-control" type="button" data-hold="left">LEFT</button><button class="game-control" type="button" data-hold="right">RIGHT</button></div>
          <div class="game-controls"><button class="game-control" type="button" data-action="pause">PAUSE</button><button class="game-control game-control--accent" type="button" data-action="restart">RESTART</button></div>
          <div class="game-status-line" role="status"></div>
        </aside></div>`;
      canvas = root.querySelector("canvas"); context = CanvasScaler.setup(canvas, width, height);
      readyFlow = ReadyFlow({ root, title: tower ? "TOWER" : "DOWNSTAIRS", controls: "LEFT / RIGHT", onStart: () => { started = true; if (!paused) startLoop(); } });
      bindHold(root.querySelector('[data-hold="left"]'), "left");
      bindHold(root.querySelector('[data-hold="right"]'), "right");
      root.querySelector('[data-action="pause"]').addEventListener("click", togglePause);
      root.querySelector('[data-action="restart"]').addEventListener("click", restart);
      addEventListener("keydown", keyDown); addEventListener("keyup", keyUp); addEventListener("resize", resizeCanvas);
      restart();
    };
    return {
      mount,
      pause: () => { if (!gameOver) { paused = true; stopLoop(); } },
      resume: () => { if (!gameOver) { paused = false; if (started) startLoop(); } },
      destroy: () => { destroyed = true; stopLoop(); readyFlow?.destroy(); removeEventListener("keydown", keyDown); removeEventListener("keyup", keyUp); removeEventListener("resize", resizeCanvas); }
    };
  };

  const GameManager = (() => {
    const gameDefinitions = Object.freeze({
      sudoku: { title: "SUDOKU", eyebrow: "SECRET 01 - NUMBER", layout: "square", create: SudokuGame },
      snake: { title: "SNAKE", eyebrow: "SECRET 02 - SNAKE", layout: "square", create: SnakeGame },
      tetris: { title: "BLOCKS", eyebrow: "SECRET 03 - BLOCK", layout: "portrait", create: TetrisGame },
      minesweeper: { title: "MINESWEEPER", eyebrow: "SECRET 04 - MINE", layout: "square", create: MinesweeperGame },
      solitaire: { title: "SOLITAIRE", eyebrow: "SECRET 05 - CARD", layout: "wide", create: SolitaireGame },
      downstairs: { title: "DOWNSTAIRS", eyebrow: "SECRET 06 - DOWN", layout: "portrait", create: () => PlatformGame("downstairs") },
      tower: { title: "TOWER", eyebrow: "SECRET 07 - UP", layout: "portrait", create: () => PlatformGame("tower") }
    });
    let activeGame = null;
    let activeName = null;
    let savedScroll = 0;
    let savedRoute = "";
    let previousFocus = null;
    let closingTimer = 0;
    let transitionRevision = 0;
    let surfaceStates = [];

    const setBackgroundInert = inert => {
      if (inert) {
        const surfaces = [
          document.querySelector("header"),
          document.querySelector("main"),
          document.querySelector("footer"),
          UIBridge.elements.dock,
          UIBridge.elements.prompt
        ].filter(Boolean);
        surfaceStates = surfaces.map(node => ({
          node,
          inert: node.inert,
          ariaHidden: node.getAttribute("aria-hidden")
        }));
        surfaceStates.forEach(({ node }) => {
          node.inert = true;
          node.setAttribute("aria-hidden", "true");
        });
        return;
      }
      surfaceStates.forEach(({ node, inert: wasInert, ariaHidden }) => {
        node.inert = wasInert;
        if (ariaHidden === null) node.removeAttribute("aria-hidden");
        else node.setAttribute("aria-hidden", ariaHidden);
      });
      surfaceStates = [];
    };

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
      setBackgroundInert(true);
    };

    const unlockPage = () => {
      document.body.classList.remove("game-mode");
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.style.width = "";
      setBackgroundInert(false);
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
      transitionRevision += 1;
      clearTimeout(closingTimer);
      EasterEggSpawner.removeActive(false);
      previousFocus = document.activeElement;
      activeName = name;
      UIBridge.elements.gameTitle.textContent = definition.title;
      UIBridge.elements.gameEyebrow.textContent = definition.eyebrow;
      UIBridge.elements.gameMount.innerHTML = "";
      UIBridge.elements.gameMount.dataset.layout = definition.layout;
      UIBridge.elements.overlay.dataset.game = name;
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
      const closeRevision = ++transitionRevision;
      activeGame.destroy();
      activeGame = null;
      activeName = null;
      showPause(false);
      UIBridge.elements.overlay.classList.remove("is-open");
      unlockPage();
      closingTimer = setTimeout(() => {
        if (closeRevision !== transitionRevision) return;
        UIBridge.elements.overlay.hidden = true;
        UIBridge.elements.gameMount.innerHTML = "";
        delete UIBridge.elements.gameMount.dataset.layout;
        delete UIBridge.elements.overlay.dataset.game;
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
