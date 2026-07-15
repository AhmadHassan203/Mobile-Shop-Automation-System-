# Lahore/Pakistan Mobile Shop Catalog Strategy

## 1. Important principle

Do not hard-code the shop around today's model names. Models change quickly. Build a stable category and attribute structure, then let sales and customer-demand data decide which exact variants deserve inventory.

Current market signals support a broad core around Infinix, Samsung, Vivo, Oppo and Tecno, while local retailers also prominently list Apple, Xiaomi, Realme, itel, Nokia/HMD, Nothing and other brands. The shop's own Lahore demand must override national directional data after enough records exist.

## 2. Top-level catalog

### A. Mobile phones
- Smartphones
- Feature phones
- New phones
- Used phones
- Open-box phones
- Refurbished phones, only with explicit grading and policy

### B. Tablets and connected devices
- Android tablets
- iPads
- e-readers, demand-led
- mobile hotspots / MiFi
- trackers

### C. Wearables and audio
- smartwatches
- fitness bands
- wireless earbuds
- wired handsfree
- headphones
- Bluetooth speakers

### D. Power and charging
- wall chargers
- fast chargers
- wireless chargers
- MagSafe-compatible chargers
- car chargers
- charging cables
- adapters/converters
- power banks
- replacement batteries, only when service quality is controlled

### E. Protection
- phone cases
- screen protectors
- camera protectors
- tablet covers
- watch protectors
- pouches
- waterproof pouches

### F. Storage and connectivity
- memory cards
- card readers
- OTG adapters
- USB hubs
- SIM adapters/ejector tools
- AUX cables
- Bluetooth adapters

### G. Mounts and convenience
- car holders
- desk stands
- selfie sticks
- tripods
- ring lights
- gaming triggers/controllers
- cooling fans
- styluses

### H. Services
- screen-protector installation
- phone setup
- data transfer
- backup/restore assistance
- software update
- device inspection
- trade-in
- repair
- warranty handling
- delivery
- optional mobile top-up/easyload if offered

## 3. Brand strategy

### Volume/value segment
Prioritize measured depth in:

- Infinix
- Tecno
- itel
- selected Samsung entry models
- selected Vivo/Oppo value models
- selected Redmi/Xiaomi value models

### Mid-range segment
Maintain controlled depth in:

- Samsung
- Vivo
- Oppo
- Xiaomi/Redmi
- Infinix
- Tecno
- Realme
- Honor

### Premium segment
Use lower quantities and stronger demand validation for:

- Apple
- Samsung premium lines
- selected Google Pixel
- selected OnePlus
- selected Nothing
- premium wearables and audio

### Used-device segment
Track separately by:

- brand/model
- PTA status
- storage/color
- physical grade
- battery health
- box/accessories
- repair/opening history
- warranty
- region/variant
- verification status

Apple and Samsung used devices may justify a dedicated buying workflow, but inventory depth must be driven by actual inquiry, conversion and aging data.

## 4. Price bands

Use editable bands because inflation and model pricing change.

Suggested starting configuration:

- Entry: up to PKR 35,000
- Value: PKR 35,001-60,000
- Mid: PKR 60,001-100,000
- Upper-mid: PKR 100,001-180,000
- Premium: above PKR 180,000

Review bands quarterly. Reports should preserve the band definition used at the time or clearly apply the current definition.

## 5. Smartphone attributes

Required:

- brand
- model
- launch generation/year
- RAM
- storage
- color
- SIM configuration
- eSIM support
- network generation
- PTA status
- official/local/import status
- condition
- warranty
- region
- box availability
- charger included
- IMEI1
- IMEI2
- serial
- battery health for used/open-box
- physical grade
- repair/opening history

Useful:

- chipset
- screen size/type
- camera summary
- battery capacity
- charging wattage
- NFC
- fingerprint type
- water resistance
- software support note

Specifications should support customer comparison, but operational data must remain distinct from marketing descriptions.

## 6. Accessory attributes

### Chargers
- connector/output port
- wattage
- charging protocols
- plug type
- cable included
- original/third-party
- warranty

### Cables
- connector A/B
- length
- maximum wattage/current
- data-transfer support
- material
- warranty

### Power banks
- capacity
- rated output
- ports
- fast-charge protocols
- display
- airline suitability note
- warranty

### Cases/protectors
- compatible model
- material/type
- color
- camera protection
- MagSafe compatibility
- installation included

### Earbuds/headphones
- connection type
- battery life
- ANC/ENC
- microphone
- gaming latency
- warranty

## 7. SKU strategy

### Serialized phone
`PH-{BRAND}-{MODEL}-{STORAGE}-{COLOR}-{CONDITION}-{PTA}`

Example:
`PH-APPLE-IP17PM-256-BLK-NEW-PTA`

The IMEI is not the SKU. It identifies the physical unit.

### Accessory
`AC-{CATEGORY}-{BRAND}-{KEYSPEC}-{COLOR}`

Example:
`AC-CHARGER-BASEUS-20W-WHT`

### Service
`SV-{SERVICE}-{TIER}`

Example:
`SV-DATA-TRANSFER-STANDARD`

## 8. Initial stock strategy

Do not buy one of every model.

Start with:

- broad accessory coverage with controlled quantities
- deeper stock only in proven fast-moving value/mid-range variants
- limited premium new-device stock
- demand-led premium and unusual variants
- separate capital budget for used phones
- one display/demo strategy where commercially useful
- supplier availability records for products not held in stock

For variants, avoid excessive color fragmentation. Stock the most requested neutral colors and record unmet color demand before expanding.

## 9. Minimum catalog seed

Before launch, create:

- 10-15 brands
- current phone models actually sold or sourced by the shop
- exact variants for opening stock
- common cases/protectors for stocked models
- top charger/cable standards
- top power-bank capacities
- common earbuds and smartwatches
- service SKUs
- supplier mappings
- warranty policies

Do not seed hundreds of speculative models. Add an unmatched-demand workflow so the catalog can grow from real requests.

## 10. Catalog intelligence

Track:

- inquiries per model/variant
- conversion rate
- price objections
- requested but unavailable quantity
- sales velocity
- margin
- stockout days
- days in stock
- return/defect rate
- accessory attachment rate
- supplier availability
- capital required

Recommended actions:

- `stock_deeper`
- `maintain`
- `test_small_quantity`
- `source_on_demand`
- `discount_or_bundle`
- `stop_buying`
- `clear_aged_stock`

## 11. Legal and trust controls

- Verify IMEI/PTA status through the applicable official process.
- For used devices, capture the applicable Punjab Police e-Gadget reference/process.
- Do not treat a screenshot or seller statement as sufficient verification.
- Keep verification timestamp and result.
- Quarantine suspicious devices.
- Restrict access to seller identity documents.
- Clearly state warranty and condition on invoice.
- Obtain current professional advice for FBR, consumer, tax and record-retention obligations.

## 12. Market-data caution

National web-usage share, online retailer catalogs and marketplace listings are directional, not the shop's purchase order. After 60-90 days, the system should prioritize the shop's own Lahore data:

1. completed sales
2. qualified unmet demand
3. price-band conversion
4. margin and capital turn
5. return/defect risk
6. supplier lead time
