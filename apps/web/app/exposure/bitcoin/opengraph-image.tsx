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
            border: '1px solid rgba(247,147,26,0.4)',
            backgroundColor: 'rgba(247,147,26,0.12)',
            borderRadius: '999px',
            padding: '11px 20px',
            color: '#8a5a0a',
            fontSize: '22px',
          }}
        >
          <div
            style={{
              display: 'flex',
              width: '9px',
              height: '9px',
              borderRadius: '999px',
              backgroundColor: '#b3650a',
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
            color: '#14202e',
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
            color: '#b3650a',
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
            color: '#586371',
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
          <div style={{ display: 'flex', width: '9.6%', backgroundColor: '#b3261e' }} />
          <div style={{ display: 'flex', width: '20.6%', backgroundColor: '#bd5417' }} />
          <div style={{ display: 'flex', width: '69.8%', backgroundColor: '#2c6a49' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', color: '#586371', fontSize: '24px' }}>
            30% exposed · 70% not yet exposed
          </div>
          <div style={{ display: 'flex', color: '#6d7680', fontSize: '26px' }}>pqweave.com</div>
        </div>
      </div>
    </div>,
    { ...size },
  );
}
