import Link from "next/link";
import { ArrowRight, Boxes, Film, ShieldCheck, Sparkles } from "lucide-react";

import { LandingVideoReel } from "@/app/LandingVideoReel";
import { listPublishedFeedItems } from "@/lib/feed";

const sections = [
  {
    title: "Step-aware rendering",
    body: "Inspect every generation stage, lock the frames that work, and move forward without losing creative control.",
  },
  {
    title: "RunwayML generation",
    body: "Generate preview-ready motion from curated image lists with completion polling and clean output URLs.",
  },
  {
    title: "Private render library",
    body: "Keep completed reels, workspace history, and published feed state tied to the current creator account.",
  },
];

export default async function LandingPage() {
  const publishedVideos = await listPublishedFeedItems();

  return (
    <main className="landingShell">
      <section className="landingHero" id="top" aria-labelledby="hero-title">
        <nav className="landingNav">
          <div className="brandMark">
            <Film size={18} />
            <span>FlashReels</span>
          </div>
          <div className="landingNavActions">
            <Link className="navButton primaryNavButton" href="/feed">
              Public Feed
              <ArrowRight size={16} />
            </Link>
            <Link className="navButton" href="/app">
              Enter App
            </Link>
          </div>
        </nav>

        <div className="heroGrid">
          <div className="heroCopy">
            <p className="eyebrow">Generative video editor</p>
            <h1 id="hero-title">FlashReels</h1>
            <p>
              A focused, step-controlled image-list-to-video workspace powered by RunwayML generation.
              Build the reel, publish the strongest result, then let the landing page become the playback surface.
            </p>
            <div className="heroActions">
              <Link className="primaryAction heroPrimaryAction" href="#published-reels">
                <Film size={17} />
                Watch Reels
              </Link>
              <Link className="secondaryAction appAccessAction" href="/app">
                Enter App
              </Link>
            </div>
          </div>

          <div className="heroVisual" aria-hidden="true">
            <div className="visualFrame">
              <video
                className="heroAnimationVideo"
                src="/assets/flashreels-louisiana-hero-animation.mp4"
                autoPlay
                muted
                loop
                playsInline
              />
            </div>
          </div>
        </div>
        <a className="landingScrollCue" href="#workflow" aria-label="Scroll to workflow section">
          <span />
        </a>
      </section>

      <section className="landingBand" id="workflow" aria-labelledby="workflow-title">
        <div className="workflowIntro">
          <p className="eyebrow">Production loop</p>
          <h2 id="workflow-title">Render, review, publish, replay.</h2>
          <p>
            The landing experience now moves like the app: quick decision surfaces first, then a direct handoff
            into published playback on the next scroll.
          </p>
        </div>
        <div className="sectionGrid">
          {sections.map((section, index) => {
            const Icon = index === 0 ? Sparkles : index === 1 ? Boxes : ShieldCheck;
            return (
              <article className="sectionCard" key={section.title}>
                <Icon size={20} />
                <h3>{section.title}</h3>
                <p>{section.body}</p>
              </article>
            );
          })}
        </div>
        <div className="workflowVisual" aria-hidden="true">
          <img src="/assets/flashreels-video-section-screenshot.png" alt="" />
        </div>
      </section>

      <LandingVideoReel items={publishedVideos} />
    </main>
  );
}
