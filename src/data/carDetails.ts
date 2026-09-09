import type { CarDetail } from './types.ts'

/**
 * The printed detail for each car: the drivetrain, the engine, the years it was built, the
 * source its published figures came from, and a tier note where the tier was a judgment.
 * Only the card detail panel reads any of it, and it is a fifth of the roster by size, so it
 * lives apart from the roster and loads when a panel first opens rather than at first paint.
 *
 * Keyed by car id. Every car in CARS has an entry here, which carDetails.test.ts pins.
 */
export const CAR_DETAILS: Readonly<Record<string, CarDetail>> = {
  'mazda-mx-5-miata': {
    drivetrain: 'RWD',
    engine: '2.0L Skyactiv-G I4',
    productionYears: '2019–present',
    source: 'Mazda USA, 2019 MX-5 Miata spec deck (Sport soft top, 6MT)',
  },
  'toyota-gr86': {
    drivetrain: 'RWD',
    engine: '2.4L FA24 flat-4',
    productionYears: '2022–present',
    source: 'Toyota USA Newsroom, 2022 GR86 release (base, 6MT)',
    tierNote:
      'Sits at 0.081 hp/lb, just over the Performance floor. Placed Daily by judgment: it is the entry sports car of the roster and pairs with the Miata.',
  },
  'porsche-911-carrera-s': {
    drivetrain: 'RWD',
    engine: '3.0L twin-turbo flat-6',
    productionYears: '2020–2024',
    source: 'Porsche USA, 911 Carrera S (992) data sheet (PDK; 450 PS)',
  },
  'lotus-emira': {
    drivetrain: 'RWD',
    engine: '3.5L supercharged V6',
    productionYears: '2022–present',
    source: 'Lotus Cars, Emira V6 First Edition specifications (405 PS; DIN kerb weight 1,458 kg)',
  },
  'ferrari-f430': {
    drivetrain: 'RWD',
    engine: '4.3L V8',
    productionYears: '2004–2009',
    source: 'Ferrari, F430 technical specifications (490 CV; dry weight 1,450 kg)',
  },
  'ferrari-458-italia': {
    drivetrain: 'RWD',
    engine: '4.5L V8',
    productionYears: '2009–2015',
    source: 'Ferrari, 458 Italia technical specifications (570 CV; kerb weight 1,485 kg)',
  },
  'lamborghini-murcielago-lp640': {
    drivetrain: 'AWD',
    engine: '6.5L V12',
    productionYears: '2006–2010',
    source: 'Lamborghini, Murciélago LP640 technical specifications (640 CV; dry weight 1,665 kg)',
  },
  'lamborghini-aventador-svj': {
    drivetrain: 'AWD',
    engine: '6.5L V12',
    productionYears: '2018–2021',
    source: 'Lamborghini, Aventador SVJ technical specifications (770 CV; dry weight 1,525 kg)',
  },
  'lamborghini-temerario': {
    drivetrain: 'AWD',
    engine: '4.0L twin-turbo V8 hybrid',
    productionYears: '2025–present',
    source:
      'Lamborghini, Temerario technical specifications (920 CV combined; dry weight 1,690 kg)',
  },
  'mclaren-765lt': {
    drivetrain: 'RWD',
    engine: '4.0L twin-turbo V8',
    productionYears: '2020–2022',
    source: 'McLaren press release, 765LT launch (765 PS; DIN kerb weight 1,339 kg)',
  },
  'mazda-mx-5-miata-na': {
    drivetrain: 'RWD',
    engine: '1.6 L DOHC inline-4',
    productionYears: '1989–1993',
    source:
      'Mazda 1990 MX-5 Miata specifications (115 bhp, 2,160 lb without options); Car and Driver, September 1989',
  },
  'toyota-mr2-spyder': {
    drivetrain: 'RWD',
    engine: '1.8 L inline-4 (1ZZ-FE)',
    productionYears: '2000–2005',
    source: 'Toyota 2000 MR2 Spyder specifications (138 hp, 2,195 lb manual)',
  },
  'porsche-914': {
    drivetrain: 'RWD',
    engine: '1.7 L flat-4, Bosch D-Jetronic',
    productionYears: '1970–1973',
    source: 'Porsche 914 1.7 technical data (80 PS DIN, 940 kg); Auto Motor und Sport 22/1969',
  },
  'porsche-boxster-s-987': {
    drivetrain: 'RWD',
    engine: '3.4 L flat-6',
    productionYears: '2009–2012',
    source:
      'Porsche 2009 Boxster S technical specifications (310 hp, 2,987 lb), via Kelley Blue Book spec page',
  },
  'bmw-z4-m40i': {
    drivetrain: 'RWD',
    engine: '3.0 L turbo inline-6',
    productionYears: '2019–present',
    source: 'BMW Group USA press release, The New BMW Z4 (382 hp, 3,443 lb)',
  },
  'porsche-718-cayman-gts': {
    drivetrain: 'RWD',
    engine: '4.0 L flat-6',
    productionYears: '2021–present',
    source: 'Porsche Cars North America press kit, 718 GTS 4.0 models (394 hp, 3,031 lb manual)',
  },
  'porsche-911-turbo-s-992': {
    drivetrain: 'AWD',
    engine: '3.8 L twin-turbo flat-6',
    productionYears: '2021–2024',
    source:
      'Porsche Newsroom, 2021 911 Turbo S (640 hp); Porsche EU technical data, 1,640 kg curb weight',
  },
  'delorean-dmc-12': {
    drivetrain: 'RWD',
    engine: '2.85L PRV V6',
    productionYears: '1981–1983',
    source:
      'DeLorean Motor Company, 1981 DMC-12 specifications (130 hp SAE net, 2,712 lb curb); 0–60 and top speed as tested by Road & Track in 1981',
  },
  'porsche-911-gt3-992': {
    drivetrain: 'RWD',
    engine: '4.0L flat-six',
    productionYears: '2021–2024',
    source:
      'Porsche, The new 911 GT3 press kit (2021): 510 PS, 1,435 kg DIN with PDK, 318 km/h; 502 hp and 0–60 as published by Porsche Cars North America',
  },
  'ferrari-f40': {
    drivetrain: 'RWD',
    engine: '2.9L twin-turbo V8',
    productionYears: '1987–1992',
    source:
      'Ferrari, F40 model page (478 cv at 7,000 rpm, 324 km/h, 0–100 km/h 4.1 s); kerb weight 1,254 kg as measured by Auto Motor und Sport, Ferrari publishes only a dry weight',
  },
  'bugatti-chiron': {
    drivetrain: 'AWD',
    engine: '8.0L quad-turbo W16',
    productionYears: '2016–2024',
    source:
      'Bugatti, Chiron media kit (2018): 1,500 PS, 1,995 kg, 0–100 km/h under 2.5 s, 420 km/h limited',
  },
  'lexus-is-300': {
    drivetrain: 'RWD',
    engine: '2.0L turbo I4',
    productionYears: '2021–present',
    source: 'Lexus USA, 2021 IS 300 RWD specifications',
  },
  'mercedes-benz-c-300': {
    drivetrain: 'RWD',
    engine: '2.0L turbo I4 mild hybrid',
    productionYears: '2022–present',
    source: 'Mercedes-Benz USA, 2022 C-Class Sedan quick reference guide (C 300)',
  },
  'rolls-royce-wraith': {
    drivetrain: 'RWD',
    engine: '6.6L twin-turbo V12',
    productionYears: '2013–2023',
    source:
      'Rolls-Royce Motor Cars, Wraith press kit and technical specifications (624 bhp; 2,440 kg)',
  },
  'lexus-lc-500': {
    drivetrain: 'RWD',
    engine: '5.0L V8',
    productionYears: '2018–present',
    source: 'Lexus USA Newsroom, LC 500 coupe release and specifications',
  },
  'bmw-m5-competition': {
    drivetrain: 'AWD',
    engine: '4.4L twin-turbo V8',
    productionYears: '2019–2023',
    source: 'BMW Group PressClub USA, 2019 M5 Competition Sedan specifications',
  },
  'mercedes-amg-gt-r': {
    drivetrain: 'RWD',
    engine: '4.0L twin-turbo V8',
    productionYears: '2017–2021',
    source: 'Mercedes-Benz Group media, AMG GT R press release (585 PS; DIN kerb weight 1,555 kg)',
  },
  'aston-martin-dbs-superleggera': {
    drivetrain: 'RWD',
    engine: '5.2L twin-turbo V12',
    productionYears: '2018–2023',
    source:
      'Aston Martin, DBS Superleggera launch release and specifications (725 PS; kerb weight 1,845 kg)',
  },
  'ferrari-812-superfast': {
    drivetrain: 'RWD',
    engine: '6.5L V12',
    productionYears: '2017–2020',
    source: 'Ferrari, 812 Superfast technical specifications (800 CV; kerb weight 1,630 kg)',
  },
  'ferrari-12cilindri': {
    drivetrain: 'RWD',
    engine: '6.5L V12',
    productionYears: '2024–present',
    source: 'Ferrari, 12Cilindri technical specifications (830 CV; dry weight 1,560 kg)',
  },
  'lexus-es-250': {
    drivetrain: 'AWD',
    engine: '2.5 L inline-4',
    productionYears: '2021–present',
    source: 'Lexus 2021 ES 250 AWD specifications (203 hp, 3,780 lb), via Cars.com spec page',
  },
  'mercedes-benz-e-300': {
    drivetrain: 'RWD',
    engine: '2.0 L turbo inline-4',
    productionYears: '2017–2019',
    source: 'Mercedes-Benz USA 2017 E 300 sedan specifications (241 hp, 3,650 lb)',
  },
  'bmw-330i': {
    drivetrain: 'RWD',
    engine: '2.0 L turbo inline-4',
    productionYears: '2019–present',
    source: 'BMW USA 2020 330i sedan specifications (255 hp, 3,582 lb), via Cars.com spec page',
  },
  'cadillac-ct5-v': {
    drivetrain: 'RWD',
    engine: '3.0 L twin-turbo V6',
    productionYears: '2020–present',
    source: 'Cadillac 2020 CT5-V specifications (360 hp SAE net, 3,974 lb), via Cars.com spec page',
  },
  'bentley-continental-gt-v8': {
    drivetrain: 'AWD',
    engine: '4.0 L twin-turbo V8',
    productionYears: '2020–2024',
    source: 'Bentley Motors, Continental GT V8 launch release (550 PS, 2,164 kg)',
  },
  'mercedes-amg-c-63-s': {
    drivetrain: 'RWD',
    engine: '4.0 L twin-turbo V8',
    productionYears: '2015–2021',
    source: 'Mercedes-Benz USA 2018 AMG C 63 S sedan specifications (503 hp, 3,957 lb)',
  },
  'bmw-m8-competition': {
    drivetrain: 'AWD',
    engine: '4.4 L twin-turbo V8',
    productionYears: '2020–2025',
    source: 'BMW Group press release, M8 Competition Coupé technical data (625 PS, 1,885 kg DIN)',
  },
  'ferrari-812-competizione': {
    drivetrain: 'RWD',
    engine: '6.5 L V12',
    productionYears: '2021–2023',
    source: 'Ferrari press release, 812 Competizione (830 cv, 1,487 kg dry weight)',
  },
  'cadillac-escalade': {
    drivetrain: 'RWD',
    engine: '6.2L V8',
    productionYears: '2021–present',
    source:
      'Cadillac, 2021 Escalade specifications (6.2L V8 420 hp; 5,635 lb 2WD curb); 0–60 and limited top speed from period road tests',
  },
  'bmw-m3-competition': {
    drivetrain: 'RWD',
    engine: '3.0L twin-turbo I6',
    productionYears: '2021–present',
    source:
      'BMW of North America, The new 2021 BMW M3 Sedan and M4 Coupe press release (503 hp, 3,890 lb, 0–60 3.8 s, 155 mph limited)',
  },
  'rolls-royce-phantom': {
    drivetrain: 'RWD',
    engine: '6.75L twin-turbo V12',
    productionYears: '2017–present',
    source:
      'Rolls-Royce, Phantom technical specification (2017): 563 bhp, 2,560 kg unladen, 0–60 mph 5.1 s, 155 mph limited',
  },
  'aston-martin-db5': {
    drivetrain: 'RWD',
    engine: '4.0L I6',
    productionYears: '1963–1965',
    source:
      'Aston Martin, DB5 past models page (282 bhp at 5,500 rpm, 1,468 kg, 0–60 7.1 s, 142 mph)',
  },
  'dodge-charger-sxt': {
    drivetrain: 'RWD',
    engine: '3.6L Pentastar V6',
    productionYears: '2015–2023',
    source: 'Stellantis media, 2015 Dodge Charger specifications (SXT RWD)',
  },
  'ford-mustang-289': {
    drivetrain: 'RWD',
    engine: '289 cu in V8, 2-barrel',
    productionYears: '1967',
    source:
      'Ford, 1967 Mustang specifications (289 2V C-code, 200 hp SAE gross; V8 hardtop curb weight from period spec reprints)',
  },
  'chevrolet-camaro-ss-1le': {
    drivetrain: 'RWD',
    engine: '6.2L LT1 V8',
    productionYears: '2017–2024',
    source:
      'Chevrolet, 2021 Camaro SS specifications (1SS 6MT coupe; no separate 1LE curb weight is published)',
  },
  'ford-mustang-gt': {
    drivetrain: 'RWD',
    engine: '5.0L Coyote V8',
    productionYears: '2018–2023',
    source: 'Ford, Mustang GT Fastback specifications (6MT)',
  },
  'dodge-challenger-srt8': {
    drivetrain: 'RWD',
    engine: '6.1L HEMI V8',
    productionYears: '2008–2010',
    source: 'Dodge, 2008 Challenger SRT8 specifications',
  },
  'plymouth-hemi-cuda': {
    drivetrain: 'RWD',
    engine: '426 cu in HEMI V8',
    productionYears: '1970',
    source:
      'Chrysler, 1970 Plymouth Barracuda specifications (426 HEMI, 425 hp SAE gross); curb weight is the as-tested figure from period road tests, Chrysler published only shipping weight',
  },
  'chevrolet-corvette-z06-c6': {
    drivetrain: 'RWD',
    engine: '7.0L LS7 V8',
    productionYears: '2006–2013',
    source: 'Chevrolet, 2006 Corvette Z06 specifications',
  },
  'dodge-viper': {
    drivetrain: 'RWD',
    engine: '8.4L V10',
    productionYears: '2013–2017',
    source:
      'Stellantis media, 2013 SRT Viper specifications (base curb weight; 645 hp from the 2015 model year on)',
  },
  'dodge-challenger-srt-demon-170': {
    drivetrain: 'RWD',
    engine: '6.2L supercharged HEMI V8',
    productionYears: '2023',
    source:
      'Dodge, 2023 Challenger SRT Demon 170 specifications (1,025 hp on E85; curb weight on standard wheels)',
  },
  'chevrolet-corvette-zr1-c8': {
    drivetrain: 'RWD',
    engine: '5.5L twin-turbo LT7 V8',
    productionYears: '2025–present',
    source: 'Chevrolet Newsroom, 2025 Corvette ZR1 announcement (July 2024)',
  },
  'ford-mustang-1965-six': {
    drivetrain: 'RWD',
    engine: '3.3 L inline-6 (200 cu in)',
    productionYears: '1965–1966',
    source:
      'Ford 1965 Mustang specifications (120 hp gross, 2,445 lb base curb weight), via mustangattitude',
  },
  'ford-mustang-v6-2005': {
    drivetrain: 'RWD',
    engine: '4.0 L V6',
    productionYears: '2005–2010',
    source: 'Ford 2005 Mustang V6 specifications (210 hp, 3,300 lb)',
  },
  'dodge-challenger-sxt': {
    drivetrain: 'RWD',
    engine: '3.6 L V6',
    productionYears: '2015–2023',
    source: 'Dodge 2019 Challenger SXT specifications (305 hp, 3,894 lb), via Cars.com spec page',
  },
  'ford-mustang-mach-1': {
    drivetrain: 'RWD',
    engine: '5.0 L V8',
    productionYears: '2021–2023',
    source: 'Ford 2021 Mustang Mach 1 specifications (480 hp, 3,868 lb)',
  },
  'dodge-challenger-srt-hellcat': {
    drivetrain: 'RWD',
    engine: '6.2 L supercharged V8',
    productionYears: '2015–2023',
    source: 'Dodge 2019 Challenger SRT Hellcat specifications (717 hp, 4,449 lb)',
  },
  'ford-shelby-gt500-2020': {
    drivetrain: 'RWD',
    engine: '5.2 L supercharged V8',
    productionYears: '2020–2022',
    source: 'Ford 2020 Mustang Shelby GT500 specifications (760 hp, 4,171 lb)',
  },
  'chevrolet-corvette-zr1-c7': {
    drivetrain: 'RWD',
    engine: '6.2 L supercharged V8 (LT5)',
    productionYears: '2019',
    source: 'Chevrolet 2019 Corvette ZR1 specifications (755 hp, 3,560 lb)',
  },
  'pontiac-firebird-trans-am-1977': {
    drivetrain: 'RWD',
    engine: '400 cu in V8',
    productionYears: '1977',
    source:
      'Pontiac, 1977 Firebird specifications (W72 400 cu in V8, 200 hp SAE net); curb weight and 0–60 are as-tested figures from period road tests',
  },
  'dodge-charger-rt-1969': {
    drivetrain: 'RWD',
    engine: '440 cu in Magnum V8',
    productionYears: '1969',
    source:
      'Dodge, 1969 Charger specifications (440 Magnum, 375 hp SAE gross); curb weight is the as-tested figure from period road tests, Dodge published only shipping weight',
  },
  'chevrolet-corvette-stingray-c8': {
    drivetrain: 'RWD',
    engine: '6.2L LT2 V8',
    productionYears: '2020–present',
    source:
      'Chevrolet, 2020 Corvette Stingray specifications (490 hp; 3,535 lb coupe; 0–60 2.9 s with Z51)',
  },
  'dodge-charger-srt-hellcat': {
    drivetrain: 'RWD',
    engine: '6.2L supercharged HEMI V8',
    productionYears: '2015–2023',
    source:
      'Dodge, 2015 Charger specifications (SRT Hellcat: 707 hp SAE J2723 at 6,000 rpm; 4,575 lb curb)',
  },
  'honda-civic-si': {
    drivetrain: 'FWD',
    engine: '1.5L turbo I4',
    productionYears: '2022–present',
    source: 'Honda News, 2022 Civic Si specifications and features',
  },
  'acura-integra-type-r': {
    drivetrain: 'FWD',
    engine: '1.8L B18C5 I4',
    productionYears: '1997–1998, 2000–2001',
    source: 'Honda News, 1998 Acura Integra Type R specifications',
  },
  'nissan-altima': {
    drivetrain: 'FWD',
    engine: '2.5L I4',
    productionYears: '2019–present',
    source: 'Nissan News, 2019 Altima specifications (2.5 S FWD)',
  },
  'honda-s2000': {
    drivetrain: 'RWD',
    engine: '2.0L F20C I4',
    productionYears: '2000–2003',
    source: 'Honda News, 2001 S2000 specifications',
  },
  'mazda-rx-7': {
    drivetrain: 'RWD',
    engine: '1.3L twin-turbo 13B-REW rotary',
    productionYears: '1993–1995',
    source: 'Mazda, 1993 RX-7 US specifications (base 5MT)',
  },
  'nissan-gt-r': {
    drivetrain: 'AWD',
    engine: '3.8L twin-turbo VR38DETT V6',
    productionYears: '2017–2024',
    source: 'Nissan, 2017 GT-R Premium specifications',
  },
  'nissan-gt-r-nismo': {
    drivetrain: 'AWD',
    engine: '3.8L twin-turbo VR38DETT V6',
    productionYears: '2020–2024',
    source: 'Nissan, 2020 GT-R NISMO specifications',
  },
  'acura-nsx': {
    drivetrain: 'AWD',
    engine: '3.5L twin-turbo V6 hybrid',
    productionYears: '2017–2022',
    source: 'Acura, 2019 NSX specifications (combined system output; 2019–2022 curb weight)',
  },
  'mazda-mx-5-miata-nb': {
    drivetrain: 'RWD',
    engine: '1.8 L inline-4',
    productionYears: '1999–2000',
    source: 'Mazda 1999 MX-5 Miata specifications (140 bhp, 2,348 lb)',
  },
  'nissan-240sx-s14': {
    drivetrain: 'RWD',
    engine: '2.4 L inline-4 (KA24DE)',
    productionYears: '1995–1998',
    source: 'Nissan 1995 240SX specifications (155 hp, 2,800 lb)',
  },
  'toyota-celica-gt-s': {
    drivetrain: 'FWD',
    engine: '1.8 L inline-4 (2ZZ-GE)',
    productionYears: '2000–2005',
    source: 'Toyota 2000 Celica GT-S specifications (180 hp, 2,500 lb)',
  },
  'mitsubishi-lancer-evolution-ix': {
    drivetrain: 'AWD',
    engine: '2.0 L turbo inline-4 (4G63 MIVEC)',
    productionYears: '2006',
    source:
      'Mitsubishi Motors North America 2006 Lancer Evolution IX specifications (286 hp, 3,263 lb)',
  },
  'acura-nsx-na1': {
    drivetrain: 'RWD',
    engine: '3.0 L V6 (C30A VTEC)',
    productionYears: '1991–1996',
    source: 'Acura 1991 NSX specifications (270 hp, 3,010 lb manual)',
  },
  'honda-civic-type-r-fl5': {
    drivetrain: 'FWD',
    engine: '2.0 L turbo inline-4 (K20C1)',
    productionYears: '2023–present',
    source: 'Honda 2023 Civic Type R specifications (315 hp, 3,188 lb)',
  },
  'toyota-gr-supra-3-0': {
    drivetrain: 'RWD',
    engine: '3.0 L turbo inline-6',
    productionYears: '2021–present',
    source: 'Toyota 2021 GR Supra 3.0 specifications (382 hp, 3,400 lb)',
  },
  'acura-nsx-type-s': {
    drivetrain: 'AWD',
    engine: '3.5 L twin-turbo V6 hybrid',
    productionYears: '2022',
    source: 'Acura 2022 NSX Type S specifications (600 hp, 3,891 lb)',
  },
  'lexus-lfa': {
    drivetrain: 'RWD',
    engine: '4.8 L V10',
    productionYears: '2011–2012',
    source: 'Lexus LFA press kit (552 hp, 3,263 lb)',
  },
  'toyota-corolla-ae86': {
    drivetrain: 'RWD',
    engine: '1.6L 4A-GE I4',
    productionYears: '1985–1987',
    source: 'Toyota, 1985 Corolla GT-S specifications (112 hp at 6,600 rpm; 2,200 lb)',
  },
  'toyota-supra-turbo-a80': {
    drivetrain: 'RWD',
    engine: '3.0L twin-turbo 2JZ-GTE I6',
    productionYears: '1993–1998',
    source: 'Toyota, 1997 Supra Turbo specifications (320 hp; 3,415 lb 6MT; 155 mph limited)',
  },
  'nissan-skyline-gt-r-r34': {
    drivetrain: 'AWD',
    engine: '2.6L twin-turbo RB26DETT I6',
    productionYears: '1999–2002',
    source:
      'Nissan, Skyline GT-R (BNR34) specifications (280 PS at 6,800 rpm; 1,560 kg; 180 km/h limited in Japan, 155 mph delimited)',
  },
  'nissan-350z': {
    drivetrain: 'RWD',
    engine: '3.5L VQ35DE V6',
    productionYears: '2003–2008',
    source: 'Nissan, 2003 350Z specifications (287 hp at 6,200 rpm; 3,188 lb base coupe)',
  },
  'toyota-prius': {
    drivetrain: 'FWD',
    engine: '2.0L I4 hybrid',
    productionYears: '2023–present',
    source:
      'Toyota USA Newsroom, 2023 Prius release (194 hp combined); LE FWD curb weight from Toyota spec reprints',
  },
  'nissan-leaf': {
    drivetrain: 'FWD',
    engine: '110 kW electric motor, 40 kWh',
    productionYears: '2018–2025',
    source: 'Nissan News, 2018 Leaf press kit (110 kW motor; S curb weight 1,557 kg)',
  },
  'tesla-model-3-performance': {
    drivetrain: 'AWD',
    engine: 'Dual electric motors',
    productionYears: '2024–present',
    source: 'Tesla, 2024 Model 3 Performance specifications',
  },
  'hyundai-ioniq-5-n': {
    drivetrain: 'AWD',
    engine: 'Dual electric motors',
    productionYears: '2024–present',
    source: 'Hyundai News, 2025 Ioniq 5 N specifications (641 hp with N Grin Boost)',
  },
  'porsche-taycan-turbo-s': {
    drivetrain: 'AWD',
    engine: 'Dual electric motors',
    productionYears: '2020–2023',
    source:
      'Porsche Newsroom, Taycan Turbo S technical data (750 hp overboost with Launch Control; DIN 2,295 kg)',
  },
  'lucid-air-grand-touring': {
    drivetrain: 'AWD',
    engine: 'Dual electric motors',
    productionYears: '2022–present',
    source: 'Lucid Motors, 2025 Air Grand Touring technical specifications (20-inch wheels)',
  },
  'tesla-model-s-plaid': {
    drivetrain: 'AWD',
    engine: 'Tri electric motors',
    productionYears: '2021–present',
    source: 'Tesla, 2021 Model S Plaid specifications',
  },
  'rimac-nevera': {
    drivetrain: 'AWD',
    engine: 'Quad electric motors',
    productionYears: '2021–present',
    source:
      'Rimac Automobili, Nevera technical specifications (1,408 kW, which Rimac quotes as 1,914 hp in metric units; 2,300 kg)',
  },
  'volkswagen-id-4-pro': {
    drivetrain: 'RWD',
    engine: 'Single rear motor, 82 kWh battery',
    productionYears: '2021–2023',
    source: 'Volkswagen of America 2021 ID.4 Pro specifications (201 hp, 4,559 lb)',
  },
  'chevrolet-bolt-ev': {
    drivetrain: 'FWD',
    engine: 'Single front motor, 65 kWh battery',
    productionYears: '2017–2023',
    source: 'Chevrolet 2022 Bolt EV specifications (200 hp, 3,589 lb), via Cars.com spec page',
  },
  'ford-f-150-lightning': {
    drivetrain: '4WD',
    engine: 'Dual motors, standard-range battery',
    productionYears: '2022–present',
    source:
      'Ford 2022 F-150 Lightning Pro specifications (426 hp, 6,015 lb), via Cars.com spec page',
  },
  'volvo-c40-recharge-twin': {
    drivetrain: 'AWD',
    engine: 'Dual motors, 78 kWh battery',
    productionYears: '2022–2023',
    source: 'Volvo Car USA 2022 C40 Recharge Twin specifications (402 hp, 4,710 lb)',
  },
  'rivian-r1t': {
    drivetrain: 'AWD',
    engine: 'Dual motors, large pack',
    productionYears: '2022–present',
    source:
      'Rivian 2022 R1T Explore dual-motor specifications (600 hp, 6,585 lb), via Cars.com spec page',
  },
  'kia-ev6-gt': {
    drivetrain: 'AWD',
    engine: 'Dual motors, 77.4 kWh battery',
    productionYears: '2023–present',
    source: 'Kia America 2023 EV6 GT specifications (576 hp, 4,795 lb)',
  },
  'lotus-eletre-r': {
    drivetrain: 'AWD',
    engine: 'Dual motors, 112 kWh battery',
    productionYears: '2023–present',
    source: 'Lotus Eletre R technical specifications (905 hp, 2,690 kg kerb weight)',
  },
  'tesla-model-x-plaid': {
    drivetrain: 'AWD',
    engine: 'Tri-motor',
    productionYears: '2021–2026',
    source: 'Tesla Model X Plaid specifications (1,020 hp, 5,248 lb)',
  },
  'lucid-air-sapphire': {
    drivetrain: 'AWD',
    engine: 'Tri-motor',
    productionYears: '2023–present',
    source: 'Lucid Motors, Air Sapphire specifications (1,234 hp, 5,336 lb)',
  },
  'tesla-model-y': {
    drivetrain: 'AWD',
    engine: 'Dual electric motors',
    productionYears: '2020–present',
    source:
      'Tesla, Model Y Long Range AWD specifications (4,363 lb, 0–60 4.8 s, 135 mph); 384 hp combined is the figure MotorTrend reported from Tesla, which publishes no horsepower',
  },
  'tesla-cybertruck-cyberbeast': {
    drivetrain: 'AWD',
    engine: 'Tri electric motors',
    productionYears: '2023–present',
    source: 'Tesla, Cybertruck Cyberbeast specifications (845 hp, 6,843 lb, 0–60 2.6 s, 130 mph)',
  },
  'gmc-hummer-ev-pickup': {
    drivetrain: 'AWD',
    engine: 'Tri electric motors',
    productionYears: '2022–present',
    source:
      'GMC, 2022 Hummer EV Pickup Edition 1 specifications (1,000 hp, 9,063 lb, 0–60 about 3 s in Watts to Freedom mode)',
  },
  'ford-mustang-mach-e-gt': {
    drivetrain: 'AWD',
    engine: 'Dual electric motors',
    productionYears: '2021–present',
    source:
      'Ford, 2021 Mustang Mach-E technical specifications (GT eAWD: 480 hp, 4,997 lb, 0–60 3.8 s, 124 mph)',
  },
  'jeep-wrangler-rubicon': {
    drivetrain: '4WD',
    engine: '3.6L Pentastar V6',
    productionYears: '2018–present',
    source:
      'Stellantis media, 2018 Jeep Wrangler specifications (Unlimited Rubicon 3.6L, 6MT base weight)',
  },
  'toyota-tacoma-trd': {
    drivetrain: '4WD',
    engine: '3.5L V6',
    productionYears: '2016–2023',
    source:
      'Toyota USA Newsroom, 2020 Tacoma release (278 hp); TRD Off-Road Double Cab 4x4 V6 curb weight from Toyota spec reprints',
  },
  'ford-f-150-raptor': {
    drivetrain: '4WD',
    engine: '3.5L twin-turbo EcoBoost V6',
    productionYears: '2021–present',
    source:
      'Ford Media, 2024 Raptor and Raptor R tech specs (450 hp); curb weight on 35-inch tires per Ford',
  },
  'subaru-wrx-sti': {
    drivetrain: 'AWD',
    engine: '2.5L turbo EJ257 flat-4',
    productionYears: '2015–2021',
    source: 'Subaru U.S. Media Center, 2020 WRX STI specifications (310 hp from 2019; base 6MT)',
  },
  'ford-f-150-raptor-r': {
    drivetrain: '4WD',
    engine: '5.2L supercharged V8',
    productionYears: '2023–present',
    source: 'Ford Media, 2024 Raptor and Raptor R tech specs (720 hp); curb weight per Ford',
  },
  'ram-1500-trx': {
    drivetrain: '4WD',
    engine: '6.2L supercharged HEMI V8',
    productionYears: '2021–2024',
    source: 'Stellantis media, 2021 Ram 1500 TRX specifications',
  },
  'lamborghini-urus': {
    drivetrain: 'AWD',
    engine: '4.0L twin-turbo V8',
    productionYears: '2018–2022',
    source:
      'Lamborghini media center, Urus launch release (650 CV; 3.38 kg/CV gives the 2,200 kg dry weight)',
  },
  'toyota-4runner-sr5': {
    drivetrain: 'RWD',
    engine: '4.0 L V6',
    productionYears: '2010–2024',
    source: 'Toyota 2023 4Runner SR5 specifications (270 hp, 4,400 lb), via Cars.com spec page',
  },
  'toyota-land-cruiser-2024': {
    drivetrain: '4WD',
    engine: '2.4 L turbo inline-4 hybrid (i-Force Max)',
    productionYears: '2024–present',
    source:
      'Toyota 2024 Land Cruiser 1958 specifications (326 hp, 5,038 lb), via Cars.com spec page',
  },
  'ford-ranger-raptor': {
    drivetrain: '4WD',
    engine: '3.0 L twin-turbo V6',
    productionYears: '2024–present',
    source: 'Ford 2024 Ranger Raptor specifications (405 hp, 5,325 lb)',
  },
  'mercedes-amg-g-63': {
    drivetrain: 'AWD',
    engine: '4.0 L twin-turbo V8',
    productionYears: '2019–present',
    source:
      'Mercedes-Benz USA 2021 AMG G 63 specifications (577 hp, 5,842 lb), via Cars.com spec page',
  },
  'bmw-x5-m': {
    drivetrain: 'AWD',
    engine: '4.4 L twin-turbo V8',
    productionYears: '2020–2023',
    source: 'BMW USA 2023 X5 M specifications (600 hp, 5,455 lb), via Cars.com spec page',
  },
  'dodge-durango-srt-hellcat': {
    drivetrain: 'AWD',
    engine: '6.2 L supercharged V8',
    productionYears: '2021–present',
    source: 'Dodge 2021 Durango SRT Hellcat specifications (710 hp, 5,710 lb)',
  },
  'jeep-grand-cherokee-trackhawk': {
    drivetrain: 'AWD',
    engine: '6.2 L supercharged V8',
    productionYears: '2018–2021',
    source:
      'FCA North America press release, 2018 Jeep Grand Cherokee Trackhawk specifications (707 hp, 5,363 lb)',
  },
  'aston-martin-dbx707': {
    drivetrain: 'AWD',
    engine: '4.0 L twin-turbo V8',
    productionYears: '2022–present',
    source: 'Aston Martin DBX707 technical specifications (707 PS, 2,245 kg)',
  },
  'ferrari-purosangue': {
    drivetrain: 'AWD',
    engine: '6.5 L V12',
    productionYears: '2023–present',
    source: 'Ferrari Purosangue specifications (725 cv); Road & Track, 2023, 2,170 kg kerb weight',
  },
  'lamborghini-urus-se': {
    drivetrain: 'AWD',
    engine: '4.0 L twin-turbo V8 plug-in hybrid',
    productionYears: '2024–present',
    source: 'Lamborghini Urus SE technical data (800 CV combined, 2,505 kg kerb weight)',
  },
  'ford-bronco-wildtrak': {
    drivetrain: '4WD',
    engine: '2.7L EcoBoost V6',
    productionYears: '2021–present',
    source:
      'Ford, 2021 Bronco specifications (2.7L EcoBoost 330 hp on premium fuel; four-door Wildtrak curb weight 4,850 lb); 0–60 from period road tests',
  },
  'land-rover-defender-110': {
    drivetrain: '4WD',
    engine: '3.0L turbo I6 mild hybrid',
    productionYears: '2020–present',
    source:
      'Land Rover, Defender 110 P400 specifications (395 hp; 2,343 kg EU kerb; 0–60 5.7 s; 119 mph)',
  },
  'ford-f-150-xlt': {
    drivetrain: 'RWD',
    engine: '5.0L V8',
    productionYears: '2021–present',
    source:
      'Ford, 2021 F-150 specifications (5.0L V8 400 hp; SuperCrew 4x2 curb weight 4,705 lb); 0–60 and limited top speed from period road tests',
  },
  'range-rover-p530': {
    drivetrain: 'AWD',
    engine: '4.4L twin-turbo V8',
    productionYears: '2022–2023',
    source:
      'Land Rover, Range Rover P530 specifications (523 hp; 2,585 kg EU kerb; 0–60 4.4 s; 155 mph limited)',
  },
}

/** The detail for a car id, matching `getCar`. Every car in the roster has one. */
export function getCarDetail(id: string): CarDetail {
  const detail = CAR_DETAILS[id]
  if (!detail) throw new Error(`Unknown car id: ${id}`)
  return detail
}
