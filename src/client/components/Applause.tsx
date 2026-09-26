import type { CSSProperties, ReactNode } from 'react';

const rising = Array.from({ length: 7 }, (_, index) => ({
  '--x': `${8 + index * 13}%`,
  '--d': `${(index * 0.45).toFixed(2)}s`,
  '--s': `${[20, 28, 36][index % 3]}px`,
  '--c': index % 2 ? '#202821' : '#f2f3eb',
}));

export function Applause({ header, text }: { header: ReactNode; text: string }): ReactNode {
  return (
    <div className="event-screen applause">
      {header}
      <main className="cue">
        <div className="burst" aria-hidden="true">
          {rising.map((style, index) => (
            <span className="rise" key={index} style={style as CSSProperties} />
          ))}
        </div>
        <span className="clap" aria-hidden="true">
          👏
        </span>
        <h1 className="enter">Round of applause</h1>
        {text && (
          <p className="enter" key={text} style={{ '--i': 1 } as CSSProperties}>
            {text}
          </p>
        )}
      </main>
    </div>
  );
}
