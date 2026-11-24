import { ImageResponse } from 'next/og';

export const alt = 'PQWeave: post-quantum readiness for web3 wallets';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const INK = '#14202e';

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
        padding: '64px 72px',
        color: INK,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `2px solid ${INK}`,
          paddingBottom: '24px',
        }}
      >
        <div style={{ display: 'flex', fontSize: '32px', fontWeight: 600 }}>PQWeave</div>
        <div style={{ display: 'flex', fontSize: '22px', color: '#586371' }}>
          16 chains · watch-only · MIT
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: '84px', lineHeight: 1.06, letterSpacing: '-2px' }}>
          Your public key is probably already public.
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: '28px',
            fontSize: '30px',
            lineHeight: 1.35,
            color: '#36424f',
            maxWidth: '940px',
          }}
        >
          Read a wallet’s quantum exposure and get the migration route its chain actually supports.
        </div>
      </div>

      <div style={{ display: 'flex', fontSize: '24px', color: '#586371' }}>pqweave.com</div>
    </div>,
    { ...size },
  );
}
