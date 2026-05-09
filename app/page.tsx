import Link from "next/link";
import { ArrowRight, Film, Layers3, Play, ShieldCheck, Sparkles } from "lucide-react";

const sections = [
  {
    title: "Step-aware rendering",
    body: "Placeholder text for the guided production flow. This area will describe how creators inspect each generation stage before committing to the next one.",
  },
  {
    title: "Runway-backed adapters",
    body: "Placeholder text for external model routing, completion polling, and custom definitions passed into Samsar step video routes.",
  },
  {
    title: "Private render library",
    body: "Placeholder text for accounts, saved videos, workspace history, and persistent project storage.",
  },
];

export default function LandingPage() {
  return (
    <main className="landingShell">
      <section className="landingHero" aria-labelledby="hero-title">
        <nav className="landingNav">
          <div className="brandMark">
            <Film size={18} />
            <span>FlashReels</span>
          </div>
          <Link className="navButton" href="/app">
            Enter App
            <ArrowRight size={16} />
          </Link>
        </nav>

        <div className="heroGrid">
          <div className="heroCopy">
            <p className="eyebrow">Generative video editor</p>
            <h1 id="hero-title">FlashReels</h1>
            <p>
              Placeholder product copy for a fast, step-controlled video creation workspace over Samsar and Runway.
              We will update this messaging shortly.
            </p>
            <div className="heroActions">
              <Link className="primaryAction" href="/app">
                <Play size={17} />
                Enter App
              </Link>
              <span className="subtleNote">Text to video and image list to video</span>
            </div>
          </div>

          <div className="heroVisual" aria-hidden="true">
            <div className="visualTopbar">
              <span />
              <span />
              <span />
            </div>
            <div className="visualTimeline">
              <div className="visualTrack active">
                <Sparkles size={16} />
                <span>Prompt</span>
              </div>
              <div className="visualTrack active">
                <Layers3 size={16} />
                <span>Images</span>
              </div>
              <div className="visualTrack">
                <Film size={16} />
                <span>Video</span>
              </div>
            </div>
            <div className="visualFrame">
              <div className="frameGrid">
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="playCore">
                <Play size={24} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landingBand">
        <div className="sectionGrid">
          {sections.map((section) => (
            <article className="sectionCard" key={section.title}>
              <ShieldCheck size={19} />
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
