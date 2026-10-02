# İz Peşinde

Three.js ile tarayıcıda çalışan, tek oyunculu, izometrik bir **ortaçağ gizli kimlik** oyunu. Karaağaç kasabasında
10 yarışmacı (sen + 9 bot) ve 170 kasabalı dolaşır. Her tur rolünü seçersin: **suçlu** kalabalığa karışıp süre bitene
kadar yakalanmamaya, **dedektif** izleri okuyup şüpheliyi işaretlemeye, **savcı** izlerin ve işaretlerin peşinden
doğru kişiyi yakalamaya çalışır. Beş turun sonunda en yüksek kişisel skor kazanır.

Kuralların tamamı ve gerekçeleri: [DEDEKTIF_OYUNU_TASARIM.md](DEDEKTIF_OYUNU_TASARIM.md). Görsel dil ve kod düzeni
[Çayır Muhafızı](https://github.com/JosephUz/cayirmuhafizi) ile aynıdır.

**Kaynak**: https://github.com/JosephUz/izpesinde

## Başlatma

`Baslat.cmd` dosyasına çift tıklayın: ilk açılışta `npm install` çalışır, oyun tarayıcıda açılır.
Alternatif: bu klasörde `npm install` ve `npm start`, ardından http://127.0.0.1:5197.
Node.js gerekir; ilk kurulumdan sonra internet bağlantısı gerekmez. Port için PowerShell'de `$env:PORT=5198; npm start`.

**Docker ile (compose)**: `docker compose up -d --build`; oyun http://localhost:5197 adresinde, yalnızca bu bilgisayara
açık (`127.0.0.1`). Oyun tek oyunculu olduğu için tünel ve oyun sunucusu yoktur. Kaynak değişince yine `--build` yeter.
Konteyner açıkken `Baslat.cmd` ikinci bir sunucu açmaz, çalışanı bulup tarayıcıyı ona açar.
Sunucu oyun dosyalarını `no-store` ile verir; `/health` yanıtı ayakta olan yapının damgasını içerir.

**Web yayını**: `npm run deploy:web` dosyaları `dist/` klasörüne toplayıp Cloudflare Worker'a
(`izpesinde.josephuz.com`, bkz. `wrangler.jsonc`) gönderir.

## Bir tur

1. **Rol seçimi**: üç karttan birini seç. Botlar kalan rolleri paylaşır; her tur 2 suçlu, 6 dedektif, 2 savcı vardır.
2. Suç zaten işlenmiştir; tur 6 dakikalık geri sayımla ilerler. Yarışmacılar haritanın farklı yerlerinde başlar.
3. Herkes yalnızca çevresindeki daireyi görür; dışı kararır. Küçük haritada ise herkes aynı renkte nokta olarak
   görünür: kim olduğu belli değildir ama tenhaya sapan biri fark edilir. Biri (oyuncu, bot ya da kasabalı) bir evin, tezgâhın ya da
   ağacın arkasına geçince o nesne saydamlaşır.
4. Suçlular arkalarında 2 saniyelik izler bırakır: dedektif izini yalnızca dedektifler, savcı izini yalnızca savcılar
   görür; ikisi de suçlunun birkaç saniye önceki yerine düşer. Düşen izin üstünde zıplayan bir ok belirir. İz aralığı
   ve gecikmesi birlikte kısalır: 5 → 4 → 3 sn, son dakikada 2 sn.
5. Dedektif şüpheliyi sol tıkla işaretler (3 hak); işaretin yaklaşık bölgesi savcıların haritasına düşer; işaret bir suçlunun üstündeyse
   herkes görür, diğer dedektifler de o suçluya odaklanır. Savcı doğru
   kişiyi sol tıkla yakalar (3 hak). İşaretlenen suçlunun ekran kenarı kızarır; sol tıkla birinin kılığına girerse
   (−1) işaret kalkar.
6. Tur biter: iki suçlu yakalanırsa kanun kazanır. Süre dolarsa, iki savcı da ölürse ya da kanunun hakları tükenirse
   suçlular kazanır.

## Tuşlar

| Girdi | Eylem |
| --- | --- |
| WASD | Kamera yönüne göre yürü |
| Shift | Koş |
| Space, havadayken tekrar | Zıpla, çift zıpla |
| Sağ tık | Atıl |
| Sol tık | İmlecin altındaki kişi: dedektif işaretler, savcı yakalar, suçlu kılığına girer |
| E | Yakındaki kutuyu al / bırak |
| F | İş noktasında çalış |
| Q | Suçlu: ortak öldürme hakkı (turda 2) |
| M | Küçük haritayı büyüt / küçült |
| Tab | Basılı: skor; elenince: izlenen takım arkadaşını değiştir |
| Esc | Duraklat / devam |

Ses sağ üstteki düğmeden açılır (başlangıçta kapalı).

## Puanlar

| Olay | Puan |
| --- | --- |
| Kanun kazanır | Her dedektif ve savcı +1 |
| Suçlular kazanır | Serbest kalan her suçlu +5 |
| Serbest geçen her tam dakika | Suçluya +1, kazansa da kaybetse de |
| Doğru yakalama | Savcıya +1, o kişide aktif işareti olan dedektife +1 |
| Yanlış yakalama / suçlu olmayanı işaretleme | −1 (yanlış işaret tur sonunda yazılır) |
| Kılık değiştirme | −1 |
| NPC / dedektif / savcı öldürme | −1 / +1 / +2 |

## Testler

`npm test`: önce başsız kural testleri (`tests/rules-smoke.mjs`: rol dağıtımı ve seçimi, iz takvimi ve iki iz türü,
işaret ve yakalama, hak tükenmesi, kılık, cinayet ve iki savcının ölümü, puanlar, kutu, zıplama/iniş, izleyici, beş
turluk otomatik maç), sonra sunucuyu boş bir portta açıp başsız Chromium ile duman testi (`tests/browser-smoke.mjs`:
menü, rol seçimi, hareket, görüş sisi, duraklatma, gerçek sol tıkla işaret / yakalama / kılık, kenar uyarısı, kutu,
sabit nesne saydamlığı, iz oku, skor tablosu, küçük ekran, beş tur geçişi). Playwright bu depoya kurulmaz; komşu depolardaki kurulum
bulunur (bkz. `scripts/test.mjs`). Ekran görüntüleri `artifacts/` altına yazılır.

## Dosyalar

Simülasyon ile görünüm ayrıdır: `src/world.js` ve ona bağlı modüller DOM ve çizim olmadan (Node'da da) koşar; tek
yetkili adımda bütün kurallar işler. İstemci modülleri dünyayı yalnızca okur, oyuncu eylemlerini girdi olarak verir.

| Dosya | Sorumluluk |
| --- | --- |
| `index.html`, `style.css` | Tam ekran düzen: sahne, HUD, rol kartı, harita, eylem çubuğu, ekranlar |
| `game.js` | Giriş; `src/main.js`'i yükler (import map: `three` → `/vendor/three.module.js`) |
| `src/config.js` | Tüm ayar sayıları: tur, hız, görüş, iz takvimi, haklar, puanlar, zorluk, kamera, saydamlık |
| `src/world.js` | **Simülasyon**: dünya, tur kurulumu (oyuncunun seçtiği rol + rastgele kalan roller), sabit adım, sol tık eylemi, izleyici |
| `src/marks.js` | Dedektif işareti, savcı yakalaması, işaret görünürlüğü ve haritadaki daire, hak tükenmesi bitişleri |
| `src/criminal.js` | Suçlu eylemleri: kılık değiştirme, ortak cinayet hakkı |
| `src/traces.js` | İz kaydı, zaman takvimine göre iki tür iz, bot dedektif / savcıların iz algısı |
| `src/crowd.js` | Hareket, zıplama, atılma, kutu taşıma, çalışma, kasabalı rutinleri ve rota izleme |
| `src/ai.js` | Bot kararları: dedektif (şüphe, takip, işaret), savcı (daire, iz, yakalama), suçlu (kalabalık, kılık, cinayet) |
| `src/score.js` | Tur sonu ve puan toplama |
| `src/roster.js` | Kadro yardımcıları: yarışmacılar, oyunda mı, görüş, en yakın, olay günlüğü |
| `src/physics.js` | Çarpışma, görüş hattı, güvenli iniş, ızgara + ikili yığınla A* yol bulma |
| `src/environment.js` | Kasaba verisi (bölgeler, binalar, ağaçlar, iş noktaları, kutular) ve 3B kurulumu |
| `src/rng.js` | Tohumlu rastgelelik |
| `src/main.js` | **İstemci**: sahne, kamera, ışık, oyun akışı (menü → rol seçimi → tur → sonuç), çizim döngüsü, test kancası |
| `src/screens.js` | Rol seçimi, tur girişi, kontroller, duraklatma, tur / maç sonu, skor tablosu |
| `src/ui.js` | HUD, olay günlüğü, bağlam ipucu, eylem çubuğu, dünya etiketleri, savcı okları, kenar uyarısı, ses |
| `src/input.js` | Klavye / fare, imleçle hedef seçme |
| `src/minimap.js` | Üstten 2B harita: kasaba, herkesin konumu (kimliksiz nokta), işaret daireleri, görüş çemberi |
| `src/characters.js` | Kutu karakterler, instancing ile toplu çizim, ayak halkaları, imleç hedefi |
| `src/fog.js` | Görüş sisi (three'nin sis parçaları karakter çevresi uzaklığına göre yeniden yazılır) |
| `src/view/` | Mesh takımı ve birleştirme (`meshes.js`), iz, iz oku ve olay efektleri (`effects.js`), kutular (`itemview.js`), arkasına biri geçen sabit nesnenin saydamlığı (`seethrough.js`) |
| `scripts/test.mjs`, `scripts/build-web.mjs` | Test koşturucusu; web yayını için `dist/` |
| `Dockerfile`, `compose.yaml`, `.dockerignore` | Konteyner: tek imaj, sağlık denetimi, yalnızca bu bilgisayara açık port |
| `server.mjs` | Statik dosyalar, three /vendor/ altından, `no-store`, `/health` |

## Sınırlar

Çok oyunculu, kayıtlı maç ve dokunmatik kontrol yoktur. Görüş alanı çiziminde binalar görüşü kesmez (botların algısında
görüş hattı vardır). Bot dengesi ilk ayardadır; otomatik maçlarda kanun 20 turun 9’unu kazanıyor, yakalamalar çoğunlukla 1,5–5. dakikada geliyor. Oynanışa
göre `LEVELS` ve `CFG.trace` değerleri ayarlanmalıdır.
