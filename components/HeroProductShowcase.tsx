"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { HERO_FADE_S, HERO_HOLD_MS, heroShowcase } from "@/data/heroShowcase";

const EASE = [0.22, 0.61, 0.36, 1] as const;
const SHOWCASE_LABEL =
  "Halima Trading appliance showcase: televisions, air conditioning, refrigeration, laundry and kitchen appliances.";
const LONGEST_LABEL = heroShowcase.reduce(
  (longest, item) => (item.cardLabel.length > longest.length ? item.cardLabel : longest),
  ""
);

export default function HeroProductShowcase() {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const stageRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  // The four trailing products stay out of the document until the browser is idle,
  // so the first paint only ever pays for the leading product.
  const [mountRest, setMountRest] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(() => setMountRest(true), { timeout: 2000 })
      : window.setTimeout(() => setMountRest(true), 600);
    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle as number);
      else window.clearTimeout(idle as number);
    };
  }, [prefersReducedMotion]);

  // Only spend frames while the hero is both on screen and in a foreground tab.
  useEffect(() => {
    if (prefersReducedMotion || !mountRest) return;
    const stage = stageRef.current;
    if (!stage) return;

    let onScreen = true;
    const sync = () => setRunning(onScreen && document.visibilityState === "visible");

    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        sync();
      },
      { threshold: 0.12 }
    );
    observer.observe(stage);
    document.addEventListener("visibilitychange", sync);
    sync();

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [prefersReducedMotion, mountRest]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % heroShowcase.length),
      HERO_HOLD_MS
    );
    return () => window.clearInterval(timer);
  }, [running]);

  const visible = mountRest && !prefersReducedMotion ? heroShowcase : heroShowcase.slice(0, 1);

  return (
    <div className="hero-visual">
      <div className={`hero-stage${running ? "" : " is-paused"}`} ref={stageRef} role="img" aria-label={SHOWCASE_LABEL}>
        <span className="hero-stage-glow" aria-hidden="true" />
        <span className="hero-stage-floor" aria-hidden="true" />

        {visible.map((item, i) => {
          const isActive = i === index;
          return (
            <motion.div
              key={item.id}
              className="hero-stage-layer"
              initial={i === 0 ? false : { opacity: 0, scale: 0.94, y: 22 }}
              animate={isActive ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.94, y: 22 }}
              transition={{ duration: HERO_FADE_S, ease: EASE }}
              style={{ zIndex: isActive ? 2 : 1 }}
            >
              <span className="hero-stage-shadow" aria-hidden="true" />
              <span className="hero-stage-float" style={{ animationDelay: `${i * -1.4}s` }}>
                <picture>
                  <source media="(max-width: 760px)" srcSet={item.imageSmall} type="image/webp" />
                  <img
                    className="hero-stage-img"
                    src={item.image}
                    width={item.width}
                    height={item.height}
                    alt={item.alt}
                    loading={i === 0 ? "eager" : "lazy"}
                    fetchPriority={i === 0 ? "high" : "low"}
                    decoding="async"
                    draggable={false}
                    style={{ maxWidth: `${item.scale * 100}%`, maxHeight: `${item.scale * 100}%` }}
                  />
                </picture>
              </span>
            </motion.div>
          );
        })}

        {/* Gated on mountRest, not on prefersReducedMotion: that flag differs between
            the server and the first client render, which would break hydration. */}
        {mountRest && (
          <div className="hero-progress" aria-hidden="true">
            {heroShowcase.map((item, i) => (
              <span className="hero-progress-track" key={item.id}>
                <motion.span
                  className="hero-progress-fill"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: i === index && running ? 1 : 0 }}
                  transition={
                    i === index && running
                      ? { duration: HERO_HOLD_MS / 1000, ease: "linear" }
                      : { duration: 0.35, ease: "easeOut" }
                  }
                />
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="floating-card top">
        <span>Commercial &amp; residential</span>
        <b className="hero-card-label">
          {/* Invisible sizer holds the card at the width of the longest label, so
              swapping labels never reflows the card. */}
          <i aria-hidden="true">{LONGEST_LABEL}</i>
          {heroShowcase.map((item, i) => (
            <span key={item.id} aria-hidden={i !== index} data-active={i === index ? "" : undefined}>
              {item.cardLabel}
            </span>
          ))}
        </b>
      </div>

      <div className="floating-card bottom">
        <span className="hero-card-pulse" aria-hidden="true">
          <CheckCircle2 size={19} />
        </span>
        <span>
          <b>In stock</b>
          <small>UAE-wide delivery</small>
        </span>
      </div>
    </div>
  );
}
