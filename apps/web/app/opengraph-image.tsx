import { ImageResponse } from 'next/og';

export const alt = 'PQWeave — post-quantum security for web3 wallets';
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
        backgroundColor: '#0a0a0b',
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
            backgroundColor: '#3f7fbf',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            fontSize: '26px',
          }}
        >
          Q
        </div>
        <div style={{ display: 'flex', color: '#e9e7e2', fontSize: '30px' }}>PQWeave</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            fontSize: '82px',
            lineHeight: 1.05,
            color: '#e9e7e2',
            letterSpacing: '-3px',
          }}
        >
          Your public key is
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: '82px',
            lineHeight: 1.05,
            color: '#93c5e0',
            letterSpacing: '-3px',
          }}
        >
          already exposed.
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
          Scan any address across 16 chains. Move an EVM wallet behind a post-quantum signature in
          one transaction.
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
