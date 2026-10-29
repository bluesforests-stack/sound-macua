(() => {
  "use strict";

  const experience = document.querySelector(".experience");
  const stage = document.getElementById("machine-stage");
  const machineImage = document.getElementById("machine-image");
  const gestureZone = document.getElementById("gesture-zone");
  const dragHandle = document.getElementById("drag-handle");
  const holesLayer = document.getElementById("holes-layer");
  const punchCount = document.getElementById("punch-count");
  const statusCity = document.querySelector(".status-city");
  const soundButton = document.querySelector(".sound-button");
  const soundCopy = document.querySelector(".sound-copy");
  const trackTitle = document.getElementById("track-title");
  const cityButtons = [...document.querySelectorAll(".city-button")];
  const barContainer = document.getElementById("audio-bars");
  const topPaper = document.querySelector(".top-paper");
  const endButton = document.getElementById("end-button");
  const archiveOverlay = document.getElementById("archive-overlay");
  const archiveClose = document.getElementById("archive-close");
  const archiveSummary = document.getElementById("archive-summary");
  const archiveLoading = document.getElementById("archive-loading");
  const archiveImage = document.getElementById("archive-image");
  const archiveDownload = document.getElementById("archive-download");
  const archiveRestart = document.getElementById("archive-restart");
  const guideButton = document.getElementById("guide-button");
  const tutorialOverlay = document.getElementById("tutorial-overlay");
  const tutorialStart = document.getElementById("tutorial-start");
  const listenProgress = document.getElementById("listen-progress");
  const pitchSlider = document.getElementById("pitch-slider");
  const pitchNote = document.getElementById("pitch-note");
  const melodyCanvas = document.getElementById("melody-canvas");
  const melodySummary = document.getElementById("melody-summary");
  const melodyPlay = document.getElementById("melody-play");
  const melodyDownload = document.getElementById("melody-download");
  const rollDownload = document.getElementById("roll-download");

  const cityData = {
    zhuhai: {
      image: "assets/zhuhai-machine.png",
      paper: "assets/zhuhai-paper.png",
      imageAlt: "綠色、粉色與白色相間的珠海城市聲音手搖打孔機",
      label: "珠海城市聲音",
      archiveCity: "珠海",
      archiveEnglish: "ZHUHAI",
      playlist: [
        { label: "澳琴國際教育大學城" },
        { label: "大學餐廳" },
        { label: "公園鳥鳴" },
        { label: "橫琴戶外公園" },
        { label: "金灣機場客機飛越" },
        { label: "珠海電動車" },
        { label: "珠海公交車" },
        { label: "珠海海邊海浪" },
        { label: "珠海籃球場" },
        { label: "珠海商場" },
        { label: "珠海煙花" },
        { label: "珠海有軌電車" },
      ],
    },
    macau: {
      image: "assets/macau-machine.png",
      paper: "assets/macau-paper.png",
      imageAlt: "綠色、粉色與白色相間的澳門城市聲音手搖打孔機",
      label: "澳門城市聲音",
      archiveCity: "澳門",
      archiveEnglish: "MACAU",
      playlist: [
        { label: "澳門輕軌刷卡" },
        { label: "澳門輕軌報站" },
        { label: "大三巴牌坊環境" },
        { label: "澳門巴士報站" },
        { label: "澳門舞獅" },
        { label: "媽閣廟上香" },
        { label: "行人交通燈提示" },
        { label: "澳門餐廳" },
        { label: "夜晚天橋" },
        { label: "澳門摩托車" },
        { label: "官也街環境" },
        { label: "黑沙灘海浪" },
      ],
    },
  };
  Object.entries(cityData).forEach(([city, data]) => {
    data.playlist.forEach((track, index) => {
      track.src = `assets/city-sounds/${city}/${String(index + 1).padStart(2, "0")}.mp3`;
    });
  });

  const state = {
    city: "zhuhai",
    dragging: false,
    startY: 0,
    progress: 0,
    thresholdBuzzed: false,
    animating: false,
    soundEnabled: false,
    autoSound: false,
    paperOffsets: { zhuhai: 0, macau: 0 },
    playlistIndices: { zhuhai: 0, macau: 0 },
    gearTurns: 0,
    counts: { zhuhai: 0, macau: 0 },
    holes: { zhuhai: [], macau: [] },
    lane: 4,
    responseClocks: { zhuhai: { elapsed: 0, since: null }, macau: { elapsed: 0, since: null } },
  };

  let audioContext = null;
  let analyser = null;
  let masterGain = null;
  let cityPlayer = null;
  let melodyPlayer = null;
  let currentScore = null;
  let soundRequestToken = 0;
  let archiveGenerationToken = 0;
  let resumeAfterVisibility = false;
  let frequencyData = null;
  let holeId = 0;
  let archiveObjectUrl = null;
  const PAPER_STEP = 34;
  const PAPER_SOURCE_WIDTH = 694;
  const PAPER_SOURCE_HEIGHT = 6149;
  const TUTORIAL_STORAGE_KEY = "city-sonic-punch-guide-v1";
  const paperImageCache = new Map();
  const pitchNames = ["C5", "D5", "E5", "G5", "A5", "C6", "D6", "E6", "G6", "A6"];

  function pauseResponseClock() {
    const clock = state.responseClocks[state.city];
    if (clock.since !== null) clock.elapsed += (performance.now() - clock.since) / 1000;
    clock.since = null;
  }

  function responseTime() {
    const clock = state.responseClocks[state.city];
    if (clock.since === null) clock.since = performance.now();
    return clock.elapsed + (performance.now() - clock.since) / 1000;
  }

  pitchSlider.addEventListener("input", () => {
    state.lane = Number(pitchSlider.value);
    pitchNote.textContent = pitchNames[state.lane];
    pitchSlider.setAttribute("aria-valuetext", pitchNames[state.lane]);
  });

  const bars = Array.from({ length: 18 }, (_, index) => {
    const bar = document.createElement("i");
    bar.style.setProperty("--bar", String(0.18 + (index % 4) * 0.08));
    barContainer.appendChild(bar);
    return bar;
  });

  function playbackSnapshot() {
    return cityPlayer?.getSnapshot(state.city) || {
      index: 0, previousIndex: null, elapsed: 0, progress: 0,
      playing: false, loading: false, complete: false,
    };
  }

  function updateTrackUI() {
    const snapshot = playbackSnapshot();
    const index = snapshot.index || 0;
    const number = String(index + 1).padStart(2, "0");
    state.playlistIndices[state.city] = index;
    if (snapshot.loading) {
      trackTitle.textContent = "正在預載 12 段城市聲音…";
    } else if (snapshot.complete) {
      trackTitle.textContent = "12 / 12 已聽完 · 點擊 OK 聽見自己的旋律";
    } else {
      const overlap = snapshot.previousIndex == null ? "" : " · 交疊中";
      const active = snapshot.activeIndices?.length ? snapshot.activeIndices : [index];
      const labels = active.map((i) => `${String(i + 1).padStart(2, "0")} ${cityData[state.city].playlist[i].label}`);
      trackTitle.textContent = `${labels.join(" ＋ ")}${overlap}`;
    }
    listenProgress.value = snapshot.progress || 0;
    listenProgress.setAttribute("aria-label", `城市聲音試聽進度 ${Math.round((snapshot.progress || 0) * 100)}%`);
  }

  function ensureAudioGraph() {
    if (!audioContext) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) throw new Error("此瀏覽器暫不支援聲音播放");
      audioContext = new Context();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.76;
      masterGain = audioContext.createGain();
      masterGain.gain.value = 0.62;
      const limiter = audioContext.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 12;
      limiter.ratio.value = 8;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.2;
      masterGain.connect(limiter);
      limiter.connect(analyser);
      analyser.connect(audioContext.destination);
      frequencyData = new Uint8Array(analyser.frequencyBinCount);
      cityPlayer = new window.CitySoundPlayer({
        context: audioContext,
        output: masterGain,
        playlists: Object.fromEntries(Object.entries(cityData).map(([city, data]) => [city, data.playlist])),
        onChange: () => { updateTrackUI(); updateSoundUI(); },
        onComplete: (city) => {
          if (city !== state.city) return;
          state.soundEnabled = false;
          state.autoSound = false;
          updateSoundUI();
          updateTrackUI();
          endButton.classList.add("is-ready");
        },
      });
      melodyPlayer = new window.CityMusicRoll.Player({
        context: audioContext,
        output: masterGain,
        onTick: (time) => {
          if (currentScore) window.CityMusicRoll.draw(melodyCanvas, currentScore, { playhead: time, width: 1200 });
        },
        onEnded: () => {
          melodyPlay.textContent = "再聽一次";
          melodyPlay.setAttribute("aria-pressed", "false");
          if (currentScore) window.CityMusicRoll.draw(melodyCanvas, currentScore, { width: 1200 });
        },
      });
    }
  }

  async function enableSound() {
    const token = ++soundRequestToken;
    const city = state.city;
    try {
      ensureAudioGraph();
      const resume = audioContext.state === "suspended" ? audioContext.resume() : Promise.resolve();
      melodyPlayer?.stop();
      state.soundEnabled = true;
      updateSoundUI();
      const playing = cityPlayer.play(city);
      await Promise.all([resume, playing]);
    } catch (error) {
      if (token !== soundRequestToken || city !== state.city) return;
      state.soundEnabled = false;
      state.autoSound = false;
      updateSoundUI();
      trackTitle.textContent = "聲音尚未載入，請再點一次音樂開關";
      console.warn(error);
    }
  }

  function disableSound() {
    ++soundRequestToken;
    cityPlayer?.pause();
    state.soundEnabled = false;
    updateSoundUI();
    updateTrackUI();
  }

  function updateSoundUI() {
    const snapshot = playbackSnapshot();
    soundButton.setAttribute("aria-pressed", String(state.soundEnabled));
    soundCopy.textContent = snapshot.loading && state.soundEnabled
      ? "LOADING…" : state.soundEnabled ? "SOUND ON" : snapshot.complete ? "REPLAY" : "SOUND OFF";
  }

  soundButton.addEventListener("click", () => {
    if (state.soundEnabled) {
      state.autoSound = false;
      disableSound();
    } else {
      endButton.classList.remove("is-ready");
      state.autoSound = true;
      enableSound();
    }
  });

  function hasSeenTutorial() {
    try {
      return window.localStorage.getItem(TUTORIAL_STORAGE_KEY) === "seen";
    } catch (_) {
      return false;
    }
  }

  function showTutorial() {
    pauseResponseClock();
    state.autoSound = false;
    disableSound();
    tutorialOverlay.hidden = false;
    experience.inert = true;
    window.requestAnimationFrame(() => tutorialStart.focus());
  }

  function closeTutorial() {
    try {
      window.localStorage.setItem(TUTORIAL_STORAGE_KEY, "seen");
    } catch (_) {
      // The guide still closes when storage is unavailable.
    }
    tutorialOverlay.hidden = true;
    experience.inert = false;
    soundButton.focus();
  }

  guideButton.addEventListener("click", showTutorial);
  tutorialStart.addEventListener("click", closeTutorial);

  function playPunchImpact() {
    if (!audioContext || !state.soundEnabled) return;
    const now = audioContext.currentTime;

    const oscillator = audioContext.createOscillator();
    const oscillatorGain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(116, now);
    oscillator.frequency.exponentialRampToValueAtTime(52, now + 0.11);
    oscillatorGain.gain.setValueAtTime(0.0001, now);
    oscillatorGain.gain.exponentialRampToValueAtTime(0.17, now + 0.008);
    oscillatorGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
    oscillator.connect(oscillatorGain).connect(masterGain);
    oscillator.start(now);
    oscillator.stop(now + 0.14);

    const noiseLength = Math.floor(audioContext.sampleRate * 0.075);
    const noiseBuffer = audioContext.createBuffer(1, noiseLength, audioContext.sampleRate);
    const noise = noiseBuffer.getChannelData(0);
    for (let index = 0; index < noise.length; index += 1) {
      noise[index] = (Math.random() * 2 - 1) * (1 - index / noise.length);
    }
    const noiseSource = audioContext.createBufferSource();
    const noiseFilter = audioContext.createBiquadFilter();
    const noiseGain = audioContext.createGain();
    noiseSource.buffer = noiseBuffer;
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 1380;
    noiseFilter.Q.value = 0.7;
    noiseGain.gain.setValueAtTime(0.22, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    noiseSource.connect(noiseFilter).connect(noiseGain).connect(masterGain);
    noiseSource.start(now);
  }

  function maxPullDistance() {
    return Math.max(54, gestureZone.clientHeight - dragHandle.offsetHeight * 0.76);
  }

  function setPullProgress(progress, immediate = true) {
    state.progress = Math.max(0, Math.min(1, progress));
    const distance = state.progress * maxPullDistance();
    dragHandle.classList.toggle("is-dragging", immediate && state.dragging);
    stage.style.setProperty("--pull-y", `${distance}px`);
    stage.style.setProperty("--pull-progress", state.progress.toFixed(3));
    stage.style.setProperty("--gear-turn", `${state.gearTurns + state.progress * 46}deg`);
    stage.style.setProperty("--gear-turn-reverse", `${-(state.gearTurns + state.progress * 46) * 1.35}deg`);

    if (state.progress >= 0.72 && !state.thresholdBuzzed) {
      state.thresholdBuzzed = true;
      if (navigator.vibrate) navigator.vibrate(16);
      dragHandle.classList.add("is-ready");
    }
    if (state.progress < 0.62) {
      state.thresholdBuzzed = false;
      dragHandle.classList.remove("is-ready");
    }
  }

  function onPointerDown(event) {
    if (state.animating) return;
    state.dragging = true;
    state.startY = event.clientY;
    state.thresholdBuzzed = false;
    dragHandle.setPointerCapture?.(event.pointerId);
    dragHandle.classList.add("is-dragging");
    if (state.autoSound && !state.soundEnabled) enableSound();
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!state.dragging) return;
    const delta = Math.max(0, event.clientY - state.startY);
    setPullProgress(delta / maxPullDistance());
    event.preventDefault();
  }

  function finishPointer(event) {
    if (!state.dragging) return;
    const shouldPunch = state.progress >= 0.72;
    state.dragging = false;
    dragHandle.classList.remove("is-dragging", "is-ready");
    if (event?.pointerId != null && dragHandle.hasPointerCapture?.(event.pointerId)) {
      dragHandle.releasePointerCapture(event.pointerId);
    }
    if (shouldPunch) commitPunch();
    setPullProgress(0, false);
  }

  dragHandle.addEventListener("pointerdown", onPointerDown);
  dragHandle.addEventListener("pointermove", onPointerMove);
  dragHandle.addEventListener("pointerup", finishPointer);
  dragHandle.addEventListener("pointercancel", finishPointer);

  function renderHoles() {
    holesLayer.replaceChildren();
    const activeHoles = state.holes[state.city].slice(-12);
    activeHoles.forEach((hole, index) => {
      const age = activeHoles.length - 1 - index;
      const element = document.createElement("span");
      element.className = "hole";
      element.dataset.id = String(hole.id);
      element.style.setProperty("--hole-x", `${hole.x}%`);
      element.style.setProperty("--hole-y", "91%");
      element.style.setProperty("--hole-shift", `${-age * PAPER_STEP}px`);
      element.style.opacity = String(Math.max(0.2, 1 - age * 0.055));
      holesLayer.appendChild(element);
    });
  }

  function addHole() {
    const cityHoles = state.holes[state.city];
    const paperScale = Math.max(0.001, topPaper.clientWidth / PAPER_SOURCE_WIDTH);
    const paperY = topPaper.clientHeight * 0.91 - state.paperOffsets[state.city];
    const sourceY = ((paperY / paperScale) % PAPER_SOURCE_HEIGHT + PAPER_SOURCE_HEIGHT) % PAPER_SOURCE_HEIGHT;
    cityHoles.push({
      id: ++holeId,
      x: 12 + state.lane / 9 * 76,
      lane: state.lane,
      elapsed: responseTime(),
      trackIndex: playbackSnapshot().index,
      sourceY,
    });
    renderHoles();
  }

  function commitPunch() {
    state.counts[state.city] += 1;
    state.paperOffsets[state.city] -= PAPER_STEP;
    state.gearTurns += 64;
    punchCount.textContent = String(state.counts[state.city]).padStart(2, "0");
    stage.style.setProperty("--paper-y", `${state.paperOffsets[state.city]}px`);
    stage.style.setProperty("--gear-turn", `${state.gearTurns}deg`);
    stage.style.setProperty("--gear-turn-reverse", `${-state.gearTurns * 1.35}deg`);
    addHole();

    stage.classList.remove("is-punching");
    void stage.offsetWidth;
    stage.classList.add("is-punching");
    window.setTimeout(() => stage.classList.remove("is-punching"), 360);

    playPunchImpact();
    if (navigator.vibrate) navigator.vibrate([24, 22, 18]);
  }

  function simulatePunch() {
    if (state.animating || state.dragging) return;
    state.animating = true;
    if (state.autoSound && !state.soundEnabled) enableSound();
    dragHandle.style.transition = "transform 210ms cubic-bezier(.2,.8,.2,1)";
    setPullProgress(1, false);
    window.setTimeout(() => {
      commitPunch();
      setPullProgress(0, false);
      window.setTimeout(() => {
        dragHandle.style.removeProperty("transition");
        state.animating = false;
      }, 280);
    }, 220);
  }

  dragHandle.addEventListener("keydown", (event) => {
    if ([" ", "Enter", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      simulatePunch();
    }
  });

  dragHandle.addEventListener("dblclick", (event) => {
    event.preventDefault();
    simulatePunch();
  });

  function setCity(city) {
    if (!cityData[city] || city === state.city || state.animating || state.dragging) return;
    const resume = state.soundEnabled;
    pauseResponseClock();
    disableSound();
    state.city = city;
    experience.dataset.city = city;
    endButton.classList.remove("is-ready");
    cityButtons.forEach((button) => {
      const active = button.dataset.city === city;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    stage.setAttribute("aria-labelledby", `${city}-tab`);
    machineImage.src = cityData[city].image;
    machineImage.alt = cityData[city].imageAlt;
    statusCity.textContent = cityData[city].label;
    punchCount.textContent = String(state.counts[city]).padStart(2, "0");
    stage.style.setProperty("--paper-y", `${state.paperOffsets[city]}px`);
    updateTrackUI();
    updateSoundUI();
    renderHoles();
    setPullProgress(0, false);
    if (resume) enableSound();
  }

  cityButtons.forEach((button) => {
    button.addEventListener("click", () => setCity(button.dataset.city));
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const nextCity = event.key === "ArrowLeft" ? "zhuhai" : "macau";
      setCity(nextCity);
      document.getElementById(`${nextCity}-tab`).focus();
    });
  });

  function loadPaperImage(src) {
    if (paperImageCache.has(src)) return paperImageCache.get(src);
    const request = new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Unable to load ${src}`));
      image.src = src;
    });
    paperImageCache.set(src, request);
    return request;
  }

  function archiveStamp() {
    const now = new Date();
    const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
      .map((part, index) => index === 0 ? String(part) : String(part).padStart(2, "0"))
      .join("");
    const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
      .map((part) => String(part).padStart(2, "0"))
      .join("");
    return { date, time, readable: `${date.slice(0, 4)}.${date.slice(4, 6)}.${date.slice(6)} / ${time}` };
  }

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  async function composeArchive(city, snapshot, maxCanvasHeight = 8190) {
    const data = cityData[city];
    const paper = await loadPaperImage(data.paper);
    const canvas = document.createElement("canvas");
    const paperX = 50;
    const paperTop = 50;
    const footerGap = 18;
    const footerHeight = 300;
    const rollHeight = 350;
    const fixedHeight = paperTop + footerGap + footerHeight + rollHeight + 68;
    const safePaperWidth = Math.floor((maxCanvasHeight - fixedHeight) * paper.naturalWidth / paper.naturalHeight);
    const paperWidth = Math.min(820, Math.max(300, safePaperWidth));
    const paperHeight = Math.round(paper.naturalHeight * paperWidth / paper.naturalWidth);
    const typeScale = Math.max(0.62, paperWidth / 820);
    canvas.width = paperWidth + paperX * 2;
    canvas.height = paperTop + paperHeight + footerGap + footerHeight + rollHeight + 68;

    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#d7dbdc";
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.save();
    context.shadowColor = "rgba(0, 0, 0, 0.22)";
    context.shadowBlur = 22;
    context.shadowOffsetY = 8;
    context.fillStyle = "#ffffff";
    context.fillRect(paperX, paperTop, paperWidth, paperHeight);
    context.restore();
    context.drawImage(paper, paperX, paperTop, paperWidth, paperHeight);

    const scale = paperWidth / paper.naturalWidth;
    snapshot.holes.forEach((hole) => {
      const x = paperX + paperWidth * hole.x / 100;
      const normalizedSourceY = Number.isFinite(hole.sourceY) ? hole.sourceY : 0;
      const y = paperTop + normalizedSourceY * scale;
      const radius = 10;

      context.save();
      context.shadowColor = "rgba(0, 0, 0, 0.38)";
      context.shadowBlur = 5;
      context.shadowOffsetY = 2;
      context.fillStyle = "#080808";
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      context.restore();

      context.strokeStyle = "rgba(255, 157, 189, 0.72)";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(x, y, radius + 3, 0, Math.PI * 2);
      context.stroke();
    });

    const rollCanvas = document.createElement("canvas");
    window.CityMusicRoll.draw(rollCanvas, snapshot.score, { width: paperWidth, height: rollHeight, pixelRatio: 1 });
    context.drawImage(rollCanvas, paperX, paperTop + paperHeight + footerGap);
    const footerY = paperTop + paperHeight + footerGap + rollHeight + 18;
    roundedRect(context, paperX, footerY, paperWidth, footerHeight, 6);
    context.fillStyle = "#101111";
    context.fill();

    context.fillStyle = "#008c68";
    context.fillRect(paperX + 30, footerY + 28, 82, 7);
    context.fillStyle = "#ff9dbd";
    context.fillRect(paperX + 118, footerY + 28, 34, 7);

    context.fillStyle = "#ffffff";
    context.font = `700 ${Math.round(28 * typeScale)}px Arial, sans-serif`;
    context.fillText("SOUND PUNCH ARCHIVE", paperX + 30, footerY + 76, paperWidth - 60);
    context.font = `700 ${Math.round(17 * typeScale)}px Arial, sans-serif`;
    context.fillText(`${data.archiveCity} / ${data.archiveEnglish}`, paperX + 30, footerY + 108, paperWidth - 60);

    const countLabel = String(snapshot.count).padStart(2, "0");
    context.fillStyle = "#b9bebe";
    context.font = `500 ${Math.round(13 * typeScale)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    context.fillText(`${countLabel} HOLES  ·  ${snapshot.stamp.readable}  ·  ARCHIVE ${data.archiveEnglish}-${snapshot.stamp.date}-${countLabel}`, paperX + 30, footerY + 137, paperWidth - 60);

    context.font = `500 ${Math.round(12 * typeScale)}px Arial, sans-serif`;
    const columnWidth = (paperWidth - 60) / 2;
    data.playlist.forEach((track, index) => {
      const column = index < 6 ? 0 : 1;
      const row = index % 6;
      const x = paperX + 30 + column * columnWidth;
      const y = footerY + 166 + row * 17;
      context.fillStyle = index % 2 === 0 ? "#ffffff" : "#d4d7d7";
      context.fillText(`${String(index + 1).padStart(2, "0")}  ${track.label}`, x, y, columnWidth - 12);
    });

    return canvas;
  }

  function canvasToJpeg(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("JPG export failed"));
      }, "image/jpeg", 0.96);
    });
  }

  async function exportArchiveJpeg(city, snapshot) {
    try {
      const fullCanvas = await composeArchive(city, snapshot, 8190);
      return await canvasToJpeg(fullCanvas);
    } catch (error) {
      console.warn("Full-resolution JPG export unavailable; using mobile-safe size.", error);
      const safeCanvas = await composeArchive(city, snapshot, 4090);
      return canvasToJpeg(safeCanvas);
    }
  }

  function stopMelody() {
    melodyPlayer?.stop();
    melodyPlay.textContent = "試聽我的八音盒";
    melodyPlay.setAttribute("aria-pressed", "false");
    if (currentScore) window.CityMusicRoll.draw(melodyCanvas, currentScore, { width: 1200 });
  }

  async function finishSession() {
    if (state.animating || state.dragging) return;
    const token = ++archiveGenerationToken;
    const city = state.city;
    const data = cityData[city];
    pauseResponseClock();
    const snapshot = {
      city, count: state.counts[city],
      holes: state.holes[city].map((hole) => ({ ...hole })),
      stamp: archiveStamp(),
    };
    snapshot.score = window.CityMusicRoll.build({ city, holes: snapshot.holes });
    currentScore = snapshot.score;
    disableSound();
    stopMelody();
    experience.inert = true;
    archiveOverlay.hidden = false;
    archiveOverlay.dataset.city = city;
    archiveImage.hidden = true;
    archiveLoading.innerHTML = "<i></i><span>GENERATING JPG</span>";
    archiveLoading.hidden = false;
    archiveSummary.textContent = `${data.archiveCity}｜正在合成完整紙帶與 ${snapshot.count} 個孔位。`;
    melodyPlay.disabled = !snapshot.count;
    melodyDownload.disabled = !snapshot.count;
    rollDownload.disabled = !snapshot.count;
    const timeNote = currentScore.tempoScale < 0.999
      ? `；為便於試聽，時間等比例縮為 ${Math.round(currentScore.tempoScale * 100)}%` : "";
    melodySummary.textContent = snapshot.count
      ? `${snapshot.count} 個孔 = ${snapshot.count} 個音符 · ${currentScore.duration.toFixed(1)} 秒。這是你的打孔節奏，不是原聲錄音${timeNote}。`
      : "還沒有孔位。返回後選擇音高並下拉手柄，留下你的第一個音符。";
    archiveDownload.classList.add("is-disabled");
    archiveDownload.setAttribute("aria-disabled", "true");
    archiveDownload.removeAttribute("href");
    endButton.disabled = true;
    archiveClose.focus();
    try {
      const blob = await exportArchiveJpeg(city, snapshot);
      if (token !== archiveGenerationToken) return;
      if (archiveObjectUrl) URL.revokeObjectURL(archiveObjectUrl);
      archiveObjectUrl = URL.createObjectURL(blob);
      archiveImage.src = archiveObjectUrl;
      archiveImage.alt = `${data.archiveCity}打孔後的完整聲音檔案與音符紙帶 JPG`;
      archiveImage.hidden = false;
      archiveLoading.hidden = true;
      archiveDownload.href = archiveObjectUrl;
      archiveDownload.download = `${snapshot.stamp.date}_${data.archiveCity}_專屬聲音檔案.jpg`;
      archiveDownload.classList.remove("is-disabled");
      archiveDownload.setAttribute("aria-disabled", "false");
      archiveSummary.textContent = `${data.archiveCity}｜${snapshot.count} 個孔位已保存，可下載完整檔案或單獨的音樂紙帶。`;
    } catch (error) {
      if (token !== archiveGenerationToken) return;
      archiveLoading.innerHTML = "<strong>圖片生成失敗</strong><span>可關閉後重試；打孔記錄仍然保留。</span>";
      console.error(error);
    } finally {
      endButton.disabled = false;
    }
  }

  function closeArchive() {
    ++archiveGenerationToken;
    stopMelody();
    archiveOverlay.hidden = true;
    experience.inert = false;
    endButton.disabled = false;
    endButton.focus();
  }

  function resetCurrentCity() {
    const city = archiveOverlay.dataset.city || state.city;
    state.counts[city] = 0;
    state.holes[city] = [];
    state.responseClocks[city] = { elapsed: 0, since: null };
    state.paperOffsets[city] = 0;
    state.playlistIndices[city] = 0;
    cityPlayer?.reset(city);
    state.autoSound = false;
    state.soundEnabled = false;
    punchCount.textContent = "00";
    endButton.classList.remove("is-ready");
    stage.style.setProperty("--paper-y", "0px");
    updateTrackUI(); updateSoundUI(); renderHoles(); closeArchive();
  }

  melodyPlay.addEventListener("click", async () => {
    if (!currentScore?.notes.length) return;
    if (melodyPlayer?.playing) { stopMelody(); return; }
    try {
      ensureAudioGraph();
      disableSound();
      await audioContext.resume();
      await melodyPlayer.play(currentScore);
      melodyPlay.textContent = "停止試聽";
      melodyPlay.setAttribute("aria-pressed", "true");
    } catch (error) {
      melodySummary.textContent = "瀏覽器未能播放，請再點一次試聽。";
      console.warn(error);
    }
  });

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = filename;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  melodyDownload.addEventListener("click", async () => {
    const score = currentScore;
    if (!score?.notes.length) return;
    melodyDownload.disabled = true;
    melodyDownload.textContent = "正在合成…";
    try {
      const blob = await window.CityMusicRoll.wav(score);
      downloadBlob(blob, `${cityData[score.city].archiveCity}_我的八音盒.wav`);
    } catch (error) {
      melodySummary.textContent = "聲音下載失敗，可再次嘗試；網頁試聽與圖片不受影響。";
      console.warn(error);
    } finally {
      melodyDownload.disabled = !currentScore?.notes.length;
      melodyDownload.textContent = "下載旋律 WAV";
    }
  });

  rollDownload.addEventListener("click", async () => {
    const score = currentScore;
    if (!score?.notes.length) return;
    try {
      const canvas = document.createElement("canvas");
      window.CityMusicRoll.draw(canvas, score, { width: 2400, height: 800, pixelRatio: 1 });
      downloadBlob(await canvasToJpeg(canvas), `${cityData[score.city].archiveCity}_我的音樂紙帶.jpg`);
    } catch (error) {
      melodySummary.textContent = "紙帶圖片下載失敗，請重試。";
      console.warn(error);
    }
  });

  endButton.addEventListener("click", finishSession);
  archiveClose.addEventListener("click", closeArchive);
  archiveRestart.addEventListener("click", resetCurrentCity);
  archiveDownload.addEventListener("click", (event) => {
    if (archiveDownload.getAttribute("aria-disabled") === "true") event.preventDefault();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !archiveOverlay.hidden) closeArchive();
    else if (event.key === "Escape" && !tutorialOverlay.hidden) closeTutorial();
  });



  let meterTick = -1;
  function animateMeters(time) {
    if (Math.floor(time / 200) !== meterTick) { meterTick = Math.floor(time / 200); updateTrackUI(); }
    if (analyser && state.soundEnabled) {
      analyser.getByteFrequencyData(frequencyData);
      bars.forEach((bar, index) => {
        const sourceIndex = Math.min(
          frequencyData.length - 1,
          Math.floor((index / bars.length) ** 1.45 * frequencyData.length)
        );
        const normalized = Math.max(0.08, frequencyData[sourceIndex] / 255);
        bar.style.setProperty("--bar", normalized.toFixed(3));
      });
    } else {
      bars.forEach((bar, index) => {
        const idle = 0.11 + 0.08 * (1 + Math.sin(time * 0.0016 + index * 0.72)) / 2;
        bar.style.setProperty("--bar", idle.toFixed(3));
      });
    }
    requestAnimationFrame(animateMeters);
  }

  window.addEventListener("resize", () => setPullProgress(0, false));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      resumeAfterVisibility = state.soundEnabled;
      pauseResponseClock();
      disableSound();
      melodyPlayer?.stop();
    } else if (resumeAfterVisibility && archiveOverlay.hidden && tutorialOverlay.hidden) {
      resumeAfterVisibility = false;
      enableSound();
    }
  });

  renderHoles();
  updateTrackUI();
  updateSoundUI();
  showTutorial();
  requestAnimationFrame(animateMeters);
})();
