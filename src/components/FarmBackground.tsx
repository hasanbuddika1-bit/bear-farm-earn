/** Calm animated night-farm scene behind every screen. Pure CSS, no images. */
const STARS = Array.from({ length: 28 }, (_, i) => ({
  left: (i * 37) % 100,
  top: (i * 53) % 45,
  delay: (i % 7) * 0.45,
}));
const FIREFLIES = Array.from({ length: 10 }, (_, i) => ({
  left: 6 + ((i * 29) % 88),
  bottom: 8 + ((i * 17) % 30),
  delay: i * 0.9,
}));
const WHEAT = Array.from({ length: 34 }, (_, i) => i);

export function FarmBackground() {
  return (
    <div className="bf-scene" aria-hidden="true">
      <div className="bf-moon" />
      {STARS.map((s, i) => (
        <span
          key={i}
          className="bf-star"
          style={{ left: `${s.left}%`, top: `${s.top}%`, animationDelay: `${s.delay}s` }}
        />
      ))}
      <span className="bf-cloud" style={{ top: "14%", animationDelay: "-20s" }} />
      <span className="bf-cloud" style={{ top: "24%", width: 180, animationDuration: "95s" }} />
      <svg className="bf-hills" viewBox="0 0 400 200" preserveAspectRatio="none">
        <path className="bf-hill-far" d="M0 110 C 70 70, 140 80, 200 100 S 330 60, 400 95 L400 200 L0 200 Z" />
        <path className="bf-hill-near" d="M0 150 C 90 115, 170 130, 240 145 S 350 120, 400 140 L400 200 L0 200 Z" />
      </svg>
      <div className="bf-wheat-row">
        {WHEAT.map((i) => (
          <span
            key={i}
            className="bf-wheat"
            style={{ height: `${40 + ((i * 13) % 50)}%`, animationDelay: `${(i % 6) * 0.3}s` }}
          />
        ))}
      </div>
      {FIREFLIES.map((f, i) => (
        <span
          key={i}
          className="bf-firefly"
          style={{ left: `${f.left}%`, bottom: `${f.bottom}%`, animationDelay: `${f.delay}s` }}
        />
      ))}
    </div>
  );
}
