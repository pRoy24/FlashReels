import Link from "next/link";
import { ArrowRight, Film, Play, ShieldCheck } from "lucide-react";

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
            <Link className="navButton primaryNavButton" href="/feed">
              Public Feed
              <ArrowRight size={16} />
            </Link>
            <Link className="navButton" href="/app">
              App
            </Link>
          </div>
        </nav>

        <div className="heroGrid">
          <div className="heroCopy">
            <p className="eyebrow">Generative video editor</p>
            <h1 id="hero-title">FlashReels</h1>
            <p>
              A focused, step-controlled image-list-to-video workspace powered by RunwayML generation.
              Watch published reels first, then enter the editor only from a permitted whitelisted address.
            </p>
            <div className="heroActions">
              <Link className="primaryAction heroPrimaryAction" href="/feed">
                <Film size={17} />
                View Public Feed
              </Link>
              <Link className="secondaryAction appAccessAction" href="/app">
                <Play size={17} />
                App Access
              </Link>
              <span className="subtleNote">Permitted for whitelisted addresses</span>
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
