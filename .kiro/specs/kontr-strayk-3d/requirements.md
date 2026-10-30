# Talablar: KONTR-STRAYK 3D

Birinchi shaxs (FPS) o'yini: botlar bilan yakka o'yin va onlayn multiplayer. Three.js (client) va Node.js + ws (server).

## A. Umumiy
- A1. O'yin brauzerda ishlaydi, tashqi rasm/ovoz/model fayllari yo'q: hamma narsa kod bilan yaratiladi.
- A2. Interfeys matnlari faqat o'zbek tilida (lotin), kod va izohlar ingliz tilida.
- A3. Ikki rejim: yakka (botlar bilan) va onlayn (xona kodi orqali).

## B. Boshqaruv
- B1. WASD harakat, sichqoncha qarash, o'ng tugma (RMB) nishonlash.
- B2. R qayta o'qlash, E harakat (bomba o'rnatish/zararsizlantirish), B xarid menyusi.
- B3. 1-4 qurol tanlash, Space sakrash, Ctrl cho'kkalash, Shift sekin yurish.
- B4. G qurol tashlash, T chat, TAB hisob jadvali, ESC pauza, M ovozni o'chirish.

## C. Raund tizimi
- C1. Holatlar: xarid, jang, raund oxiri, o'yin oxiri.
- C2. Ikki jamoa: hujumchilar va himoyachilar. Bomba o'rnatish yoki barcha dushmanni yo'q qilish orqali g'alaba.
- C3. Yarim vaqtda jamoalar almashadi.

## D. Iqtisod
- D1. Boshlang'ich pul, o'ldirish uchun mukofot (qurolga qarab), raund g'alabasi/mag'lubiyati bonuslari, maksimal pul chegarasi.
- D2. Xarid faqat xarid bosqichida.

## E. Qurollar
- E1. Pichoq, to'pponcha, avtomat, snayper. Har birida zarar, otish tezligi, o'q-dori, qayta o'qlash vaqti, tarqalish, narx.
- E2. Boshga o'q zarari ko'paytiriladi; zirh zararni kamaytiradi.

## F. Bomba
- F1. O'rnatish vaqti, portlash taymeri, zararsizlantirish vaqti, o'rnatish zonalari (A va B).

## G. Xarita
- G1. Bitta xarita: ikki baza, markaziy yo'lak, ikki bomba zonasi, to'siqlar (AABB).
- G2. Yo'l nuqtalari grafi botlar uchun.

## H. Botlar
- H1. Holatlar mashinasi: patrul, jang, qidirish, bomba o'rnatish/zararsizlantirish, chekinish.
- H2. Qiyinlik darajalari: aniqlik va reaksiya vaqti farqi.

## I. Onlayn
- I1. Server avtoritar, 30 Hz tick, WebSocket protokoli.
- I2. Client prognozi, server bilan solishtirish (reconciliation), boshqa o'yinchilar interpolyatsiyasi.
- I3. Xona yaratish/qo'shilish, chat, kutish zali.

## J. Interfeys
- J1. HUD: sog'liq, zirh, o'q-dori, pul, raund taymeri, nishon belgisi, o'ldirishlar lentasi, mini-xarita.
- J2. Bosh menyu, sozlamalar, xarid menyusi, hisob jadvali, pauza menyusi.

## K. Audio va effektlar
- K1. Barcha ovozlar Web Audio orqali sintezlanadi.
- K2. Zarralar, qon/uchqun effektlari, qurol animatsiyasi kod bilan.

## L. Sifat
- L1. `npm run lint`, `npm test`, `npm run build` har bir vazifadan keyin o'tishi shart.
- L2. Deterministik mantiq `shared` paketida, Vitest testlari bilan.
- L3. CI: GitHub Actions (lint, test, build).
