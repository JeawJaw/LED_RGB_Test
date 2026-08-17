# RGB USB LED Controller — ESP32-S3 + PCA9548A + NCP5623 / TI LP5817

โปรเจกต์นี้มีหน้าเว็บ static สำหรับ GitHub Pages และ firmware Arduino IDE สำหรับ ESP32-S3 หน้าเว็บส่ง JSON ผ่าน USB CDC ทุกครั้งที่ RGB, ความสว่าง หรือชนิด LED driver เปลี่ยน

```json
{"cmd":"set_rgb","driver":"lp5817","r":255,"g":96,"b":0,"brightness":75}
```

- `driver`: `ncp5623` หรือ `lp5817`
- `r`, `g`, `b`: `0..255`
- `brightness`: `0..100` เปอร์เซ็นต์ (`0` = ดับ, `100` = ค่าสูงสุดที่กำหนดใน driver)
- ทั้งสอง driver สื่อสารผ่าน PCA9548A ช่อง 0; firmware เลือกช่อง 0 ใหม่ก่อน I²C transaction ทุกครั้ง
- เมื่อเปลี่ยน driver firmware จะสั่งดับ driver เดิมก่อน แล้วจึงส่งค่าให้ driver ใหม่

## ไฟล์

- `web/` — GitHub Pages, Bootstrap 5.3 + JavaScript + Web Serial
- `firmware/ESP32S3_RGB_DualDriver/` — Arduino sketch และ driver class แยกคนละไฟล์
  - `Pca9548aMux.h`
  - `Ncp5623Driver.h`
  - `Lp5817Driver.h`

## Library / package ที่ต้องติดตั้ง

ติดตั้งใน Arduino IDE:

1. **ESP32 by Espressif Systems** จาก Boards Manager (แนะนำ 3.x)
2. **ArduinoJson by Benoit Blanchon** จาก Library Manager (7.x)

`Wire` และ USB CDC อยู่ใน ESP32 Arduino Core แล้ว ส่วน library ของ NCP5623 และ LP5817 ถูกแยกเป็น local driver class และรวมอยู่ในโฟลเดอร์ sketch จึงไม่ต้องติดตั้ง third-party library เพิ่ม วิธีนี้ใช้ register/address ตาม datasheet โดยตรงและทำให้บังคับเลือก PCA9548A Channel 0 ก่อนทุกคำสั่งได้แน่นอน

## Address และการควบคุมความสว่าง

| อุปกรณ์ | I²C 7-bit address | วิธีควบคุม |
|---|---:|---|
| PCA9548A | `0x70` เมื่อ A0/A1/A2 = GND | Channel 0 mask = `0x01` |
| NCP5623B | `0x38` | PWM 5 บิต `0..31`; firmware คูณ RGB ด้วย brightness ก่อนแปลง |
| TI LP5817 | `0x2D` | Manual PWM 8 บิต `0..255`; firmware คูณ RGB ด้วย brightness |

LP5817 ใช้ค่า maximum current 25.5 mA เป็นค่าเริ่มต้นที่ปลอดภัยกว่า (`MAX_CURRENT=0`) และตั้ง dot current เป็น 100% หากวงจรหรือ LED รับกระแสต่ำกว่านี้ ให้ลดค่า register `OUT0_DC..OUT2_DC` ใน `Lp5817Driver.h` ก่อนใช้งาน

## การต่อวงจร

ค่าตั้งต้น: ESP32-S3 SDA = GPIO 8, SCL = GPIO 9 และ PCA9548A = `0x70` แก้ได้ด้านบนของไฟล์ `.ino`

`ESP32-S3 → PCA9548A → Channel 0 (SC0/SD0) → NCP5623B หรือ LP5817 → RGB LED`

| ESP32-S3 | PCA9548A |
|---|---|
| 3V3 | VCC |
| GND | GND, A0, A1, A2 |
| GPIO 8 | SDA |
| GPIO 9 | SCL |

ฝั่ง Channel 0 ต่อ `SD0 → SDA`, `SC0 → SCL` ของ LED driver และใช้กราวด์ร่วมกัน ใส่ pull-up ของ I²C ทั้งฝั่ง main bus และ downstream ตามวงจรจริง

NCP5623B ใช้ RGB LED แบบ common anode ตามวงจรอ้างอิงของชิป ส่วน LP5817 เป็นขา constant-current sink เช่นกัน ตรวจสอบลำดับ OUT0/OUT1/OUT2 ให้ตรง R/G/B; ถ้าสีสลับให้เปลี่ยน register mapping ใน driver header

## Arduino IDE

1. เปิด `firmware/ESP32S3_RGB_DualDriver/ESP32S3_RGB_DualDriver.ino`
2. เลือก `ESP32S3 Dev Module` หรือบอร์ด ESP32-S3 ที่ใช้อยู่
3. ตั้ง `USB CDC On Boot = Enabled`
4. ถ้ามีเมนู ให้ตั้ง `USB Mode = Hardware CDC and JTAG`
5. Upload และต่อสายกับช่อง Native USB/USB ของ ESP32-S3

ทดสอบผ่าน Serial Monitor ที่ 115200 baud, line ending = New Line:

```json
{"cmd":"set_rgb","driver":"ncp5623","r":255,"g":0,"b":128,"brightness":50}
```

หรือ:

```json
{"cmd":"ping"}
```

## GitHub Pages และ macOS

คัดลอกไฟล์ใน `web/` ไปไว้ที่ root ของ repository แล้วเปิด Settings → Pages → Deploy from a branch → `main` / `/(root)` หน้าเว็บต้องเปิดผ่าน HTTPS

บน macOS ใช้ Chrome หรือ Edge ได้ โดยกด **เชื่อมต่อ USB** และเลือกพอร์ต ESP32-S3 ในหน้าต่างของเบราว์เซอร์ Safari/Firefox ยังไม่รองรับ Web Serial โดยตรง

## อ้างอิงชิป

- [TI LP5817 product and datasheet](https://www.ti.com/product/LP5817)
- [TI LP5817 register map](https://www.ti.com/document-viewer/LP5817/datasheet/GUID-20240816-SS0T-FXCL-3MRS-PVFH7CWPZNVD)
