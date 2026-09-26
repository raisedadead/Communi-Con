import { type CSSProperties, type ReactNode, useState } from 'react';

const colors = ['#83ac87', '#b9a5e4', '#f1ad75', '#d8e3c8'];
const limit = 150;

interface Peer {
  style: CSSProperties;
  fresh: boolean;
}

function peer(index: number, fresh: boolean): Peer {
  const x = 4 + ((0.13 + index * 0.7549) % 1) * 86;
  const y = 4 + ((0.37 + index * 0.5698) % 1) * 82;
  const delay = -((index * 0.61) % 5);
  const wave = x / 60 - ((performance.now() / 1000) % 20);
  const style = {
    '--x': `${x.toFixed(1)}%`,
    '--y': `${y.toFixed(1)}%`,
    '--d': `${delay.toFixed(2)}s`,
    '--w': `${wave.toFixed(2)}s`,
    '--c': colors[index % colors.length],
  } as CSSProperties;
  return { style, fresh };
}

export function Crowd({ others }: { others: number | null }): ReactNode {
  const [crowd, setCrowd] = useState<{ others: number | null; peers: Peer[] }>({
    others: null,
    peers: [],
  });
  if (others !== null && others !== crowd.others) {
    const target = Math.min(Math.max(others, 0), limit);
    const peers = crowd.peers.slice(0, target);
    for (let index = peers.length; index < target; index++)
      peers.push(peer(index, crowd.others !== null));
    setCrowd({ others, peers });
  }
  return (
    <div className="crowd" aria-hidden="true">
      {crowd.peers.map(({ style, fresh }, index) => (
        <span className={fresh ? 'peer fresh' : 'peer'} key={index} style={style} />
      ))}
      <span className="you">
        <span className="you-tag">You</span>
      </span>
    </div>
  );
}
