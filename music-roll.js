(() => {
  "use strict";

  // A digital score, not a template for any particular mechanical music box.
  const MIDI = Object.freeze([72, 74, 76, 79, 81, 84, 86, 88, 91, 93]);
  const LABELS = Object.freeze(["C5", "D5", "E5", "G5", "A5", "C6", "D6", "E6", "G6", "A6"]);
  const LANES = Object.freeze(MIDI.map((midi, i) => Object.freeze({ midi, label: LABELS[i] })));
  const NOTE_DURATION = 2.4;
  const LEAD_IN = 0.4;
  const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const frequencyFor = (midi) => 440 * 2 ** ((midi - 69) / 12);

  function build({ city = "zhuhai", holes = [], maxDuration = 60 } = {}) {
    const limit = clamp(finite(maxDuration, 60), 4, 120);
    const events = holes.map((hole, index) => ({
      id: typeof hole.id === "string" || typeof hole.id === "number" ? hole.id : index + 1,
      lane: Number.isInteger(hole.lane)
        ? clamp(hole.lane, 0, 9)
        : Math.round(clamp(finite(hole.x, 0.5), 0, 1) * 9),
      elapsed: Math.max(0, finite(hole.elapsed, index * 0.5)),
      trackIndex: Number.isInteger(hole.trackIndex) ? hole.trackIndex : null,
      order: index,
    })).sort((a, b) => a.elapsed - b.elapsed || a.order - b.order);
    const sourceOffset = events.length ? events[0].elapsed : 0;
    const sourceSpan = events.length ? events[events.length - 1].elapsed - sourceOffset : 0;
    const tempoScale = sourceSpan > 0 ? Math.min(1, (limit - LEAD_IN - NOTE_DURATION) / sourceSpan) : 1;
    const notes = Object.freeze(events.map((event) => Object.freeze({
      time: LEAD_IN + (event.elapsed - sourceOffset) * tempoScale,
      duration: NOTE_DURATION,
      midi: MIDI[event.lane],
      frequency: frequencyFor(MIDI[event.lane]),
      lane: event.lane,
      holeId: event.id,
      sourceElapsed: event.elapsed,
      trackIndex: event.trackIndex,
    })));
    // Derive a stable mix level for dense chords without dropping any holes.
    let left = 0;
    let maxPolyphony = 1;
    notes.forEach((note, right) => {
      while (left < right && notes[left].time + NOTE_DURATION <= note.time) left += 1;
      maxPolyphony = Math.max(maxPolyphony, right - left + 1);
    });
    return Object.freeze({
      version: 1,
      city: String(city),
      notes,
      lanes: LANES,
      duration: notes.length ? notes[notes.length - 1].time + NOTE_DURATION : 0,
      sourceOffset,
      sourceSpan,
      tempoScale,
      leadIn: notes.length ? LEAD_IN : 0,
      voiceGain: 0.32 / Math.max(1, Math.sqrt(maxPolyphony)),
      mapping: "C major pentatonic; lane determines pitch; elapsed listening time determines rhythm",
    });
  }

  function draw(canvas, score, { playhead = null, width, height, pixelRatio } = {}) {
    if (!canvas || !score) return null;
    const w = Math.max(280, Math.round(width || canvas.clientWidth || 1000));
    const h = Math.max(270, Math.round(height || Math.max(330, Math.min(440, w * 0.43))));
    const ratio = clamp(finite(pixelRatio, window.devicePixelRatio || 1), 1, 4);
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);

    const narrow = w < 520;
    const padding = narrow ? 18 : 30;
    const left = padding + 34;
    const right = w - padding;
    const top = narrow ? 86 : 90;
    const bottom = h - 60;
    const lineSpace = (bottom - top) / 9;
    const duration = Math.max(4, score.duration);
    const tx = (time) => left + time / duration * (right - left);
    const ly = (lane) => bottom - lane * lineSpace;
    const cityName = score.city === "macau" ? "澳門 MACAU" : score.city === "zhuhai" ? "珠海 ZHUHAI" : score.city;
    ctx.fillStyle = "#202724";
    ctx.font = `500 ${narrow ? 16 : 19}px system-ui, sans-serif`;
    ctx.fillText("我的聲音紙帶", padding, 30);
    if (!narrow) {
      ctx.fillStyle = "#818783";
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText("MY CITY MUSIC ROLL", padding + 160, 28);
    }
    ctx.fillStyle = "#757b77";
    ctx.font = `${narrow ? 10 : 11}px ui-monospace, monospace`;
    ctx.fillText(`${cityName}   /   ${score.notes.length} NOTES   /   ${score.duration.toFixed(1)} S`, padding, 51);

    const step = duration > 40 ? 10 : duration > 18 ? 5 : duration > 8 ? 2 : 1;
    ctx.lineWidth = 0.7;
    ctx.textAlign = "center";
    ctx.font = "9px ui-monospace, monospace";
    for (let t = 0; t <= duration; t += step) {
      const x = tx(t);
      ctx.strokeStyle = "#eff1ee";
      ctx.beginPath();
      ctx.moveTo(x, top - 10);
      ctx.lineTo(x, bottom + 11);
      ctx.stroke();
      ctx.fillStyle = "#8b918c";
      ctx.fillText(`${t}s`, x, bottom + 27);
    }
    ctx.textAlign = "right";
    score.lanes.forEach((lane, index) => {
      const y = ly(index);
      ctx.strokeStyle = "#dfe4df";
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
      ctx.fillStyle = "#7a817b";
      ctx.fillText(lane.label, left - 10, y + 3);
    });

    score.notes.forEach((note) => {
      const active = playhead !== null && playhead >= note.time && playhead < note.time + 0.35;
      const x = tx(note.time);
      const y = ly(note.lane);
      const radius = narrow ? 3.4 : 4.2;
      ctx.fillStyle = active ? "#08785d" : "#303c35";
      ctx.beginPath();
      ctx.arc(x, y, active ? radius + 1.4 : radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.34, 0, Math.PI * 2);
      ctx.fill();
    });
    if (playhead !== null && score.notes.length) {
      const x = tx(clamp(playhead, 0, duration));
      ctx.strokeStyle = "#08785d";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(x, top - 12);
      ctx.lineTo(x, bottom + 12);
      ctx.stroke();
    }
    ctx.textAlign = "left";
    ctx.fillStyle = "#858b86";
    ctx.font = `${narrow ? 9 : 10}px system-ui, sans-serif`;
    const footer = score.tempoScale < 0.999
      ? `孔位決定音高 · 打孔時間決定節奏 · 時間縮為 ${Math.round(score.tempoScale * 100)}%`
      : "孔位決定音高 · 打孔時間決定節奏";
    ctx.fillText(footer, padding, h - 15, w - padding * 2);
    if (!score.notes.length) {
      ctx.fillStyle = "rgba(255,255,255,.93)";
      ctx.fillRect(left, (top + bottom) / 2 - 22, right - left, 44);
      ctx.fillStyle = "#6a746d";
      ctx.textAlign = "center";
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText("打下第一個孔，留下你的第一個音符", (left + right) / 2, (top + bottom) / 2 + 4, right - left - 12);
    }
    return { width: w, height: h, pixelRatio: ratio };
  }

  function makeBus(context, output) {
    const bus = context.createGain();
    bus.gain.value = 0.8;
    // Gentle compression makes dense chords safe without changing note timing.
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.18;
    bus.connect(compressor);
    compressor.connect(output);
    return { bus, compressor };
  }

  function synthesize(context, output, note, when, voiceGain) {
    const nodes = [];
    // Fixed sine partials, quick strike and long decay: no sample downloads.
    const partials = [[1, 1, 1.7], [2, 0.22, 0.65], [2.756, 0.065, 0.24], [4, 0.035, 0.16]];
    partials.forEach(([ratio, level, decay]) => {
      if (note.frequency * ratio >= context.sampleRate * 0.45) return;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(note.frequency * ratio, when);
      const amplitude = voiceGain * level;
      envelope.gain.setValueAtTime(0, when);
      envelope.gain.linearRampToValueAtTime(amplitude, when + 0.006);
      envelope.gain.exponentialRampToValueAtTime(Math.max(0.00002, amplitude * 0.035), when + Math.min(decay, note.duration - 0.1));
      envelope.gain.exponentialRampToValueAtTime(0.00001, when + note.duration - 0.025);
      envelope.gain.linearRampToValueAtTime(0, when + note.duration);
      oscillator.connect(envelope);
      envelope.connect(output);
      oscillator.start(when);
      oscillator.stop(when + note.duration + 0.01);
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
      nodes.push(oscillator);
    });
    return nodes;
  }

  class Player {
    constructor({ context, output, onTick, onEnded } = {}) {
      this.context = context || null;
      this.output = output || null;
      this.onTick = onTick || (() => {});
      this.onEnded = onEnded || (() => {});
      this._nodes = [];
      this._graph = null;
      this._frame = null;
      this._playing = false;
      this._token = 0;
      this._onVisibility = () => {
        if (document.visibilityState === "visible" && this._playing) this._tick(this._token);
      };
      document.addEventListener("visibilitychange", this._onVisibility);
    }

    get playing() { return this._playing; }

    async play(score) {
      this.stop();
      const token = this._token;
      if (!score || !score.notes.length) return false;
      if (!this.context || this.context.state === "closed") {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) throw new Error("此瀏覽器不支援聲音試聽，請使用較新的瀏覽器。");
        this.context = new Context();
        this.output = null;
      }
      if (this.context.state === "suspended") await this.context.resume();
      if (token !== this._token) return false;
      if (this.context.state !== "running") throw new Error("請再按一次播放，啟用聲音。");
      this._graph = makeBus(this.context, this.output || this.context.destination);
      this._score = score;
      this._start = this.context.currentTime + 0.04;
      this._nodes = score.notes.flatMap((note) => synthesize(this.context, this._graph.bus, note, this._start + note.time, score.voiceGain));
      this._playing = true;
      this._tick(token);
      return true;
    }

    _tick(token) {
      if (this._frame !== null) cancelAnimationFrame(this._frame);
      if (!this._playing || token !== this._token) return;
      const elapsed = Math.max(0, this.context.currentTime - this._start);
      this.onTick(Math.min(elapsed, this._score.duration), this._score);
      if (elapsed >= this._score.duration) {
        this.stop();
        this.onEnded();
        return;
      }
      this._frame = requestAnimationFrame(() => this._tick(token));
    }

    stop() {
      this._token += 1;
      this._playing = false;
      if (this._frame !== null) cancelAnimationFrame(this._frame);
      this._frame = null;
      this._nodes.forEach((node) => { try { node.stop(); } catch (_) { /* already ended */ } });
      this._nodes = [];
      if (this._graph) {
        this._graph.bus.disconnect();
        this._graph.compressor.disconnect();
        this._graph = null;
      }
    }

    destroy() {
      this.stop();
      document.removeEventListener("visibilitychange", this._onVisibility);
    }
  }

  async function wav(score) {
    if (!score || !score.notes.length) throw new Error("請先打孔，再生成聲音檔案。");
    const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineContext) throw new Error("此瀏覽器不支援聲音下載，仍可在線試聽。");
    const sampleRate = 44100;
    const context = new OfflineContext(1, Math.ceil((score.duration + 0.05) * sampleRate), sampleRate);
    const graph = makeBus(context, context.destination);
    score.notes.forEach((note) => synthesize(context, graph.bus, note, note.time, score.voiceGain));
    const rendered = await context.startRendering();
    const samples = rendered.getChannelData(0);
    const bytes = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(bytes);
    const writeText = (offset, value) => {
      for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
    };
    writeText(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    writeText(8, "WAVE");
    writeText(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeText(36, "data");
    view.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i += 1) {
      const sample = clamp(samples[i], -1, 1);
      view.setInt16(44 + i * 2, Math.round(sample < 0 ? sample * 32768 : sample * 32767), true);
    }
    return new Blob([bytes], { type: "audio/wav" });
  }

  window.CityMusicRoll = Object.freeze({ build, draw, Player, wav });
})();
