import { ImageResponse } from 'next/og';

export const alt = 'PQWeave — post-quantum migration for every EVM wallet';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: '#06060a',
        backgroundImage:
          'radial-gradient(900px 520px at 88% -10%, rgba(124,108,255,0.22), transparent), radial-gradient(720px 520px at -8% 110%, rgba(52,226,228,0.14), transparent)',
        padding: '72px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div
          style={{
            display: 'flex',
            width: '44px',
            height: '44px',
            borderRadius: '13px',
            backgroundColor: '#7c6cff',
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

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            fontSize: '82px',
            lineHeight: 1.05,
            color: '#e7e7ee',
            letterSpacing: '-3px',
          }}
        >
          Quantum-proof any
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: '82px',
            lineHeight: 1.05,
            color: '#34e2e4',
            letterSpacing: '-3px',
          }}
        >
          EVM wallet.
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
          Scan your quantum exposure, then migrate to a post-quantum account — one transaction, any
          wallet, no custody.
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', color: '#a1a1aa', fontSize: '26px' }}>
          Scan · Harden · Migrate
        </div>
        <div style={{ display: 'flex', color: '#71717a', fontSize: '26px' }}>pqweave.com</div>
      </div>
    </div>,
    { ...size },
  );
}
