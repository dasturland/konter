# KONTR-STRAYK 3D

Professional birinchi shaxs (FPS) o'yini: botlar bilan yakka o'yin va onlayn multiplayer. Brauzerda ishlaydi, Three.js (client) va Node.js + ws (server) asosida. Tashqi rasm, ovoz yoki model fayllari yo'q: hamma narsa kod bilan yaratiladi.

## Skrinshot

_Skrinshot uchun joy: `docs/screenshot.png` faylini qo'shing va shu yerga ulang._

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
| E | Harakat (bomba o'rnatish / zararsizlantirish) |
| B | Xarid menyusi |
| 1-4 | Qurol tanlash |
| Space | Sakrash |
| Ctrl | Cho'kkalash |
| Shift | Sekin yurish |
| G | Qurolni tashlash |
| T | Chat |
| TAB | Hisob jadvali |
| ESC | Pauza / menyu |
| M | Ovozni o'chirish/yoqish |

## Onlayn o'ynash yo'riqnomasi

1. Serverni ishga tushiring: `npm start`.
2. O'yinda "Onlayn" ni tanlang va xona yarating yoki xona kodi bilan qo'shiling.

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
