# Mail Asistanı — Kalıcı Kurallar

Bu dosya, mail asistanı rutininin her çalışmasında uygulanması gereken
kalıcı istisna/yok sayma kurallarını içerir. Rutin çalışırken bu dosyayı
oku ve aşağıdaki kuralları uygula.

Son güncelleme: 2026-07-10

## Yok sayma kuralları (yıldızlama YOK, takvime ekleme YOK)

Aşağıdaki maillerde: yıldızlama ve takvime ekleme YAPMA. Sadece Adım 4'teki
gibi "Ajan/İşlendi" (Label_27) etiketiyle işaretle ki tekrar taranmasın.

1. **Yanlış alıcı adresleri — `ahmet.karaca@gmail.com`**
   Muhatabı/alıcısı `ahmet.karaca@gmail.com` olan mailler Ahmet'e ait
   değildir (isim/adres benzerliğinden başkasına ait). Tamamen yok say.
   - Örnek: KETSİS / Gelir İdaresi Başkanlığı e-Tebligat bildirimleri
     bu adrese geliyordu (Belge No 2026070966aQm0000288). Bunlar Ahmet'in
     vergi tebligatı DEĞİL.

2. **Türk Telekom — muhatap "AHMET ERDEM KARACA" değilse**
   Gönderen Türk Telekom ise ve mailin muhatabı/fatura sahibi
   "AHMET ERDEM KARACA" DEĞİLSE maili tamamen yok say. Sadece
   "Ahmet Erdem Karaca" adına gelenleri normal işle (fatura/son ödeme
   tarihi varsa yıldızla + takvime ekle).

## Not
Yeni yok sayma kuralları çıktıkça bu dosyaya eklenmelidir.