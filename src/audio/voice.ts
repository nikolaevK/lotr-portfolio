"use client";

/**
 * Location-triggered voice lines / movie-moment clips.
 *
 * The app ships with NO audio files — drop your own legally sourced MP3s into
 * `public/audio/` using the filenames below and they play automatically when
 * the dragon reaches the place (or the moment happens). Missing files are
 * detected once and silently skipped forever after.
 */

export interface VoiceLine {
  id: string;
  file: string; // under /audio/
  caption: string; // shown as a movie-style subtitle while playing
  u: number;
  v: number;
  radius: number; // world units
  cooldown?: number; // seconds before it may replay (default 120)
  once?: boolean; // only once per session
}

export const VOICE_LINES: VoiceLine[] = [
  { id: "mordor", file: "mordor.mp3", caption: "The Black Speech of Mordor rolls from Barad-dûr…", u: 0.727, v: 0.583, radius: 320 },
  { id: "moria", file: "moria.mp3", caption: "Gandalf's voice thunders from the deeps of Moria…", u: 0.507, v: 0.352, radius: 130 },
  { id: "shire", file: "shire.mp3", caption: "A song of the Shire drifts up from Hobbiton…", u: 0.352, v: 0.262, radius: 210 },
  { id: "rivendell", file: "rivendell.mp3", caption: "Elven voices echo through the Hidden Valley…", u: 0.502, v: 0.252, radius: 150 },
  { id: "lorien", file: "lorien.mp3", caption: "The Lady of the Wood whispers on the golden air…", u: 0.548, v: 0.372, radius: 150 },
  { id: "erebor", file: "erebor.mp3", caption: "Dwarven horns sound from the halls of Erebor…", u: 0.664, v: 0.238, radius: 240 },
  { id: "gondor", file: "gondor.mp3", caption: "Horns of the White City ring over the Pelennor…", u: 0.607, v: 0.607, radius: 210 },
  { id: "rohan", file: "rohan.mp3", caption: "A rider's cry carries across the plains of Rohan…", u: 0.512, v: 0.542, radius: 170 },
  { id: "weathertop", file: "weathertop.mp3", caption: "A cold cry rides the wind around Amon Sûl…", u: 0.452, v: 0.261, radius: 120 },
  { id: "isengard", file: "isengard.mp3", caption: "A voice of iron issues from Orthanc…", u: 0.489, v: 0.489, radius: 140 },
  { id: "havens", file: "havens.mp3", caption: "Gulls and farewells at the Grey Havens…", u: 0.285, v: 0.272, radius: 150 },
];

export type VoiceEvent = "intro" | "beacons" | "complete";

const EVENT_FILES: Record<VoiceEvent, { file: string; caption: string }> = {
  intro: { file: "intro.mp3", caption: "The journey begins…" },
  beacons: { file: "beacons.mp3", caption: "The beacons are lit!" },
  complete: { file: "complete.mp3", caption: "All five lands are charted." },
};

interface Hooks {
  isMuted: () => boolean;
  onCaption: (caption: string | null) => void;
  onDuck: (ducked: boolean) => void;
}

class VoicePlayer {
  private els = new Map<string, HTMLAudioElement | "missing">();
  private manifestLoaded = false;
  private lastPlayed = new Map<string, number>();
  private playingId: string | null = null;
  private playingEl: HTMLAudioElement | null = null;
  private hooks: Hooks = { isMuted: () => true, onCaption: () => {}, onDuck: () => {} };

  bind(hooks: Hooks) {
    this.hooks = hooks;
    // Learn which files actually exist so missing ones never hit the network
    // (the repo ships silent — most players have only a few of the MP3s).
    if (!this.manifestLoaded) {
      this.manifestLoaded = true;
      fetch("/api/audio-manifest")
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { files?: string[] } | null) => {
          if (!data?.files) return; // manifest unavailable — keep per-file detection
          const have = new Set(data.files);
          for (const line of VOICE_LINES) {
            if (!have.has(line.file)) this.els.set(line.file, "missing");
          }
          for (const ev of Object.values(EVENT_FILES)) {
            if (!have.has(ev.file)) this.els.set(ev.file, "missing");
          }
        })
        .catch(() => {});
    }
  }

  get busy() {
    return this.playingId !== null;
  }

  /** Attempt playback; resolves silently for missing files / cooldowns / mute. */
  play(id: string, file: string, caption: string, cooldown = 120, once = false) {
    if (this.hooks.isMuted()) return;
    if (this.playingId) return;
    const now = performance.now() / 1000;
    const last = this.lastPlayed.get(id);
    if (last !== undefined && (once || now - last < cooldown)) return;

    let el = this.els.get(file);
    if (el === "missing") return;
    if (!el) {
      el = new Audio("/audio/" + file);
      el.preload = "auto";
      el.addEventListener("error", () => this.els.set(file, "missing"), { once: true });
      this.els.set(file, el);
    }
    const audioEl = el;
    audioEl.volume = 0.92;
    try {
      audioEl.currentTime = 0;
    } catch {
      /* not yet loaded — fine */
    }
    this.playingId = id; // reserve immediately so triggers don't double-fire
    const finish = () => {
      if (this.playingId !== id) return;
      this.playingId = null;
      this.playingEl = null;
      this.hooks.onCaption(null);
      this.hooks.onDuck(false);
    };
    audioEl
      .play()
      .then(() => {
        this.playingEl = audioEl;
        this.lastPlayed.set(id, now);
        this.hooks.onCaption(caption);
        this.hooks.onDuck(true);
        audioEl.onended = finish;
        // hard stop safeguard for very long files
        window.setTimeout(() => {
          if (this.playingId === id && this.playingEl === audioEl) {
            audioEl.pause();
            finish();
          }
        }, 45000);
      })
      .catch(() => {
        // 404 / unsupported / autoplay refusal — mark missing so we never retry
        this.els.set(file, "missing");
        finish();
      });
  }

  playZone(line: VoiceLine) {
    this.play(line.id, line.file, line.caption, line.cooldown ?? 120, line.once ?? false);
  }

  playEvent(ev: VoiceEvent) {
    const def = EVENT_FILES[ev];
    this.play("event:" + ev, def.file, def.caption, 999999, true);
  }

  stop() {
    if (this.playingEl) {
      this.playingEl.pause();
      this.playingEl.onended = null;
    }
    this.playingId = null;
    this.playingEl = null;
    this.hooks.onCaption(null);
    this.hooks.onDuck(false);
  }
}

export const voice = new VoicePlayer();
