import { ImageResponse } from 'next/og';

export const alt = 'PQWeave Quantum Exposure Index — most crypto is already quantum-exposed';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function Chip({ children }: { children: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        border: '1px solid rgba(255,255,255,0.14)',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: '999px',
        padding: '12px 22px',
        color: '#d4d4d8',
        fontSize: '26px',
      }}
    >
      {children}
    </div>
  );
}

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: '#0a0a0b',
        backgroundImage:
          'radial-gradient(900px 520px at 88% -10%, rgba(124,108,255,0.22), transparent), radial-gradient(720px 520px at -8% 110%, rgba(52,226,228,0.14), transparent)',
        padding: '72px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              display: 'flex',
              width: '44px',
              height: '44px',
              borderRadius: '13px',
              backgroundColor: '#3f7fbf',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: '26px',
            }}
          >
            Q
          </div>
          <div style={{ display: 'flex', color: '#e7e7ee', fontSize: '30px' }}>PQWeave</div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '999px',
            padding: '11px 20px',
            color: '#a1a1aa',
            fontSize: '22px',
          }}
        >
          <div
            style={{
              display: 'flex',
              width: '9px',
              height: '9px',
              borderRadius: '999px',
              backgroundColor: '#93c5e0',
            }}
          />
          Quantum Exposure Index
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            fontSize: '88px',
            lineHeight: 1.04,
            color: '#e7e7ee',
            letterSpacing: '-3px',
          }}
        >
          Most crypto is already
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: '88px',
            lineHeight: 1.04,
            color: '#93c5e0',
            letterSpacing: '-3px',
          }}
        >
          quantum-exposed.
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: '30px',
            fontSize: '30px',
            color: '#a1a1aa',
            maxWidth: '960px',
          }}
        >
          Public keys leak the moment accounts transact — harvestable today, breakable on Q-Day.
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '14px' }}>
          <Chip>Every active EOA</Chip>
          <Chip>~25% of BTC</Chip>
          <Chip>16 chains live</Chip>
        </div>
        <div style={{ display: 'flex', color: '#71717a', fontSize: '26px' }}>pqweave.com</div>
      </div>
    </div>,
    { ...size },
  );
}
