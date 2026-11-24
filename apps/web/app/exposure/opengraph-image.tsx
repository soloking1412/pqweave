import { ImageResponse } from 'next/og';

export const alt = 'PQWeave Quantum Exposure Index: most crypto is already quantum-exposed';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function Chip({ children }: { children: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        border: '1px solid rgba(20,32,46,0.25)',
        backgroundColor: 'rgba(20,32,46,0.04)',
        borderRadius: '999px',
        padding: '12px 22px',
        color: '#36424f',
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
        backgroundColor: '#f3f0e8',
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
              backgroundColor: '#1d4b7d',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#14202e',
              fontSize: '26px',
            }}
          >
            Q
          </div>
          <div style={{ display: 'flex', color: '#14202e', fontSize: '30px' }}>PQWeave</div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            border: '1px solid rgba(20,32,46,0.25)',
            borderRadius: '999px',
            padding: '11px 20px',
            color: '#586371',
            fontSize: '22px',
          }}
        >
          <div
            style={{
              display: 'flex',
              width: '9px',
              height: '9px',
              borderRadius: '999px',
              backgroundColor: '#1d4b7d',
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
            color: '#14202e',
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
            color: '#1d4b7d',
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
            color: '#586371',
            maxWidth: '960px',
          }}
        >
          Public keys leak the moment accounts transact. They can be recorded now and attacked
          later.
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '14px' }}>
          <Chip>Every active EOA</Chip>
          <Chip>~25% of BTC</Chip>
          <Chip>16 chains live</Chip>
        </div>
        <div style={{ display: 'flex', color: '#6d7680', fontSize: '26px' }}>pqweave.com</div>
      </div>
    </div>,
    { ...size },
  );
}
