# İz Peşinde — Tasarım Belgesi

Bu belge oyunun kurallarının tek kaynağıdır. Sayısal değerlerin hepsi `src/config.js` içindedir; burada yazanlar başlangıç değerleridir.

## 1. Amaç ve kapsam

Büyük bir ortaçağ kasabasında geçen; kalabalığa karışma, iz sürme, takip ve kılık değiştirme üzerine kurulu tek oyunculu bir gizli kimlik oyunu.

- 1 insan + 9 rol sahibi bot = 10 yarışmacı. Bunların dışında 170 sıradan kasabalı (NPC) gündelik işler yapar.
- Maç 5 turdur. Her tur **2 suçlu, 6 dedektif, 2 savcı** vardır.
- **Oyuncu rolünü her turun başında kendisi seçer.** Botlar kalan rolleri rastgele paylaşır; dağılım yine 2/6/2 kalır.
- Kişisel skor turlar boyunca birikir. Beşinci turun sonunda en yüksek toplam skoru alan kazanır; eşitlikte ortak birincilik.
- Kolay, normal ve zor seçenekleri vardır (yalnızca bot davranışını değiştirir). Dil ve arayüz Türkçedir.
- Görsel ve hareket dili ile kod düzeni Çayır Muhafızı (`C:\ju\cayirmuhafizi`) referans alınır; referans proje değiştirilmez.

## 2. Harita, kamera ve görüş

- Kasaba: pazar meydanı, tarlalar, koru, taş ocağı, değirmen ve aralarındaki yollar, evler, han, depolar, dağınık korular.
- NPC'ler rutin yapar: iş noktasına yürür, çalışır, eşya taşır, bekler, başka bölgeye geçer.
- Kamera izometrik ve karaktere yakındır.
- **Görüş alanı:** Herkes yalnızca çevresindeki yuvarlak alanı görür (yarıçap 21). Alanın dışı kararır ve oradaki karakterler çizilmez. Botlar da aynı yarıçapla ve görüş hattıyla sınırlıdır.
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

- Her tur önce **rol seçimi** ekranıyla başlar.
- Tur başladığında suç **zaten işlenmiştir**; bölgesel suç bildirimi yoktur.
- Yarışmacılar her tur haritanın farklı bölgelerine dağılmış olarak başlar.
- Tur 6 dakikalık geri sayımla ilerler.
- Bitiş koşulları:
  1. **İki suçlu da yakalanırsa** kanun tarafı kazanır.
  2. **Süre dolduğunda** en az bir suçlu serbestse suçlular kazanır.
  3. **İki savcı da ölürse** suçlular kazanır.
  4. **Hayattaki savcıların yakalama hakları tükenirse** ve serbest suçlu varsa suçlular kazanır.
  5. **Hayattaki dedektiflerin işaret hakları tükenirse** ve hiçbir aktif işaret serbest bir suçluyu göstermiyorsa suçlular kazanır. (Son hak doğru kişiye kullanıldıysa savcılara o işareti değerlendirme şansı tanınır.)

## 5. İzler

- Her serbest suçlu belirli aralıklarla **iki iz** bırakır:
  - **Dedektif izi:** yalnızca dedektifler görür.
  - **Savcı izi:** yalnızca savcılar görür (farklı renk).
- İkisi de suçlunun birkaç saniye önce bulunduğu yere düşer; bu **gecikme** de aralık gibi tur ilerledikçe kısalır (tablo).
- İz **2 saniye** sonra kaybolur ve yalnızca görenin kendi görüş alanındaysa görünür. İz haritaya düşmez.
- İz düşünce üstünde aşağıyı gösteren, izin renginde **zıplayan bir ok** belirir (kalabalıkta gözden kaçmasın); iz söndükçe ok da söner.
- İz aralığı ve gecikmesi 5 saniyeden başlar, tur ilerledikçe kısalır, son dakikada 2 saniye olur:

| Tur saati | İz aralığı | Gecikme |
| --- | --- | --- |
| 0:00 – 1:00 | 5 sn | 5 sn |
| 1:00 – 2:00 | 4 sn | 4 sn |
| 2:00 – 5:00 | 3 sn | 3 sn |
| 5:00 – tur sonu | 2 sn | 2 sn |
- İkinci suçlunun ilk izi aralığın yarısı kadar kaydırılmıştır; izler aynı anda düşmez.
- Sonuç: Kalabalıkta iz kimseyi kesin göstermez; tenhada dolaşan suçlu kendini ele verir. Tur sonuna doğru saklanmak zorlaşır.

## 6. İşaretleme (dedektif)

- Her dedektifin turda **3 işaret hakkı** vardır. **Sol tık**, imlecin altındaki görüş alanındaki karakteri işaretler (menzil 12).
- Her dedektifin aynı anda **tek aktif işareti** olur; yeni işaret kendi eski işaretini kaldırır.
- Bir kişinin üzerinde tek işaret olur. Başka bir dedektif aynı kişiyi işaretlerse eski işaret sahibine uyarı gider: *"İşaretin başka bir dedektif tarafından kaldırıldı. Takibe devam et."*
- **Suçlunun üstündeki işaret herkese görünür:** diğer dedektifler de görür ve o suçluya odaklanabilir. Suçlu olmayan birinin üstündeki işareti **yalnızca işaretleyen dedektif ve savcılar** görür. (Böylece başka bir dedektifin işaretini gören dedektif, onun suçlu olduğunu bilir; bu bilinçli bir tercihtir.)
- Suçlu olmayan birini (NPC ya da başka yarışmacı) işaretlemek **−1** puandır ve **işaret kalkmaz**; savcıyı yanlış yönlendirmiş olur. Bu ceza tur sonunda yazılır, böylece işaretin doğru olup olmadığı tur içinde sızmaz.
- Tanınan savcılar işaretlenemez.

## 7. İşaretin savcıya görünüşü

- Savcının (ve suçlu işaretiyse herkesin) haritasında işaretli kişiyi içine alan **yaklaşık bir daire** görünür (merkez kişiden sabit rastgele bir uzaklıkta, yarıçap 12). Kesin konum verilmez. Ekran dışındaki daireler için kenar oku gösterilir.
- Savcı daireye gidip işaretli kişiyi görüş alanına aldığında kişinin üstünde işaret görünür.
- İşaretli **suçlu kılık değiştirirse işaret kalkar**; haritadaki daire son bilinen yerde kalıp birkaç saniyede söner.
- **Tasarım gereği:** Yalnızca suçlular kılık değiştirebildiği için kaybolan bir işaret o kişinin suçlu olduğunu kesin olarak ele verir.
- Bir savcı yanlış kişiyi yakalarsa o işaret savcılara "aklandı" olarak gri görünür (işaret kalkmaz); ikinci savcı aynı hataya düşmez.

## 8. Yakalama (savcı)

- Her savcının turda **3 yakalama hakkı** vardır. **Sol tık**, imlecin altındaki yakın karakteri (menzil 4) yakalamaya çalışır. Her deneme bir hak harcar.
- Suçluyu yakalamak: suçlu tur boyunca eylem yapamaz.
- Yanlış kişiyi yakalamak: **−1** puan; hedefe bir şey olmaz. Savcı açığa çıkmaz.

## 9. Kılık değiştirme (yalnızca suçlu)

- **Sol tık:** tıklanan yakın karakterin (menzil 6) kıyafetini ve şapkasını kopyalar. Rol, kimlik ve skor değişmez.
- Sınırsızdır ama **her değişim −1** puandır. (Yanlışlıkla çift tıklamayı önlemek için 0,6 sn bekleme.)
- Değişim anında görüş alanındaki herkesin göreceği bir efekt çıkar. Değişimi gören dedektif takibi sürdürüp yeniden işaretleyebilir.
- **Suçlu işaretlendiğini bilir:** işaretli olduğu sürece ekran kenarları Çayır Muhafızı'ndaki saldırı uyarısı gibi kızarıp söner.

## 10. Cinayet

- İki suçlunun turda **ortak 2** öldürme hakkı vardır (Q, en yakın geçerli kişi). Diğer suçlu hedeflenemez. (İki savcının da ölebilmesi için hak en az 2'dir.)
- NPC öldürmek **−1**, dedektif öldürmek **+1**, savcı öldürmek **+2**.
- Ölen dedektifin kalan işaret hakları, ölen savcının kalan yakalama hakları yanar. İki savcı da ölürse suçlular kazanır.
- Cinayet suçluları açığa çıkarmaz.

## 11. Puanlar

Puanlar tur boyunca birikir, tur sonunda tek kez skora eklenir.

| Olay | Puan |
| --- | --- |
| Kanun kazanır (iki suçlu yakalandı) | Her dedektif ve savcı +1 |
| Suçlular kazanır | Tur sonunda serbest olan her suçlu +5 |
| Serbest geçen her tam dakika | Suçluya +1 (kazansa da kaybetse de) |
| Doğru yakalama | Yakalayan savcıya +1, o kişide aktif işareti olan dedektife +1 (kazansa da kaybetse de) |
| Yanlış yakalama | Savcıya −1 |
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
| Sol tık | Dedektif: işaretle · Savcı: yakala · Suçlu: tıklanan kişinin kılığına gir |
| E | Kutuyu al / bırak |
| F | İş noktasında çalış |
| Q | Suçlu: ortak öldürme hakkı |
| M | Küçük haritayı büyüt / küçült |
| Tab | Skor tablosu / izleyicide hedef değiştir |
| Esc | Duraklat (rol seçimi Esc ile kapanmaz) |

## 13. Ölüm, yakalanma, izleyici

- Yakalanan suçlu diğer suçluyu, ölen dedektif hayattaki dedektifleri, ölen savcı diğer savcıyı izler.
- İzleyici kamera eylem hakkı ve gizli bilgi vermez. Yeni turda herkes yeniden başlar.

## 14. Botlar

- **Dedektif:** Başka bir dedektifin suçluya koyduğu (herkese görünen) işarete yönelir; o kişiyi yeniden işaretleyip hak harcamaz. Görüş alanında iz görünce, izin çevresinde (gecikme süresince yürünebilecek mesafede) görünen kişilere şüphe puanı dağıtır. En şüpheliyi birkaç adım geriden izler, eşik aşılınca işaretler. Kılık değişimini görürse şüphe kesinleşir.
- **Savcı:** Görünen işaretli kişiye gidip yakalar; yoksa işaret dairelerine (uzaksa koşarak) gider. İşaret yokken kendi izlerinden biriken şüpheyle en şüpheliye yaklaşır; yakalama hakkı değerli olduğu için işaretsiz birini ancak çok emin olunca yakalar. Aklanan işaretleri bırakır.
- **Suçlu:** Kalabalık iş noktalarını tercih eder. İşaretlenince zorluğa bağlı bir tereddütten sonra az kişinin gördüğü bir anda kılık değiştirir. Uzun süre peşine düşeni tenhada öldürmeyi deneyebilir.
- Hiçbir bot gerçek rolleri ya da görüş alanı dışını bilmez. Zorluk; tepki süresi, hafıza, işaret eşiği, tereddüt ve öldürme eğilimini değiştirir.

## 15. Teknik

- Kod düzeni Çayır Muhafızı'yla aynıdır: kökte `game.js` giriş noktası, `src/` altında sorumluluğa göre modüller (simülasyon: `world.js`, `marks.js`, `criminal.js`, `traces.js`, `crowd.js`, `ai.js`, `score.js`, `roster.js`, `physics.js`, `environment.js`; istemci: `main.js`, `ui.js`, `screens.js`, `input.js`, `minimap.js`, `characters.js`, `fog.js`, `view/`), `scripts/`, `tests/`.
- Kurallar tek yetkili simülasyonda işler; simülasyon DOM ve çizimden bağımsızdır ve testlerde başsız koşar.
- Gerçek kimlik, görünüş ve gözlemcinin bildiği bilgi ayrı tutulur.
