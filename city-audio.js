(function attachCitySoundPlayer(global) {
  "use strict";

  const MAX_OVERLAP_SECONDS = 1;
  const MAX_OVERLAP_RATIO = 0.25;
  const SCHEDULE_LEAD_SECONDS = 0.035;
  const TIMER_INTERVAL_MS = 80;
  const END_EPSILON_SECONDS = 0.012;

  class CitySoundPlayer {
    constructor({ context, output, playlists, onChange, onComplete }) {
      if (!context || typeof context.createBufferSource !== "function") {
        throw new TypeError("CitySoundPlayer requires a Web Audio AudioContext.");
      }
      if (!output || typeof output.connect !== "function") {
        throw new TypeError("CitySoundPlayer requires an AudioNode output.");
      }
      if (!playlists || typeof playlists !== "object") {
        throw new TypeError("CitySoundPlayer requires a playlists object.");
      }

      this.context = context;
      this.output = output;
      this.onChange = typeof onChange === "function" ? onChange : function noop() {};
      this.onComplete = typeof onComplete === "function" ? onComplete : function noop() {};
      this.playlists = {};
      this.states = {};
      this.assetPromises = new Map();
      this.activeCity = null;
      this.sessionToken = 0;
      this.timer = 0;
      this.destroyed = false;

      Object.keys(playlists).forEach((city) => {
        const entries = playlists[city];
        if (!Array.isArray(entries) || entries.length === 0) {
          throw new TypeError(`Playlist "${city}" must contain at least one track.`);
        }

        this.playlists[city] = entries.map((track, index) => {
          if (!track || typeof track.src !== "string" || !track.src) {
            throw new TypeError(`Playlist "${city}" track ${index} requires a src.`);
          }
          return {
            src: track.src,
            label: typeof track.label === "string" ? track.label : `Track ${index + 1}`,
          };
        });

        this.states[city] = {
          buffers: null,
          timeline: null,
          totalDuration: 0,
          preloadPromise: null,
          loading: false,
          playing: false,
          complete: false,
          completionNotified: false,
          elapsed: 0,
          startedAt: 0,
          sources: [],
          lastReportedIndex: null,
          lastReportedPreviousIndex: null,
          lastReportedActiveKey: "",
        };
      });
    }

    async preload(city) {
      this._assertUsable();
      this._assertCity(city);
      await this._ensureLoaded(city);
      return this.getSnapshot(city);
    }

    async play(city) {
      this._assertUsable();
      this._assertCity(city);
      const state = this.states[city];

      if (state.playing && this.activeCity === city) return this.getSnapshot(city);

      const requestToken = ++this.sessionToken;
      if (this.activeCity && this.activeCity !== city) {
        this._pauseCity(this.activeCity, "switch");
      }
      this.activeCity = city;

      if (state.complete) this._resetState(city, false);

      try {
        await this._ensureLoaded(city);
        if (!this._requestIsCurrent(requestToken, city)) return this.getSnapshot(city);

        if (this.context.state !== "running" && typeof this.context.resume === "function") {
          await this.context.resume();
        }
        if (!this._requestIsCurrent(requestToken, city)) return this.getSnapshot(city);

        const startsAt = this._schedule(city, state.elapsed, requestToken);
        state.playing = true;
        state.complete = false;
        state.startedAt = startsAt;
        this._ensureTimer();
        this._emit(city, "play");
        return this.getSnapshot(city);
      } catch (error) {
        if (this._requestIsCurrent(requestToken, city)) {
          state.playing = false;
          this._stopSources(state);
          this._emit(city, "error", error);
        }
        throw error;
      }
    }

    pause() {
      if (this.destroyed) return null;
      ++this.sessionToken;
      const city = this.activeCity;
      if (!city) return null;
      this._pauseCity(city, "pause");
      this.activeCity = null;
      this._stopTimerIfIdle();
      return this.getSnapshot(city);
    }

    reset(city) {
      this._assertUsable();
      this._assertCity(city);
      ++this.sessionToken;
      this._resetState(city, true);
      if (this.activeCity === city) this.activeCity = null;
      this._stopTimerIfIdle();
      return this.getSnapshot(city);
    }

    getSnapshot(city) {
      this._assertCity(city);
      const state = this.states[city];
      const elapsed = this._liveElapsed(state);
      const position = this._positionAt(state, elapsed);
      const totalDuration = state.totalDuration || 0;

      return {
        city,
        index: position.index,
        previousIndex: position.previousIndex,
        activeIndices: position.activeIndices,
        currentTime: position.currentTime,
        elapsed,
        duration: position.duration,
        totalDuration,
        progress: totalDuration > 0 ? Math.min(1, elapsed / totalDuration) : 0,
        playing: state.playing,
        loading: state.loading,
        complete: state.complete,
      };
    }

    shutdown() {
      if (this.destroyed) return;
      ++this.sessionToken;
      this.destroyed = true;
      this.activeCity = null;
      if (this.timer) global.clearInterval(this.timer);
      this.timer = 0;
      Object.values(this.states).forEach((state) => {
        state.playing = false;
        this._stopSources(state);
      });
      this.assetPromises.clear();
      this.onChange = function noop() {};
      this.onComplete = function noop() {};
    }

    _assertUsable() {
      if (this.destroyed) throw new Error("CitySoundPlayer has been shut down.");
    }

    _assertCity(city) {
      if (!Object.prototype.hasOwnProperty.call(this.states, city)) {
        throw new RangeError(`Unknown city playlist: ${city}`);
      }
    }

    _requestIsCurrent(token, city) {
      return !this.destroyed && token === this.sessionToken && this.activeCity === city;
    }

    async _ensureLoaded(city) {
      const state = this.states[city];
      if (state.buffers && state.timeline) return state.buffers;
      if (state.preloadPromise) return state.preloadPromise;

      state.loading = true;
      this._emit(city, "loading");

      const request = Promise.all(
        this.playlists[city].map((track) => this._fetchAndDecode(track.src))
      ).then((buffers) => {
        if (this.destroyed) return buffers;
        state.buffers = buffers;
        state.timeline = this._buildTimeline(buffers);
        state.totalDuration = state.timeline.length
          ? state.timeline[state.timeline.length - 1].end
          : 0;
        state.loading = false;
        state.preloadPromise = null;
        this._emit(city, "loaded");
        return buffers;
      }).catch((error) => {
        state.loading = false;
        state.preloadPromise = null;
        state.buffers = null;
        state.timeline = null;
        state.totalDuration = 0;
        this._emit(city, "error", error);
        throw error;
      });

      state.preloadPromise = request;
      return request;
    }

    _fetchAndDecode(src) {
      if (this.assetPromises.has(src)) return this.assetPromises.get(src);

      const request = fetch(src, { cache: "force-cache" })
        .then((response) => {
          if (!response.ok) throw new Error(`Audio request failed (${response.status}): ${src}`);
          return response.arrayBuffer();
        })
        .then((bytes) => this._decodeAudioData(bytes))
        .catch((error) => {
          this.assetPromises.delete(src);
          throw error;
        });

      this.assetPromises.set(src, request);
      return request;
    }

    _decodeAudioData(bytes) {
      return new Promise((resolve, reject) => {
        let settled = false;
        const succeed = (buffer) => {
          if (settled) return;
          settled = true;
          if (!buffer || !Number.isFinite(buffer.duration) || buffer.duration <= 0) {
            reject(new Error("Decoded audio has no playable duration."));
            return;
          }
          resolve(buffer);
        };
        const fail = (error) => {
          if (settled) return;
          settled = true;
          reject(error instanceof Error ? error : new Error("Audio decode failed."));
        };

        try {
          const result = this.context.decodeAudioData(bytes, succeed, fail);
          if (result && typeof result.then === "function") result.then(succeed, fail);
        } catch (error) {
          fail(error);
        }
      });
    }

    _buildTimeline(buffers) {
      const groups = [];
      for (let index = 0; index < buffers.length; index += 2) {
        const indices = [index];
        if (index + 1 < buffers.length) indices.push(index + 1);
        const duration = Math.max(...indices.map((trackIndex) => buffers[trackIndex].duration));
        groups.push({
          groupIndex: groups.length,
          index,
          indices,
          duration,
          start: 0,
          end: 0,
          fadeIn: 0,
          fadeOut: 0,
          level: indices.length > 1 ? Math.SQRT1_2 : 1,
        });
      }

      const overlaps = groups.slice(0, -1).map((group, index) => {
        const shortest = Math.min(group.duration, groups[index + 1].duration);
        return Math.max(0, Math.min(MAX_OVERLAP_SECONDS, shortest * MAX_OVERLAP_RATIO));
      });

      let start = 0;
      groups.forEach((group, index) => {
        if (index > 0) start -= overlaps[index - 1];
        group.start = start;
        group.end = start + group.duration;
        group.fadeIn = index > 0 ? overlaps[index - 1] : 0;
        group.fadeOut = index < overlaps.length ? overlaps[index] : 0;
        group.tracks = group.indices.map((trackIndex) => ({
          index: trackIndex,
          start: group.start,
          end: group.start + buffers[trackIndex].duration,
          duration: buffers[trackIndex].duration,
        }));
        start = group.end;
      });
      return groups;
    }

    _schedule(city, elapsed, requestToken) {
      const state = this.states[city];
      this._stopSources(state);
      const anchorTime = this.context.currentTime + SCHEDULE_LEAD_SECONDS;

      state.timeline.forEach((group) => {
        group.tracks.forEach((track) => {
          if (track.end - elapsed <= END_EPSILON_SECONDS) return;

          const buffer = state.buffers[track.index];
          const timelineDelay = Math.max(0, track.start - elapsed);
          const offset = Math.max(0, elapsed - track.start);
          const remaining = buffer.duration - offset;
          if (remaining <= END_EPSILON_SECONDS) return;

          const startsAt = anchorTime + timelineDelay;
          const source = this.context.createBufferSource();
          const gain = this.context.createGain();
          source.buffer = buffer;
          source.connect(gain);
          gain.connect(this.output);

          const curve = this._gainCurve(group, offset, remaining);
          gain.gain.cancelScheduledValues(startsAt);
          gain.gain.setValueAtTime(curve[0], startsAt);
          if (remaining > END_EPSILON_SECONDS && typeof gain.gain.setValueCurveAtTime === "function") {
            gain.gain.setValueCurveAtTime(curve, startsAt, remaining);
          }

          source.start(startsAt, offset);
          const entry = { source, gain, token: requestToken, trackIndex: track.index };
          state.sources.push(entry);
          source.onended = () => {
            const index = state.sources.indexOf(entry);
            if (index >= 0) state.sources.splice(index, 1);
            try { source.disconnect(); } catch (_) {}
            try { gain.disconnect(); } catch (_) {}
            if (state.playing
              && this.activeCity === city
              && requestToken === this.sessionToken
              && state.sources.length === 0) this._complete(city);
          };
        });
      });
      return anchorTime;
    }

    _gainCurve(group, offset, remaining) {
      const sampleCount = Math.max(32, Math.min(768, Math.ceil(remaining * 90)));
      const curve = new Float32Array(sampleCount);
      for (let index = 0; index < sampleCount; index += 1) {
        const ratio = sampleCount === 1 ? 0 : index / (sampleCount - 1);
        curve[index] = this._gainAt(group, offset + remaining * ratio);
      }
      return curve;
    }

    _gainAt(group, localTime) {
      const time = Math.max(0, Math.min(group.duration, localTime));
      if (group.fadeIn > 0 && time < group.fadeIn) {
        return group.level * Math.sin((time / group.fadeIn) * Math.PI * 0.5);
      }
      const fadeOutStart = group.duration - group.fadeOut;
      if (group.fadeOut > 0 && time > fadeOutStart) {
        return group.level * Math.cos(((time - fadeOutStart) / group.fadeOut) * Math.PI * 0.5);
      }
      return group.level;
    }

    _pauseCity(city, reason) {
      const state = this.states[city];
      if (state.playing) state.elapsed = this._liveElapsed(state);
      if (state.playing
        && state.totalDuration > 0
        && state.elapsed >= state.totalDuration - END_EPSILON_SECONDS) {
        this._complete(city);
        return;
      }
      state.playing = false;
      state.startedAt = 0;
      this._stopSources(state);
      this._emit(city, reason);
    }

    _resetState(city, emit) {
      const state = this.states[city];
      this._stopSources(state);
      state.playing = false;
      state.complete = false;
      state.completionNotified = false;
      state.elapsed = 0;
      state.startedAt = 0;
      state.lastReportedIndex = null;
      state.lastReportedPreviousIndex = null;
      state.lastReportedActiveKey = "";
      if (emit) this._emit(city, "reset");
    }

    _stopSources(state) {
      const entries = state.sources.splice(0);
      entries.forEach(({ source, gain }) => {
        source.onended = null;
        try { source.stop(); } catch (_) {}
        try { source.disconnect(); } catch (_) {}
        try { gain.disconnect(); } catch (_) {}
      });
    }

    _liveElapsed(state) {
      if (!state.playing) return Math.max(0, Math.min(state.totalDuration || Infinity, state.elapsed));
      const advanced = Math.max(0, this.context.currentTime - state.startedAt);
      return Math.max(0, Math.min(state.totalDuration, state.elapsed + advanced));
    }

    _positionAt(state, elapsed) {
      if (!state.timeline || state.timeline.length === 0) {
        return { index: 0, previousIndex: null, activeIndices: [], currentTime: 0, duration: 0 };
      }

      let groupIndex = 0;
      for (let cursor = 1; cursor < state.timeline.length; cursor += 1) {
        if (elapsed + END_EPSILON_SECONDS < state.timeline[cursor].start) break;
        groupIndex = cursor;
      }

      const group = state.timeline[groupIndex];
      const currentTime = Math.max(0, Math.min(group.duration, elapsed - group.start));
      const previousIndex = groupIndex > 0 && currentTime < group.fadeIn
        ? state.timeline[groupIndex - 1].index
        : null;
      const activeIndices = [];
      state.timeline.forEach((candidate) => {
        candidate.tracks.forEach((track) => {
          if (elapsed + END_EPSILON_SECONDS >= track.start
            && elapsed < track.end - END_EPSILON_SECONDS) activeIndices.push(track.index);
        });
      });
      return {
        index: group.index,
        previousIndex,
        activeIndices,
        currentTime,
        duration: group.duration,
      };
    }

    _ensureTimer() {
      if (this.timer || this.destroyed) return;
      this.timer = global.setInterval(() => this._tick(), TIMER_INTERVAL_MS);
    }

    _stopTimerIfIdle() {
      if (!this.timer) return;
      const hasPlayback = Object.values(this.states).some((state) => state.playing);
      if (hasPlayback) return;
      global.clearInterval(this.timer);
      this.timer = 0;
    }

    _tick() {
      if (this.destroyed) return;
      const city = this.activeCity;
      if (!city) {
        this._stopTimerIfIdle();
        return;
      }

      const state = this.states[city];
      if (!state.playing) {
        this._stopTimerIfIdle();
        return;
      }

      const snapshot = this.getSnapshot(city);
      if (snapshot.elapsed >= snapshot.totalDuration - END_EPSILON_SECONDS) {
        this._complete(city);
        return;
      }

      const trackChanged = snapshot.index !== state.lastReportedIndex
        || snapshot.previousIndex !== state.lastReportedPreviousIndex
        || snapshot.activeIndices.join(",") !== state.lastReportedActiveKey;
      state.lastReportedIndex = snapshot.index;
      state.lastReportedPreviousIndex = snapshot.previousIndex;
      state.lastReportedActiveKey = snapshot.activeIndices.join(",");
      this._emit(city, trackChanged ? "track" : "time", null, snapshot);
    }

    _complete(city) {
      const state = this.states[city];
      if (state.complete) return;
      state.elapsed = state.totalDuration;
      state.startedAt = 0;
      state.playing = false;
      state.complete = true;
      this._stopSources(state);
      if (this.activeCity === city) this.activeCity = null;
      const snapshot = this.getSnapshot(city);
      this._emit(city, "complete", null, snapshot);
      if (!state.completionNotified) {
        state.completionNotified = true;
        try { this.onComplete(city, snapshot); } catch (error) { global.setTimeout(() => { throw error; }); }
      }
      this._stopTimerIfIdle();
    }

    _emit(city, reason, detail, providedSnapshot) {
      if (this.destroyed) return;
      const snapshot = providedSnapshot || this.getSnapshot(city);
      try {
        this.onChange(snapshot, reason, detail || null);
      } catch (error) {
        global.setTimeout(() => { throw error; });
      }
    }
  }

  global.CitySoundPlayer = CitySoundPlayer;
})(window);
