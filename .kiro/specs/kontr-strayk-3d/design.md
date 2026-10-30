# Dizayn: KONTR-STRAYK 3D

## 1. Arxitektura
npm workspaces: `@konter/shared`, `@konter/server`, `@konter/client`.

- `shared/src`: DOM-siz deterministik mantiq (constants, weapons, economy, round, bomb, damage, map, waypoints, collision, bots, protocol, sim). Server ham, yakka rejimdagi client ham aynan shu simulyatsiyadan foydalanadi (yagona haqiqat manbai).
- `server/src`: Node.js + ws. Avtoritar simulyatsiya, xonalar, validatsiya, `client/dist` ni statik uzatish.
- `client/src`: three bilan render, kiritish, Web Audio sintezi, DOM/CSS UI, tarmoq (prognoz, interpolyatsiya, reconciliation).

## 2. Simulyatsiya va tick
- Qat'iy qadam: 30 Hz (dt = 1/30 s). Yakka rejimda client simulyatsiyani brauzerda aylantiradi; onlayn rejimda server.
- Kirish buyruqlari (input command) ketma-ket raqamlanadi: `seq`, harakat tugmalari, yaw/pitch, harakatlar.

## 3. Protokol (JSON, WebSocket)
Client -> server: `join`, `input`, `chat`, `buy`, `ready`, `leave`, `host` (bot qo'shish/olib tashlash, qiyinlik, haydash, boshlash), `team` (CT, T yoki auto), `ping` (client o'lchagan RTT, ms).
Server -> client: `welcome`, `snapshot` (o'yinchilar pinglari bilan), `event` (kill, bomb, round, fx), `chat`, `lobby`, `error`.
Har bir xabar `{ t: "<tur>", ... }` shaklida; server `validation.js` da tur, maydon turlari va chegaralarni tekshiradi, noto'g'ri xabarlar tashlab yuboriladi. Kirish tezligi cheklanadi.

## 4. Prognoz va reconciliation
- Client o'z harakatini darhol qo'llaydi va tasdiqlanmagan buyruqlarni saqlaydi.
- Snapshot kelganda server holati olinadi, `lastProcessedSeq` gacha bo'lgan buyruqlar o'chiriladi, qolganlari qayta qo'llanadi.
- Boshqa o'yinchilar ~100 ms orqada interpolyatsiya qilinadi (`client/src/net/interpolation.js`).
- Prognoz serverdagi `movePlayer` bilan bir xil kod ishlatadi (`client/src/net/prediction.js`); kichik xatolar ko'rinadigan tarzda silliq tuzatiladi, 3 m dan katta xato darhol to'g'rilanadi.
- Ulanish uzilsa client saqlangan token bilan 8 martagacha qayta ulanishga urinadi (kutish 0.7 s dan 5 s gacha o'sadi), server esa o'yinchi o'rnini 15 s botga beradi.
- O'yinchi o'lganda jamoadoshini kuzatadi (← → almashtiradi).

## 5. Xarita
Simmetrik xarita: janubda himoyachi bazasi, shimolda hujumchi bazasi, o'rtada markaziy yo'lak, g'arbda A zonasi, sharqda B zonasi. Barcha to'siqlar AABB; harakat AABB-silindr to'qnashuvi bilan hal qilinadi. Yo'l nuqtalari grafi (tugunlar + qirralar) bazalar, yo'laklar va zonalarni bog'laydi; botlar A* bilan yo'l topadi.

## 6. Qurollar jadvali
| Qurol | Zarar | Tezlik (o'q/s) | Magazin | Qayta o'qlash (s) | Narx |
|---|---|---|---|---|---|
| Pichoq | 40 | 1.5 | - | - | 0 |
| To'pponcha | 25 | 6 | 12 | 1.6 | 200 |
| Avtomat | 30 | 10 | 30 | 2.4 | 2700 |
| Snayper | 115 | 0.8 | 5 | 3.5 | 4750 |

Boshga o'q: x4 (snayperda x2). Zirh zararning 50% ini yutadi va o'zi kamayadi.

## 7. Iqtisod va raund
Boshlang'ich pul 800, o'ldirish mukofoti 300 (pichoq 1500), g'alaba 3250, mag'lubiyat 1400 (+500 ketma-ket yutqazish uchun), maksimum 16000. Raund: xarid 10 s, jang 115 s, bomba 40 s, raund oxiri 5 s; 15 raund, yarim vaqtda almashish.

## 8. Bot holatlar mashinasi (FSM)
`PATROL -> ENGAGE` (dushman ko'rinsa), `ENGAGE -> SEARCH` (ko'rish yo'qolsa), `SEARCH -> PATROL` (taymer tugasa), `* -> PLANT` (hujumchi, bombasi bor), `* -> DEFUSE` (himoyachi, bomba o'rnatilgan), `ENGAGE -> RETREAT` (sog'liq past). Qiyinlik: reaksiya vaqti va aniqlik.

## 9. Audio
`client/src/audio`: faqat Web Audio sintezi (fayllar yo'q). `engine.js` master zanjir, generatsiya qilingan impuls javobli konvolyutsiya reverb (bunker), doimiy fon g'uvillashi va PannerNode orqali 3D joylashuvni beradi. Devor orqasidagi tovushlar `hasLineOfSight` bo'yicha past chastotali filtrdan o'tadi. `sounds.js` har bir tovush retseptini (har bir qurol, qadam, temir panjarada jaranglash, bomba signali va h.k.) saqlaydi. M tugmasi ovozni o'chiradi; balandlik sozlamalarda.

## 10. UI
`client/src/ui`: DOM/CSS, barcha matn o'zbek tilida. `app.js` menyu, lobbi, HUD, xarid menyusi va o'yin sessiyasini boshqaradi. Asosiy menyu aylanuvchi bunker kamerasi ustida ko'rsatiladi. Ranglar: fon #0f1226, CT #3aa0ff, T #ff9f1c, urg'u #2ee27a.
