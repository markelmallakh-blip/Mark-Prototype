import type { ReactNode } from 'react';
import { DEVICES, type Device } from '../../../shared/types';

// Frame geometry in CSS px at 100% zoom. The screen area is exactly the device viewport.
const MAC = { bezelX: 20, bezelTop: 24, bezelBottom: 24, baseOverhang: 92, baseH: 24 };
const PHONE = { bezel: 14, button: 3 };

export function frameSize(device: Device) {
  const { width, height } = DEVICES[device];
  if (device === 'desktop') {
    const lidW = width + MAC.bezelX * 2;
    return { w: lidW + MAC.baseOverhang * 2, h: height + MAC.bezelTop + MAC.bezelBottom + MAC.baseH };
  }
  return { w: width + PHONE.bezel * 2 + PHONE.button * 2, h: height + PHONE.bezel * 2 };
}

export function DeviceFrame({ device, children }: { device: Device; children: ReactNode }) {
  const { width, height } = DEVICES[device];
  const size = frameSize(device);

  if (device === 'desktop') {
    const lidW = width + MAC.bezelX * 2;
    const lidH = height + MAC.bezelTop + MAC.bezelBottom;
    return (
      <div className="relative" style={{ width: size.w, height: size.h }}>
        <div
          className="absolute"
          style={{
            left: MAC.baseOverhang,
            top: 0,
            width: lidW,
            height: lidH,
            borderRadius: '28px 28px 8px 8px',
            background: '#0a0a0b',
            boxShadow: 'inset 0 0 0 2px #2c2d31, 0 0 0 1.5px #74767c, 0 60px 120px -20px rgba(0,0,0,.65)',
          }}
        >
          <span className="absolute left-1/2 top-[9px] size-[7px] -translate-x-1/2 rounded-full bg-[#1d1e22] ring-1 ring-[#2f3036]" />
          <div
            className="absolute overflow-hidden bg-white"
            style={{ left: MAC.bezelX, top: MAC.bezelTop, width, height, borderRadius: 6 }}
          >
            {children}
          </div>
        </div>
        <div
          className="absolute left-0"
          style={{
            top: lidH - 2,
            width: size.w,
            height: MAC.baseH,
            borderRadius: '3px 3px 20px 20px / 3px 3px 22px 22px',
            background: 'linear-gradient(180deg,#eceef0 0%,#c7c9cd 42%,#9a9ca1 100%)',
            boxShadow: '0 30px 60px -18px rgba(0,0,0,.6)',
          }}
        >
          <span
            className="absolute left-1/2 top-0 -translate-x-1/2"
            style={{ width: 280, height: 11, borderRadius: '0 0 14px 14px', background: 'linear-gradient(180deg,#9fa1a6,#c9cbcf)' }}
          />
        </div>
      </div>
    );
  }

  const bodyW = width + PHONE.bezel * 2;
  return (
    <div className="relative" style={{ width: size.w, height: size.h }}>
      {/* side buttons */}
      <span className="absolute left-0 w-[4px] rounded-l bg-[#2a2b2f]" style={{ top: 190, height: 36 }} />
      <span className="absolute left-0 w-[4px] rounded-l bg-[#2a2b2f]" style={{ top: 256, height: 66 }} />
      <span className="absolute left-0 w-[4px] rounded-l bg-[#2a2b2f]" style={{ top: 336, height: 66 }} />
      <span className="absolute right-0 w-[4px] rounded-r bg-[#2a2b2f]" style={{ top: 290, height: 104 }} />
      <div
        className="absolute top-0"
        style={{
          left: PHONE.button,
          width: bodyW,
          height: size.h,
          borderRadius: 72,
          background: '#0a0a0b',
          boxShadow: 'inset 0 0 0 2px #3b3c41, 0 0 0 1.5px #5b5d63, 0 60px 120px -20px rgba(0,0,0,.65)',
        }}
      >
        <div
          className="absolute overflow-hidden bg-white"
          style={{ left: PHONE.bezel, top: PHONE.bezel, width, height, borderRadius: 58 }}
        >
          {children}
          <span className="pointer-events-none absolute left-1/2 top-[11px] z-10 h-[36px] w-[124px] -translate-x-1/2 rounded-full bg-black" />
        </div>
      </div>
    </div>
  );
}
