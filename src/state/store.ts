"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type Tone } from "@/data/content";
import { content } from "@/state/content";
import { audio } from "@/audio/engine";
import { voice } from "@/audio/voice";

export interface Toast {
  id: number;
  kicker: string;
  msg: string;
}

interface GameState {
  // journey phases
  phase: "cover" | "map";
  coverOpened: boolean;
  coverGone: boolean;
  ready: boolean; // hero texture loaded
  morphStart: number; // performance.now() when the map rose into 3D

  // panels & UI
  region: string | null;
  regionIsNew: boolean;
  questOpen: boolean;
  contactOpen: boolean;
  ravenFlying: boolean;
  toasts: Toast[];
  overview: boolean;

  // progression — xp is intentionally NOT stored: it is derived from these
  // via xpEarned() so admin changes to xp_rules rescale every save consistently
  visited: Record<string, boolean>;
  pages: Record<number, boolean>;
  beacons: Record<number, boolean>;

  // settings
  tone: Tone;
  cursor: string;
  muted: boolean;
  quality: "high" | "low";
  mount: "dragon" | "eagle";

  // live weather (for HUD caption)
  weatherZone: string;
  caption: string;

  // movie-style subtitle while a voice line plays
  voiceCaption: string | null;

  // map-view hover tooltip (place under the cursor)
  mapHover: { title: string; text: string } | null;

  // actions
  setReady: () => void;
  openCover: () => void;
  beginJourney: () => void;
  openRegion: (id: string) => void;
  closePanel: () => void;
  toggleQuest: () => void;
  setContact: (open: boolean) => void;
  sendRaven: () => void;
  toast: (kicker: string, msg: string) => void;
  toggleTone: () => void;
  setCursor: (id: string) => void;
  toggleMute: () => void;
  toggleQuality: () => void;
  toggleOverview: () => void;
  setMount: (m: "dragon" | "eagle") => void;
  setWeatherZone: (zone: string) => void;
  setMapHover: (h: { title: string; text: string } | null) => void;
  collectPage: (id: number) => void;
  lightBeacon: (id: number) => void;
  escape: () => void;
  resetJourney: () => void;
}

let toastSeq = 0;

export const useGame = create<GameState>()(
  persist(
    (set, get) => ({
      phase: "cover",
      coverOpened: false,
      coverGone: false,
      ready: false,
      morphStart: 0,

      region: null,
      regionIsNew: false,
      questOpen: false,
      contactOpen: false,
      ravenFlying: false,
      toasts: [],
      overview: false,

      visited: {},
      pages: {},
      beacons: {},

      tone: "common",
      cursor: "ring",
      muted: false,
      quality: "high",
      mount: "dragon",

      weatherZone: "clear",
      caption: "",
      voiceCaption: null,
      mapHover: null,

      setReady: () => set({ ready: true }),

      openCover: () => {
        if (get().coverOpened) return;
        audio.ensure(get().muted);
        audio.sfx("open");
        set({ coverOpened: true });
      },

      beginJourney: () => {
        audio.ensure(get().muted);
        audio.sfx("chime");
        set({ phase: "map", morphStart: performance.now() });
        setTimeout(() => set({ coverGone: true }), 900);
        setTimeout(() => voice.playEvent("intro"), 3600);
      },

      openRegion: (id) => {
        const c = content();
        const r = c.regions.find((x) => x.id === id);
        if (!r) return;
        const s = get();
        const isNew = !s.visited[id];
        audio.sfx("open");
        set({
          region: id,
          regionIsNew: isNew,
          visited: { ...s.visited, [id]: true },
          questOpen: false,
        });
        if (isNew) {
          setTimeout(() => {
            get().toast("ARTIFACT CLAIMED", r.artifact.name);
            const { regions, titles } = content();
            const count = Object.keys(get().visited).length;
            if (count === regions.length) {
              const finalTitle = titles[titles.length - 1];
              setTimeout(
                () =>
                  get().toast(
                    "JOURNEY COMPLETE",
                    "All lands charted" + (finalTitle ? " — title earned: " + finalTitle : ""),
                  ),
                2400,
              );
              setTimeout(() => voice.playEvent("complete"), 3400);
            }
          }, 600);
        }
      },

      closePanel: () => set({ region: null }),
      toggleQuest: () => set((s) => ({ questOpen: !s.questOpen })),
      setContact: (open) => {
        if (open) audio.sfx("open");
        set({ contactOpen: open });
      },

      sendRaven: () => {
        set({ contactOpen: false, ravenFlying: true });
        audio.sfx("chime");
        setTimeout(() => {
          set({ ravenFlying: false });
          get().toast("THE RAVEN FLIES", "Your message departs for Sherman Oaks");
        }, 2200);
      },

      toast: (kicker, msg) => {
        const id = ++toastSeq;
        audio.sfx("chime");
        set((s) => ({ toasts: [...s.toasts, { id, kicker, msg }] }));
        setTimeout(
          () => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
          4200,
        );
      },

      toggleTone: () =>
        set((s) => ({ tone: s.tone === "common" ? "elvish" : "common" })),

      setCursor: (id) => {
        audio.sfx("tick");
        set({ cursor: id });
      },

      toggleMute: () => {
        const muted = !get().muted;
        set({ muted });
        audio.setMuted(muted);
        if (muted) voice.stop();
      },

      toggleQuality: () =>
        set((s) => ({ quality: s.quality === "high" ? "low" : "high" })),

      toggleOverview: () => {
        audio.sfx("tick");
        set((s) => ({ overview: !s.overview, mapHover: null }));
      },

      setMapHover: (h) => set({ mapHover: h }),

      setMount: (m) => {
        if (m === get().mount) return;
        audio.sfx("tick");
        set({ mount: m });
        if (get().phase === "map") {
          get().toast(
            "A NEW STEED ANSWERS",
            m === "eagle" ? "The Windlord bears you now — cry with F" : "The dragon bears you now — breathe fire with F",
          );
        }
      },

      setWeatherZone: (zone) => {
        const s = get();
        if (zone === s.weatherZone) return;
        audio.setZone(zone);
        // '' counts as missing too — keep showing the previous caption
        const caption = content().regions.find((r) => r.id === zone)?.caption;
        set({
          weatherZone: zone,
          caption: zone !== "clear" ? (caption || s.caption) : s.caption,
        });
      },

      collectPage: (id) => {
        const s = get();
        if (s.pages[id]) return;
        const { lostPages } = content();
        const pages = { ...s.pages, [id]: true };
        const n = Object.keys(pages).length;
        const done = n === lostPages.length;
        audio.sfx("collect");
        set({ pages });
        get().toast(
          "LOST PAGE RECOVERED",
          `A page of the Red Book — ${n} of ${lostPages.length} found`,
        );
        if (done)
          setTimeout(
            () => get().toast("THE RED BOOK IS WHOLE", "Every lost page recovered — the tale is complete"),
            2000,
          );
      },

      lightBeacon: (id) => {
        const s = get();
        if (s.beacons[id]) return;
        const c = content();
        const b = c.beacons.find((x) => x.id === id);
        const beacons = { ...s.beacons, [id]: true };
        const n = Object.keys(beacons).length;
        const done = n === c.beacons.length;
        audio.sfx("chime");
        set({ beacons });
        get().toast("THE BEACON IS LIT", `${b?.name ?? "A beacon"} answers with fire`);
        if (done) {
          setTimeout(
            () => get().toast("GONDOR CALLS FOR AID", "All three beacons blaze — and Rohan will answer"),
            2000,
          );
          setTimeout(() => voice.playEvent("beacons"), 1100);
        }
      },

      escape: () =>
        set({ region: null, contactOpen: false, questOpen: false }),

      resetJourney: () => {
        set({
          visited: {},
          pages: {},
          beacons: {},
          region: null,
          questOpen: false,
          phase: "cover",
          coverOpened: false,
          coverGone: false,
          morphStart: 0,
          weatherZone: "clear",
          caption: "",
          overview: false,
        });
      },
    }),
    {
      name: "there-and-back-again-v1",
      partialize: (s) => ({
        visited: s.visited,
        pages: s.pages,
        beacons: s.beacons,
        tone: s.tone,
        cursor: s.cursor,
        muted: s.muted,
        quality: s.quality,
        mount: s.mount,
      }),
    },
  ),
);

/** Read state outside React (three.js loops). */
export const game = useGame.getState;
