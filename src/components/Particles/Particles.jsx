import { useMemo } from 'react';

const COUNT = 40;

export default function Particles() {
  const particles = useMemo(
    () =>
      Array.from({ length: COUNT }, () => ({
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        size: `${1 + Math.random() * 2}px`,
        dur: `${5 + Math.random() * 8}s`,
        delay: `${Math.random() * 8}s`,
      })),
    []
  );

  return (
    <div className="login-bg-particles">
      {particles.map((p, i) => (
        <div
          key={i}
          className="particle"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            '--dur': p.dur,
            '--delay': p.delay,
          }}
        />
      ))}
    </div>
  );
}
