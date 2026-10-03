# İz Peşinde — Tasarım Belgesi

Bu belge oyunun kurallarının tek kaynağıdır. Sayısal değerlerin hepsi `src/config.js` içindedir; burada yazanlar başlangıç değerleridir.

## 1. Amaç ve kapsam

Büyük bir ortaçağ kasabasında geçen; kalabalığa karışma, iz sürme, takip ve kılık değiştirme üzerine kurulu bir gizli kimlik oyunu. Tek başına (botlara karşı) ya da çevrim içi odada arkadaşlarla oynanır.

- 10 yarışmacı: tek başına oyunda 1 insan + 9 bot, çevrim içi odada en çok 10 insan (boş koltuklarda bot). Bunların dışında 170 sıradan kasabalı (NPC) gündelik işler yapar.
- Maç 5 turdur. Her tur **2 suçlu, 6 dedektif, 2 savcı** vardır.
- **Tek başına oyunda oyuncu rolünü her turun başında kendisi seçer.** Botlar kalan rolleri rastgele paylaşır; dağılım yine 2/6/2 kalır.
- **Çevrim içi odada rol seçimi yoktur:** herkes (insan ve bot) her tur rastgele rol alır. Taraf da yoktur (bkz. §16).
- Kişisel skor turlar boyunca birikir. Beşinci turun sonunda en yüksek toplam skoru alan kazanır; eşitlikte ortak birincilik.
- Kolay, normal ve zor seçenekleri vardır (yalnızca bot davranışını değiştirir; çevrim içi odada kuran seçer). Dil ve arayüz Türkçedir.
- Görsel ve hareket dili ile kod düzeni Çayır Muhafızı (`C:\ju\cayirmuhafizi`) referans alınır; referans proje değiştirilmez.

## 2. Harita, kamera ve görüş

- Kasaba: pazar meydanı, tarlalar, koru, taş ocağı, değirmen ve aralarındaki yollar, evler, han, depolar, dağınık korular.
- NPC'ler rutin yapar: iş noktasına yürür, çalışır, eşya taşır, bekler, başka bölgeye geçer.
- Kamera izometrik ve karaktere yakındır.
- **Görüş alanı:** Herkes yalnızca çevresindeki yuvarlak alanı görür (yarıçap 30). Alanın dışı kararır ve oradaki karakterler çizilmez. Botlar da aynı yarıçapla ve görüş hattıyla sınırlıdır.
- **Küçük harita:** Oyundaki herkes (kasabalı, bot, insan) haritada aynı renkte bir nokta olarak görünür. Kimlik ya da rol vermez, yalnızca "orada birileri var" bilgisini verir; alakasız ya da tenha bir yere sapan biri herkesin haritasında fark edilir. Yakalanan ve ölenler görünmez.
- **Sabit nesne saydamlığı:** Görüş alanındaki herhangi bir karakter (oyuncu, bot ya da kasabalı) bir evin, pazar tezgâhının, ağacın, kayanın ya da kuyunun arkasına geçince (kameraya giden ışın nesneden geçince) yalnızca o nesne saydamlaşır. Arkadaki karakterler görünür ve fareyle seçilebilir; kimse arkasında değilse nesne katıdır.

## 3. Roller ve başlangıç bilgisi

| Rol | Tanıdığı kişiler | Görevi |
| --- | --- | --- |
| Suçlu | Diğer suçlu | Süre bitene kadar yakalanmamak |
| Dedektif | İki savcı | İzleri okuyup şüpheliyi işaretlemek |
| Savcı | Diğer savcı | İzleri ve işaretleri izleyip doğru kişiyi yakalamak |

- Tanınan kişiler dünyada yeşil halkayla görünür. Başka hiçbir rol/NPC ayrımı arayüzde gösterilmez.

### Kalabalığa karışma

- **E:** Bölgelerdeki ve depolardaki kutuların yanında kutuyu alır, tekrar basınca önüne bırakır. Kutu taşıyan herkes iş taşıyan bir kasabalı gibi görünür.
- **F:** İş noktasında birkaç saniye çalışır.

## 4. Tur akışı

- Tek başına oyunda her tur önce **rol seçimi** ekranıyla başlar. Çevrim içi odada rol rastgele gelir ve tur 6 saniyelik bir girişle başlar (rolünü okursun, kimse kıpırdamaz).
- Tur başladığında suç **zaten işlenmiştir**; bölgesel suç bildirimi yoktur.
- Yarışmacılar her tur haritanın farklı bölgelerine dağılmış olarak başlar.
- Tur 6 dakikalık geri sayımla ilerler.
- Bitiş koşulları:
  1. **İki suçlu da yakalanırsa** kanun tarafı kazanır.
  2. **Süre dolduğunda** en az bir suçlu serbestse suçlular kazanır.
  3. **İki savcı da ölürse** suçlular kazanır.
  4. **Hayattaki dedektiflerin işaret hakları tükenirse** ve hiçbir aktif işaret serbest bir suçluyu göstermiyorsa suçlular kazanır. (Son hak doğru kişiye kullanıldıysa savcılara o işareti değerlendirme şansı tanınır.)

## 5. İzler

- Her serbest suçlu belirli aralıklarla **iki iz** bırakır:
  - **Dedektif izi:** yalnızca dedektifler görür.
  - **Savcı izi:** yalnızca savcılar görür.
- İz ve üstündeki ok oyunun koyu tonlarına uyan **kan kırmızısı** renktedir.
- İkisi de suçlunun tam o kadar saniye önce **bastığı noktaya** düşer (belirsiz bir çevreye değil; konum onda bir saniyede bir kaydedilir ve iki kayıt arasında ara değerle bulunur). Yerde o anki yürüyüş yönüne bakan bir çift **ayak izi** olarak görünür. Bu **gecikme** de aralık gibi tur ilerledikçe kısalır (tablo).
- İz **2 saniye** sonra kaybolur ve yalnızca görenin kendi görüş alanındaysa görünür. İz haritaya düşmez.
- İz düşünce üstünde aşağıyı gösteren, kırmızı **zıplayan bir ok** belirir (kalabalıkta gözden kaçmasın); iz söndükçe ok da söner.
- İz aralığı ve gecikmesi 5 saniyeden başlar ve tur ilerledikçe kısalır; son dakikada iz 2 sn arayla, 1 sn geriden düşer:

| Tur saati | İz aralığı | Gecikme |
| --- | --- | --- |
| 0:00 – 1:00 | 5 sn | 5 sn |
| 1:00 – 2:00 | 4 sn | 4 sn |
| 2:00 – 3:00 | 3 sn | 3 sn |
| 3:00 – 5:00 | 3 sn | 2 sn |
| 5:00 – tur sonu | 2 sn | 1 sn |
- İkinci suçlunun ilk izi aralığın yarısı kadar kaydırılmıştır; izler aynı anda düşmez.
- Sonuç: Kalabalıkta iz kimseyi kesin göstermez; tenhada dolaşan suçlu kendini ele verir. Tur sonuna doğru saklanmak zorlaşır.

## 6. İşaretleme (dedektif)

- Her dedektifin turda **3 işaret hakkı** vardır. **Sol tık**, imlecin altındaki görüş alanındaki karakteri işaretler (menzil 12).
- Her dedektifin aynı anda **tek aktif işareti** olur; yeni işaret kendi eski işaretini kaldırır.
- Bir kişinin üzerinde tek işaret olur. Başka bir dedektif aynı kişiyi işaretlerse eski işaret sahibine uyarı gider: *"İşaretin başka bir dedektif tarafından kaldırıldı. Takibe devam et."*
- **İşaretleri herkes görür** (dedektifler, savcılar, suçlular). İşaretli suçlu ayrıca işaretli olduğu sürece ekran kenarının kızarmasıyla uyarılır.
- Suçlu olmayan birini (NPC ya da başka yarışmacı) işaretlemek **−1** puandır ve **işaret kalkmaz**; savcıyı yanlış yönlendirmiş olur. Bu ceza tur sonunda yazılır, böylece işaretin doğru olup olmadığı tur içinde sızmaz.
- Tanınan savcılar işaretlenemez.

## 7. İşaretin görünüşü

- Herkesin haritasında işaretli kişiyi içine alan **yaklaşık bir daire** görünür (merkez kişiden sabit rastgele bir uzaklıkta, yarıçap 12). Kesin konum verilmez. Ekran dışındaki daireler için kenar oku gösterilir.
- İşaretli kişi görüş alanına girince üstünde işaret görünür.
- İşaretli **suçlu kılık değiştirirse işaret kalkar**; haritadaki daire son bilinen yerde kalıp birkaç saniyede söner.
- **Tasarım gereği:** Yalnızca suçlular kılık değiştirebildiği için kaybolan bir işaret o kişinin suçlu olduğunu kesin olarak ele verir.
- Bir savcı yanlış kişiyi yakalarsa o işaret "aklandı" olarak gri görünür (işaret kalkmaz); ikinci savcı aynı hataya düşmez.

## 8. Yakalama (savcı)

- Yakalama **sınırsızdır**. **Sol tık**, imlecin altındaki yakın karakteri (menzil 4) yakalamaya çalışır.
- Suçluyu yakalamak: suçlu tur boyunca eylem yapamaz.
- Yanlış kişiyi yakalamak: **−1** puan; hedefe bir şey olmaz.
- **Her yakalama denemesi (doğru ya da yanlış) savcıyı ele verir:** kimliği **10 saniye** boyunca suçlulara görünür (başında kırmızı "SAVCI" etiketi, kırmızı ayak halkası, suçluların haritasında kırmızı nokta) ve hedef olur.

## 9. Kılık değiştirme (yalnızca suçlu)

- **İmleçteki kişi + Q:** yakın karakterin (menzil 6) kıyafetini ve şapkasını kopyalar. Rol, kimlik ve skor değişmez.
- Sınırsızdır ama **her değişim −1** puandır. (Yanlışlıkla çift basmayı önlemek için 0,6 sn bekleme.)
- Değişim anında görüş alanındaki herkesin göreceği bir efekt çıkar. Değişimi gören dedektif takibi sürdürüp yeniden işaretleyebilir.
- **Suçlu işaretlendiğini bilir:** işaretli olduğu sürece ekran kenarları Çayır Muhafızı'ndaki saldırı uyarısı gibi kızarıp söner.

## 10. Cinayet

- **İmleçteki kişi + sol tık** öldürür (menzil 2,8). Öldürme **sınırsızdır**; yanlışlıkla çift tıklamayı önlemek için iki öldürme arasında 1 sn bekleme vardır. Diğer suçlu hedeflenemez.
- Kasabalı öldürmek **−1**, dedektif öldürmek **+1**, savcı öldürmek **+2**. (İstekteki "savcı dışı her öldürme −1" ile "dedektif +1" çeliştiği için dedektif +1 olarak uygulandı.)
- Ölen dedektifin kalan işaret hakları yanar. İki savcı da ölürse suçlular kazanır.
- Cinayet suçluları açığa çıkarmaz.

## 11. Puanlar

Puanlar tur boyunca birikir, tur sonunda tek kez skora eklenir.

| Olay | Puan |
| --- | --- |
| Kanun kazanır (iki suçlu yakalandı) | Her dedektif ve savcı +1 |
| Suçlular kazanır | Tur sonunda serbest olan her suçlu +5 |
| Serbest geçen her tam dakika | Suçluya +1 (kazansa da kaybetse de) |
| Doğru yakalama | Yakalayan savcıya +1, o kişide aktif işareti olan dedektife +1 (kazansa da kaybetse de) |
| Yanlış yakalama (sınırsız denemenin her yanlışı) | Savcıya −1 |
| Suçlu olmayanı işaretleme | Dedektife −1 |
| Kılık değiştirme | Suçluya −1 |
| NPC / dedektif / savcı öldürme | −1 / +1 / +2 |

## 12. Kontroller

| Girdi | Eylem |
| --- | --- |
| WASD | Hareket |
| Shift | Koş |
| Space | Zıpla; havada tekrar basınca çift zıpla |
| Sağ tık | Atıl |
| Sol tık | Dedektif: işaretle · Savcı: yakala · Suçlu: öldür (imleçteki kişi) |
| E | Kutuyu al / bırak |
| F | İş noktasında çalış |
| Q | Suçlu: imleçteki kişinin kılığına gir (−1) |
| M | Küçük haritayı büyüt / küçült |
| Tab | Skor tablosu / izleyicide hedef değiştir |
| Esc | Duraklat (rol seçimi Esc ile kapanmaz). Çevrim içi odada oyun durmaz: menü açıkken yalnızca senin karakterin durur |

## 13. Ölüm, yakalanma, izleyici

- Yakalanan suçlu diğer suçluyu, ölen dedektif hayattaki dedektifleri, ölen savcı diğer savcıyı izler.
- İzleyici kamera eylem hakkı ve gizli bilgi vermez. Yeni turda herkes yeniden başlar.

## 14. Botlar

- **Dedektif:** Başka bir dedektifin işaretini ilk gördüğünde o kişiye biraz şüphe ekler (işaret yanlış olabilir); işaretli birini yeniden işaretleyip hak harcamaz. Görüş alanında iz görünce, izin çevresinde (gecikme süresince yürünebilecek mesafede) görünen kişilere şüphe puanı dağıtır. En şüpheliyi birkaç adım geriden izler, eşik aşılınca işaretler. Kılık değişimini görürse şüphe kesinleşir.
- **Savcı:** Görünen işaretli kişiye gidip yakalar; yoksa işaret dairelerine (uzaksa koşarak) gider. İşaret yokken kendi izlerinden biriken şüpheyle en şüpheliye yaklaşır; her deneme kimliğini açtığı ve yanlışı −1 olduğu için işaretsiz birini ancak çok emin olunca yakalar. Aklanan işaretleri bırakır.
- **Suçlu:** Kalabalık iş noktalarını tercih eder. Ele verilen bir savcı yakındaysa (kolay dışında) onu avlar. İşaretlenince zorluğa bağlı bir tereddütten sonra az kişinin gördüğü bir anda kılık değiştirir. Uzun süre peşine düşeni tenhada öldürmeyi deneyebilir.
- Hiçbir bot gerçek rolleri ya da görüş alanı dışını bilmez. Zorluk; tepki süresi, hafıza, işaret eşiği, tereddüt ve öldürme eğilimini değiştirir.

## 15. Teknik

- Kod düzeni Çayır Muhafızı'yla aynıdır: kökte `game.js` giriş noktası, `src/` altında sorumluluğa göre modüller (simülasyon: `world.js`, `marks.js`, `criminal.js`, `traces.js`, `crowd.js`, `ai.js`, `score.js`, `roster.js`, `physics.js`, `environment.js`; istemci: `main.js`, `ui.js`, `screens.js`, `input.js`, `minimap.js`, `characters.js`, `fog.js`, `view/`), `scripts/`, `tests/`.
- Kurallar tek yetkili simülasyonda işler; simülasyon DOM ve çizimden bağımsızdır ve testlerde başsız koşar.
- Gerçek kimlik, görünüş ve gözlemcinin bildiği bilgi ayrı tutulur.
- Aynı simülasyon tek başına oyunda tarayıcıda, çevrim içi odada sunucuda (`server/rooms.mjs`) koşar; istemci dünyanın kopyasını çizer (`src/net/`).

## 16. Çevrim içi oda

- **Oda kur / Odaya katıl**: ad yazılır, oda kurulunca 5 karakterlik bir kod (ve `?oda=KOD` linki) çıkar. Hesap yoktur.
- **Lobi**: 10 koltuk, taraf yok. Gelen ilk boş koltuğa oturur; boş bir koltuğa tıklayan oraya geçer. Boş koltukları botlar doldurur (koltuğun bot adıyla). Botların zorluğunu ve **Başlat**'ı yalnızca kuran seçer; "hazır" yoktur.
- **Roller**: her tur herkese rastgele; tanıma kuralı aynıdır (suçlular birbirini, kanun savcıları tanır).
- **Tur akışı** sunucunun saatiyle: giriş (6 sn) → oyun (6 dk) → tur sonu tablosu (12 sn, roller açılır) → sonraki tur. Beşinci turdan sonra oda lobiye döner; aynı oyuncularla yeni maç başlatılabilir.
- **Kopma**: sayfa yenilenince ya da bağlantı kopunca aynı koltuğa dönülür. Koparken karakterini **bot yönetir** (duran bir karakter gizli kimlik oyununda kendini ele verirdi); dönünce sana geçer. Odadan çıkanın karakteri tur sonuna kadar botta kalır. Bağlı kimse kalmayınca oda kapanır.
- **Gizli bilgi paketlerde de gizlidir**: sunucu her oyuncuya yalnızca onun ekranında görebileceğini yollar. Konum ve görünüş herkese açıktır (haritada da görünür); roller yalnızca tanıdıklar için gelir (herkesinki tur sonunda); izler yalnızca kendi rolünün izleridir ve görüş alanındadır; ele verilen savcılar yalnızca suçlulara gider; özel bildirimler yalnızca sahibine.
- **Akıcılık**: sunucu saniyede 20 adım koşar, 10 paket yollar; başkaları 0,1 sn geriden ara değerle çizilir, kendi karakterin yerel girdiyle anında yürür.
