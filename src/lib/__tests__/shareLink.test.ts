import { describe, it, expect } from 'vitest';
import { buildShareLink, clearSharedMixFromUrl, decodeMix, encodeMix, readSharedMix } from '../shareLink';

const mix = [
  { name: 'SPUS', percentage: 50 },
  { name: 'SPTE', percentage: 40 },
  { name: 'SPWO', percentage: 10 },
];

describe('shareLink', () => {
  it('encodes a mix, leaving out 0% funds', () => {
    expect(encodeMix([...mix, { name: 'MSFT', percentage: 0 }])).toBe('SPUS:50,SPTE:40,SPWO:10');
  });

  it('builds a readable link', () => {
    expect(buildShareLink(mix, { origin: 'https://example.com', pathname: '/' }))
      .toBe('https://example.com/?mix=SPUS:50,SPTE:40,SPWO:10');
  });

  it('round-trips through the URL', () => {
    const link = new URL(buildShareLink(mix, { origin: 'https://example.com', pathname: '/' }));
    expect(readSharedMix(link.search)).toEqual(mix);
  });

  it('accepts decimals and lowercase tickers', () => {
    expect(decodeMix('vti:33.33,vxus:33.33,bnd:33.34')).toEqual([
      { name: 'VTI', percentage: 33.33 },
      { name: 'VXUS', percentage: 33.33 },
      { name: 'BND', percentage: 33.34 },
    ]);
  });

  it('carries funds added by name, as they were written', () => {
    const own = [
      { name: 'VTI', percentage: 60 },
      { name: 'Target Retirement 2050 Trust Select', percentage: 30 },
      { name: 'Stable Value Fund (Class 3) & Co', percentage: 10 },
    ];
    const link = new URL(buildShareLink(own, { origin: 'https://example.com', pathname: '/' }));
    expect(readSharedMix(link.search)).toEqual(own);
  });

  it.each([
    [''],
    ['SPUS:50,SPTE:40'],
    ['SPUS:50,SPUS:50'],
    ['SPUS:fifty,SPTE:50'],
    ['SPUS:-10,SPTE:110'],
    ['<script>:100'],
    ['SPUS:50:1,SPTE:50'],
    ['SPUS'],
    ['SPUS:50,<b>x</b>:50'],
    ['SPUS:50,  :50'],
    ['SPUS:50,2050:50,2050:0'],
    [`SPUS:50,${'Long name '.repeat(7)}:50`],
  ])('rejects %j', (value) => {
    expect(decodeMix(value)).toBeNull();
  });

  it('removes the mix from the address bar and keeps other parameters', () => {
    window.history.replaceState(null, '', '/?layout=stacked&mix=SPUS:100');
    clearSharedMixFromUrl();
    expect(window.location.search).toBe('?layout=stacked');
  });
});
