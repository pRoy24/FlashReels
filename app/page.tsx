import Link from "next/link";
import { ArrowRight, Film, Layers3, Play, ShieldCheck, Sparkles } from "lucide-react";

const sections = [
  {
    title: "Step-aware rendering",
    body: "Placeholder text for the guided production flow. This area will describe how creators inspect each generation stage before committing to the next one.",
  },
  {
    title: "RunwayML generation",
    body: "Placeholder text for RunwayML image and video generation, completion polling, and preview-ready output URLs.",
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
          <div className="landingNavActions">
            <Link className="navButton" href="/feed">
              Public Feed
            </Link>
            <Link className="navButton" href="/app">
              Enter App
              <ArrowRight size={16} />
            </Link>
          </div>
        </nav>

        <div className="heroGrid">
          <div className="heroCopy">
            <p className="eyebrow">Generative video editor</p>
            <h1 id="hero-title">FlashReels</h1>
            <p>
              A focused, step-controlled image-list-to-video workspace powered by RunwayML generation.
              The editor is tuned for fast iteration, structured outro setup, and render review.
            </p>
            <div className="heroActions">
              <Link className="primaryAction" href="/app">
                <Play size={17} />
                Enter App
              </Link>
              <Link className="secondaryAction" href="/feed">
                <Film size={17} />
                View Feed
              </Link>
              <span className="subtleNote">Image list to video only</span>
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
