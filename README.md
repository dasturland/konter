# KONTR-STRAYK 3D

Professional birinchi shaxs (FPS) o'yini: botlar bilan yakka o'yin va onlayn multiplayer. Brauzerda ishlaydi, Three.js (client) va Node.js + ws (server) asosida. Tashqi rasm, ovoz yoki model fayllari yo'q: hamma narsa kod bilan yaratiladi.

## O'yin haqida

- **Asosiy menyu**: sekin aylanuvchi bunker kamerasi ustida sovuq neon sarlavha va tugmalar: YAKKAXON, XONA YARATISH, XONAGA QO'SHILISH, SOZLAMALAR.
- **HUD**: chap tepada sog'liq va zirh, markazda "Dushmanlar: 4 / 5", raund taymeri va hisob ("CT 3 — 2 T"), o'ngda o'q-dori va PAUZA tugmasi, pastda pul, o'ng tomonda o'ldirishlar lentasi, chap pastda mini-xarita. Bomba o'rnatilganda qizil taymer ko'rinadi.
- **Xarid menyusi** (B): toifalar bo'yicha, pul yetmasa narx qizil bo'ladi, xaridda kassa ovozi eshitiladi.
- **Onlayn**: xona kodi (5 belgi), ulashish havolasi, kutish zali (jamoa, tayyorlik, ping, chat), xona egasi uchun bot va qiyinlik boshqaruvi.
- **Audio**: hamma ovoz Web Audio bilan sintezlanadi: har bir qurol, qadam (temir panjarada jaranglaydi), bomba signali (oxirgi 10 soniyada tezlashadi), portlash, 3D joylashuv, devor orqasida past chastotali filtr va bunker aks-sadosi.

## O'rnatish

Talab: Node.js 20 yoki yangi.

```bash
git clone https://github.com/dasturland/konter.git
cd konter
npm install
```

Eslatma: `package-lock.json` hozircha repozitoriyda yo'q (generatsiya qilish imkoni bo'lmadi), shuning uchun CI `npm install` ishlatadi. Lock fayl qo'shilgach CI avtomatik `npm ci` ga o'tadi.

## Ishga tushirish

```bash
npm run dev     # client (Vite, 5173) va server (3000) birga, rivojlanish rejimi
npm start       # client'ni yig'adi va serverni ishga tushiradi (http://localhost:3000)
npm run lint    # ESLint
npm test        # Vitest
npm run build   # client/dist
```

Server porti `PORT` muhit o'zgaruvchisi orqali o'rnatiladi (standart: 3000):

```bash
PORT=8080 npm start
```

## Boshqaruv

| Tugma | Amal |
|---|---|
| W A S D | Harakat |
| Sichqoncha | Atrofga qarash, chap tugma otish |
| O'ng tugma (RMB) | Nishonga olish |
| R | Qayta o'qlash |
| E | Bomba o'rnatish / zararsizlantirish (ushlab turing), qurolni yerdan olish |
| B | Xarid menyusi |
| 1, 2, 3 | Asosiy qurol, to'pponcha, pichoq |
| 4, 5, 6 | Tutun, yorug'lik, portlovchi granata tashlash |
| Space | Sakrash |
| Shift | Sekin yurish |
| G | Portlovchi granata tashlash |
| T | Chat (onlayn) |
| TAB (ushlab turing) | Hisob jadvali: O'ldirish / O'lim / Pul / Ping |
| ESC | Pauza / menyu |
| ← → | O'lgandan keyin jamoadoshni kuzatishni almashtirish |
| M | Ovozni o'chirish/yoqish |

## Onlayn o'ynash yo'riqnomasi

1. Serverni ishga tushiring: `npm start`.
2. Asosiy menyuda "XONA YARATISH" ni tanlang, ismingizni kiriting. Ekranda 5 belgili kod va ulashish havolasi paydo bo'ladi (nusxalash tugmalari bilan).
3. Do'stlar "XONAGA QO'SHILISH" orqali kodni kiritadi yoki havolani (`?room=KOD`) ochadi. Xonada eng ko'pi bilan 10 o'yinchi bo'lishi mumkin.
4. Kutish zalida jamoani tanlang yoki avto-balansni bosing, "TAYYORMAN" ni bosing. Xona egasi bot qo'shadi, qiyinlikni tanlaydi, o'yinchini haydaydi va "O'YINNI BOSHLASH" ni bosadi.
5. Ulanish uzilsa client o'zi qayta ulanishga urinadi va ekranda o'zbekcha xabar ko'rsatadi.

### Xavfsizlik
- Ochiq internetda serverni faqat TLS (`https`/`wss`) ortida ishlating (ngrok, Railway yoki reverse proxy). Oddiy `http` orqali sessiya tokeni ochiq holda uzatiladi, shuning uchun uni faqat LAN uchun ishlating.
- Brauzer `Origin` sarlavhasi `Host` bilan mos kelishi shart. Boshqa manzillarga ruxsat berish uchun `ALLOWED_ORIGINS` (vergul bilan ajratilgan) o'zgaruvchisini bering.
- Server proksi ortida bo'lsa, haqiqiy IP manzil uchun `TRUST_PROXY=1` qo'ying.
- Chegaralar: jami 1000 ulanish, bitta IP dan 8 ulanish va 2 xona. Haydalgan o'yinchi shu IP dan xonaga qayta qo'shila olmaydi.

### Lokal tarmoq (LAN)
1. Kompyuteringizning lokal IP manzilini aniqlang (masalan `192.168.1.20`).
2. Server ishlayotgan kompyuterda `npm start` bajaring (server `0.0.0.0` da tinglaydi).
3. Boshqa qurilmalarda brauzerda `http://192.168.1.20:3000` ni oching. Kerak bo'lsa xavfsizlik devorida 3000 portni oching.

### ngrok
1. `npm start` bilan serverni ishga tushiring.
2. Boshqa terminalda: `ngrok http 3000`.
3. ngrok bergan `https://...` manzilni do'stlarga yuboring. WebSocket avtomatik `wss://` ga o'tadi.

### Render
1. Repozitoriyni Render'da "Web Service" sifatida ulang.
2. Build command: `npm install && npm run build`. Start command: `npm start`.
3. Render `PORT` ni o'zi beradi; server uni avtomatik o'qiydi.

### Railway
1. Railway'da "Deploy from GitHub repo" ni tanlang.
2. Start command: `npm start`. `PORT` ni Railway beradi.
3. "Generate Domain" bilan ochiq manzil oling.

## Struktura

```
client/   Vite + three: render, kiritish, UI, audio, tarmoq
server/   Node.js + ws: avtoritar simulyatsiya, xonalar, statik fayllar
shared/   DOM-siz umumiy mantiq (qurollar, iqtisod, raund, xarita, botlar, protokol)
.kiro/    Loyiha qoidalari va spetsifikatsiya
```

## Litsenziya

MIT, [LICENSE](LICENSE) faylga qarang.
