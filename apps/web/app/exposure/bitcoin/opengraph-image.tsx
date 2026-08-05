import { ImageResponse } from 'next/og';

export const alt =
  'Bitcoin Quantum Exposure — about a third of all BTC has revealed its public key';
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
        backgroundImage:
          'radial-gradient(900px 520px at 88% -10%, rgba(247,147,26,0.20), transparent), radial-gradient(720px 520px at -8% 110%, rgba(124,108,255,0.14), transparent)',
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
            border: '1px solid rgba(247,147,26,0.4)',
            backgroundColor: 'rgba(247,147,26,0.12)',
            borderRadius: '999px',
            padding: '11px 20px',
            color: '#f7c886',
            fontSize: '22px',
          }}
        >
          <div
            style={{
              display: 'flex',
              width: '9px',
              height: '9px',
              borderRadius: '999px',
              backgroundColor: '#f7931a',
            }}
          />
          Bitcoin Quantum Exposure
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            fontSize: '82px',
            lineHeight: 1.04,
            color: '#e7e7ee',
            letterSpacing: '-3px',
          }}
        >
          About a third of all BTC
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: '82px',
            lineHeight: 1.04,
            color: '#f7931a',
            letterSpacing: '-3px',
          }}
        >
          has revealed its key.
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: '30px',
            fontSize: '30px',
            color: '#a1a1aa',
            maxWidth: '980px',
          }}
        >
          ~6 million BTC sit in addresses that already published their public key. Estimate, Mar
          2026.
        </div>
      </div>

      {/* Stacked exposure bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '26px',
            borderRadius: '999px',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', width: '9.6%', backgroundColor: '#f43f5e' }} />
          <div style={{ display: 'flex', width: '20.6%', backgroundColor: '#f97316' }} />
          <div style={{ display: 'flex', width: '69.8%', backgroundColor: '#10b981' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', color: '#a1a1aa', fontSize: '24px' }}>
            30% exposed · 70% not yet exposed
          </div>
          <div style={{ display: 'flex', color: '#71717a', fontSize: '26px' }}>pqweave.com</div>
        </div>
      </div>
    </div>,
    { ...size },
  );
}
