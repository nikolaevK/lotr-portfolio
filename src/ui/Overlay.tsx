"use client";

import { BookCover } from "@/ui/BookCover";
import { Hud } from "@/ui/Hud";
import { ScrollPanel } from "@/ui/ScrollPanel";
import { QuestLog } from "@/ui/QuestLog";
import { ContactModal } from "@/ui/ContactModal";
import { Toasts } from "@/ui/Toasts";
import { Raven } from "@/ui/Raven";
import { Minimap } from "@/ui/Minimap";
import { TouchControls } from "@/ui/TouchControls";
import { MapTooltip } from "@/ui/MapTooltip";

export function Overlay() {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {/* children that need clicks re-enable pointer events themselves */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <svg width="0" height="0" style={{ position: "absolute" }}>
          <filter id="roughPaper" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="2" seed="7" result="t" />
            <feDisplacementMap in="SourceGraphic" in2="t" scale="6" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
        <WithPointer>
          <Hud />
          <Minimap />
          <TouchControls />
          <QuestLog />
          <ScrollPanel />
          <ContactModal />
          <BookCover />
        </WithPointer>
        <Raven />
        <Toasts />
        <MapTooltip />
      </div>
    </div>
  );
}

function WithPointer({ children }: { children: React.ReactNode }) {
  return <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>{children}</div>;
}
