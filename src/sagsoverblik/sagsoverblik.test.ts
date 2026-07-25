import { describe, expect, it } from 'vitest';
import {
  byggSagsoverblik,
  fristtekst,
  taelPerHastegrad,
  type OverblikOpkraevning,
  type OverblikSag,
  type OverblikYdelse,
} from './sagsoverblik.js';

const IDAG = '2026-07-25';

function sag(overrides: Partial<OverblikSag> = {}): OverblikSag {
  return {
    id: 's1',
    sagsnummer: 'REN-2026-00200',
    sagstype_navn: 'Ansøgning om ekstra beholder',
    sagstype_kode: 'ANSOEG_EKSTRA_BEHOLDER',
    ejendom_id: 'ejendom-01',
    part_id: 'part-01',
    status: 'UNDER_BEHANDLING',
    kanal: 'SAGSBEHANDLER',
    modtaget_dato: '2026-07-01',
    frist_dato: '2026-08-30',
    ansvarlig_bruger: 'Sagsbehandler ABC',
    har_ansoegning: false,
    ...overrides,
  };
}

function kunSager(sager: OverblikSag[], paaDato = IDAG) {
  return byggSagsoverblik({ paaDato, sager, ydelser: [], opkraevninger: [] });
}

describe('hastegrad ud fra sagsfrist', () => {
  it('frist i går → KRITISK', () => {
    const [p] = kunSager([sag({ frist_dato: '2026-07-24' })]);
    expect(p?.hastegrad).toBe('KRITISK');
  });
  it('frist om 2 dage → KRITISK', () => {
    const [p] = kunSager([sag({ frist_dato: '2026-07-27' })]);
    expect(p?.hastegrad).toBe('KRITISK');
  });
  it('frist om 5 dage → HOEJ', () => {
    const [p] = kunSager([sag({ frist_dato: '2026-07-30' })]);
    expect(p?.hastegrad).toBe('HOEJ');
  });
  it('frist om 20 dage → NORMAL', () => {
    const [p] = kunSager([sag({ frist_dato: '2026-08-14' })]);
    expect(p?.hastegrad).toBe('NORMAL');
  });
});

describe('systemsager', () => {
  it('ydelse der udløber i morgen uden fornyelse → KRITISK, UDLOEB_YDELSE', () => {
    const ydelser: OverblikYdelse[] = [
      { id: 'ly-9', ejendom_id: 'ejendom-01', navn: '240 l beholder', gyldig_til: '2026-07-26', fornyet: false },
    ];
    const [p] = byggSagsoverblik({ paaDato: IDAG, sager: [], ydelser, opkraevninger: [] });
    expect(p?.hastegrad).toBe('KRITISK');
    expect(p?.kategori).toBe('UDLOEB_YDELSE');
    expect(p?.kilde).toBe('YDELSE');
  });

  it('en fornyet ydelse giver ingen systemsag', () => {
    const ydelser: OverblikYdelse[] = [
      { id: 'ly-9', ejendom_id: 'ejendom-01', navn: '240 l beholder', gyldig_til: '2026-07-26', fornyet: true },
    ];
    const poster = byggSagsoverblik({ paaDato: IDAG, sager: [], ydelser, opkraevninger: [] });
    expect(poster).toHaveLength(0);
  });

  it('forfalden opkrævning → KRITISK, BETALING', () => {
    // dannet 2026-05-01, betalingsfrist 30 dage → forfald 2026-05-31, forfalden pr. i dag.
    const opkraevninger: OverblikOpkraevning[] = [
      {
        id: 'opk-9',
        ejendom_id: 'ejendom-01',
        periode_fra: '2026-01-01',
        periode_til: '2027-01-01',
        status: 'SENDT',
        dannet_dato: '2026-05-01',
      },
    ];
    const [p] = byggSagsoverblik({ paaDato: IDAG, sager: [], ydelser: [], opkraevninger });
    expect(p?.hastegrad).toBe('KRITISK');
    expect(p?.kategori).toBe('BETALING');
    expect(p?.kilde).toBe('OPKRAEVNING');
  });

  it('en betalt opkrævning er ikke forfalden', () => {
    const opkraevninger: OverblikOpkraevning[] = [
      { id: 'opk-9', ejendom_id: 'ejendom-01', periode_fra: '2026-01-01', periode_til: '2027-01-01', status: 'BETALT', dannet_dato: '2026-05-01' },
    ];
    expect(byggSagsoverblik({ paaDato: IDAG, sager: [], ydelser: [], opkraevninger })).toHaveLength(0);
  });
});

describe('kategori og afventer', () => {
  it('en selvbetjeningsansøgning uberørt ud over tærsklen → HOEJ, SELVBETJENING', () => {
    // modtaget for 10 dage siden (> 5), frist langt ude (ellers NORMAL).
    const [p] = kunSager([
      sag({ kanal: 'SELVBETJENING', status: 'MODTAGET', har_ansoegning: true, modtaget_dato: '2026-07-15', frist_dato: '2026-08-30' }),
    ]);
    expect(p?.hastegrad).toBe('HOEJ');
    expect(p?.kategori).toBe('SELVBETJENING');
  });

  it('en sag i PARTSHOERING → AFVENTER, uanset frist', () => {
    const [p] = kunSager([sag({ status: 'PARTSHOERING', frist_dato: '2026-07-24' })]); // frist overskredet
    expect(p?.hastegrad).toBe('AFVENTER');
  });

  it('en klagesag får kategori KLAGE', () => {
    const [p] = kunSager([sag({ sagstype_kode: 'KLAGE_TOEMNING', frist_dato: '2026-07-27' })]);
    expect(p?.kategori).toBe('KLAGE');
  });

  it('afgjorte og lukkede sager indgår ikke', () => {
    expect(kunSager([sag({ status: 'AFGJORT' })])).toHaveLength(0);
    expect(kunSager([sag({ status: 'LUKKET' })])).toHaveLength(0);
  });
});

describe('sortering', () => {
  it('kritisk før høj før normal; inden for samme hastegrad tidligste frist først', () => {
    const poster = kunSager([
      sag({ id: 'normal', frist_dato: '2026-08-20' }), // NORMAL
      sag({ id: 'kritisk-sen', frist_dato: '2026-07-27' }), // KRITISK (om 2 dage)
      sag({ id: 'kritisk-tidlig', frist_dato: '2026-07-24' }), // KRITISK (overskredet)
      sag({ id: 'hoej', frist_dato: '2026-07-30' }), // HOEJ (om 5 dage)
    ]);
    expect(poster.map((p) => p.id)).toEqual(['kritisk-tidlig', 'kritisk-sen', 'hoej', 'normal']);
  });
});

describe('totaler og fristtekst', () => {
  it('totaler pr. hastegrad summer korrekt', () => {
    const poster = kunSager([
      sag({ id: 'a', frist_dato: '2026-07-24' }), // KRITISK
      sag({ id: 'b', frist_dato: '2026-07-27' }), // KRITISK
      sag({ id: 'c', frist_dato: '2026-07-30' }), // HOEJ
      sag({ id: 'd', frist_dato: '2026-08-20' }), // NORMAL
      sag({ id: 'e', status: 'PARTSHOERING', frist_dato: '2026-07-30' }), // AFVENTER
    ]);
    expect(taelPerHastegrad(poster)).toEqual({ KRITISK: 2, HOEJ: 1, NORMAL: 1, AFVENTER: 1 });
  });

  it('fristtekst i klar tale', () => {
    expect(fristtekst(-2)).toBe('Overskredet 2 dage');
    expect(fristtekst(-1)).toBe('Overskredet 1 dag');
    expect(fristtekst(0)).toBe('Udløber i dag');
    expect(fristtekst(1)).toBe('Udløber i morgen');
    expect(fristtekst(4)).toBe('Frist om 4 dage');
  });
});
