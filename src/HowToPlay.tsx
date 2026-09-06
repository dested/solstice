function Diagram({ step }: { step: number }) {
  const dots = Array.from({ length: 16 }, (_, i) => {
    const angle = i * 2.39996;
    const r = 23 + (i % 4) * 4;
    const x = step === 1 ? 42 + i * 6 : 65 + Math.cos(angle) * r;
    const y = step === 1 ? 48 + Math.sin(i * 2) * 9 : 48 + Math.sin(angle) * r;
    return <circle key={i} cx={x} cy={y} r="1.8" fill="#ffd094" />;
  });
  return (
    <svg
      className="manual-diagram"
      viewBox="0 0 210 96"
      role="img"
      aria-label={
        [
          "Select units around your star",
          "Send selected units to a destination",
          "Capture a neutral star",
          "Spend units to upgrade production",
        ][step]
      }
    >
      <defs>
        <radialGradient id={`sun-${step}`}>
          <stop stopColor="#fff1ca" />
          <stop offset=".5" stopColor="#ffd094" />
          <stop offset="1" stopColor="#9e5930" />
        </radialGradient>
      </defs>
      <circle cx="65" cy="48" r="16" fill={`url(#sun-${step})`} />
      {step !== 2 && dots}
      {step === 0 && (
        <rect
          x="23"
          y="7"
          width="84"
          height="81"
          rx="4"
          fill="#ffd09408"
          stroke="#ffd094"
          strokeDasharray="4 4"
        />
      )}
      {step === 1 && (
        <>
          <path d="M102 48h68m-7-7 8 7-8 7" stroke="#ffd094" fill="none" />
          <circle cx="177" cy="48" r="12" stroke="#a9bed1" fill="#0b1522" />
        </>
      )}
      {step === 2 && (
        <>
          <path d="M91 48h38m-7-6 7 6-7 6" stroke="#ffd094" fill="none" />
          <circle cx="158" cy="48" r="16" fill={`url(#sun-${step})`} />
          <text x="158" y="81" textAnchor="middle" fill="#d2e0ee" fontSize="10">
            YOUR STAR
          </text>
        </>
      )}
      {step === 3 && (
        <>
          <circle cx="65" cy="48" r="23" stroke="#ffd094" fill="none" />
          <text x="116" y="43" fill="#d2e0ee" fontSize="12">
            60 units
          </text>
          <text x="116" y="62" fill="#ffd094" fontSize="13">
            +3.4 / sec
          </text>
        </>
      )}
    </svg>
  );
}

export function HowToPlay() {
  return (
    <div className="manual-cards">
      {[
        [
          "Select your units",
          "Your stars make units automatically. Click a star or drag a box around your units. On touch, switch to Select to draw a box.",
        ],
        [
          "Send them anywhere",
          "With units selected, click or tap a destination. Enemy units destroy each other one for one. Your own units never attack each other.",
        ],
        [
          "Capture more stars",
          "The number under a neutral or enemy star is its defense. Send more units than that number, plus enough to beat enemy units nearby.",
        ],
        [
          "Repair & upgrade",
          "Send units home to repair: 1 unit heals 1 defense. Once full, units upgrade production: 60 for level 2, then 120 for level 3, up to the star’s limit.",
        ],
      ].map(([title, detail], i) => (
        <article key={title}>
          <Diagram step={i} />
          <h3>
            <span>0{i + 1}</span>
            {title}
          </h3>
          <p>{detail}</p>
        </article>
      ))}
    </div>
  );
}
