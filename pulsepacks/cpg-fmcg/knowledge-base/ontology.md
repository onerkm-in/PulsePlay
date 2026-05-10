# CPG-FMCG Ontology

Domain entity model for CPG/FMCG enterprises. Entities are grouped by area; relationships are described inline. This ontology is the contract the AI agent reads to disambiguate question intent and the BI surface reads to align master data.

## Conventions

- Entity names are PascalCase singular nouns.
- Attributes are lowerCamelCase.
- Relationships use the form `Entity --rel--> Entity`.
- Standard identifiers (GS1 GTIN, GLN, SSCC) are noted on the relevant entities.

## Product area

### Product
- **gtin** (GS1 GTIN — consumer-unit, case, or pallet)
- **brand** — top-level commercial brand
- **category** — e.g. Beverages, Personal Care
- **segment** — e.g. Sparkling Water, Hair Care
- **variant / flavour** — e.g. Lemon, Vanilla
- **packType / packSize** — e.g. 12-pack 330ml can
- **shelfLifeDays**
- **allergens** — array (peanut, gluten, etc.)
- **regulatoryStatus** — by jurisdiction
- **gs1DigitalLink** — optional URI

Relationships:
- Product --hasBOM--> BillOfMaterials
- Product --hasBatch--> Batch
- Product --listedIn--> Assortment
- Product --soldAt--> Price (per Customer / Channel / Market)

### BillOfMaterials
- **components** — array of {materialId, quantity, uom, scrap%}
- **recipeId** — for foods/beverages

Relationships:
- BillOfMaterials --uses--> Material (Ingredient or Packaging)

### Batch
- **batchNumber**
- **manufactureDate**
- **expiryDate**
- **plant** (GLN)
- **line**
- **shift**
- **qualityStatus**

Relationships:
- Batch --producedOn--> Line
- Batch --consumedBy--> Order (downstream traceability)

## Customer area

### Customer
- **customerId**
- **type** — Retailer | Distributor | Wholesaler | Foodservice | E-commerce
- **name**
- **shipToGLN** — GS1 GLN per ship-to location

Relationships:
- Customer --hasOutlet--> Outlet
- Customer --hasContract--> CustomerContract
- Customer --negotiatesIn--> JointBusinessPlan

### Outlet
- **outletId**
- **storeFormat** — hypermarket, supermarket, convenience, drug, mass, club, e-commerce, hard-discount
- **channel**
- **route** — sales route covering the outlet
- **gln**

### JointBusinessPlan
- **year**
- **volumeCommitment**
- **promoCommitment**
- **innovationCommitment**
- **marginCommitment**

Relationships:
- JointBusinessPlan --owns--> Scorecard
- JointBusinessPlan --funds--> Promotion (set)

## Consumer area

### Consumer
- **householdId** (anonymised — typically from loyalty data)
- **segment**
- **occasion** — e.g. weekday breakfast, weekend entertaining
- **mission** — e.g. stock-up, fill-in, treat
- **basketHistory**

Relationships:
- Consumer --buys--> Product
- Consumer --visits--> Outlet
- Consumer --segmentedBy--> Segment

## Supply area

### Vendor
- **vendorId**
- **gln**
- **tier** — 1 / 2 / 3 / 4
- **commodityCategory**
- **financialHealthScore**
- **esgScore**
- **riskClassification**

Relationships:
- Vendor --supplies--> Material
- Vendor --signsContract--> SupplierContract
- Vendor --inheritsFrom--> Vendor (tier 2/3/4 dependencies)

### Material
- **materialId**
- **type** — Ingredient | Packaging | MRO | Indirect
- **uom**
- **specSheet** — link to PLM master

Relationships:
- Material --listedIn--> BillOfMaterials
- Material --sourcedFrom--> Vendor

### Plant
- **plantId**
- **gln**
- **country**
- **certifications** — FSSC 22000, BRCGS, SQF, ISO 14001, ISO 50001, ISO 45001
- **lines** — array

Relationships:
- Plant --has--> Line
- Plant --produces--> Product
- Plant --reportsTo--> SupplyChainNetwork

### Line
- **lineId**
- **theoreticalRate** — units per hour
- **changeoverMatrix** — minutes between SKU pairs
- **allergenZone**

Relationships:
- Line --runs--> Batch
- Line --usesEquipment--> Equipment

### DistributionCentre
- **dcId**
- **gln**
- **storageType** — ambient, chilled, frozen, mixed
- **wmsSystem** — Manhattan, Blue Yonder, SAP EWM, Oracle, etc.

### Lane
- **laneId**
- **origin** (Plant or DC)
- **destination** (Customer or DC)
- **carrier**
- **mode** — road, rail, sea, air, intermodal
- **transitTime**

### Carrier
- **carrierId**
- **dotMcNumber** (US) / equivalent in other jurisdictions
- **performanceTier**

## Commercial area

### Price
- **listPrice**
- **netPrice** — after trade discounts
- **currency**
- **effectiveFrom / effectiveTo**

### Promotion
- **promoId**
- **mechanic** — TPR, BOGO, scan-back, off-invoice, MDF, slotting
- **start / end**
- **fundingSource**
- **expectedLift**
- **status** — planned, active, settled

Relationships:
- Promotion --runsAt--> Customer
- Promotion --covers--> Product (set)
- Promotion --funded--> Accrual
- Promotion --settledAs--> Deduction (one or more)

### Assortment
- **assortmentId**
- **scope** — Customer, Channel, or StoreCluster
- **role** — destination, routine, occasional, seasonal, convenience
- **products** — set

### Campaign
- **campaignId**
- **mediaMix** — TV, OOH, digital, retail-media, social, search
- **budget**
- **measuredLift**

## Finance area

### ProfitAndLoss
- **scope** — Total, Customer, Category, Brand, Plant, Channel
- **grossSales / netSales / grossProfit / margin**
- **tradeSpend / promoROI**
- **opex / overhead**
- **bridgeComponents** — price, volume, mix, commodity, FX, plant variance, trade

### WorkingCapital
- **inventory**
- **receivables**
- **payables**
- **deductionLeakage**
- **accrualAccuracy**

### Deduction
- **deductionId**
- **customer**
- **invoice**
- **reasonCode** — price, shortage, damage, promo, compliance
- **amount**
- **status** — disputed / accepted / written-off

## Manufacturing area

### Equipment
- **equipmentId**
- **type**
- **maintenancePlan**
- **sensors** — IoT tag set
- **vibrationProfile / temperatureProfile**

### MaintenanceWorkOrder
- **wonum**
- **type** — preventive | corrective | predictive
- **assignedTo**
- **rootCause**
- **downtimeMinutes**

### QualityDeviation
- **deviationId**
- **batch** — referenced
- **type** — out-of-spec, contamination, label, packaging
- **capa** — Corrective and Preventive Action linkage
- **disposition** — release, rework, scrap, hold

## Sustainability area

### EmissionsRecord
- **scope** — Scope 1 | Scope 2 | Scope 3 (with category 1-15 per GHG Protocol)
- **source** — combustion, electricity, purchased goods, transport, etc.
- **co2eTonnes**
- **calculationMethod** — activity-based, spend-based, supplier-specific, hybrid
- **reportingPeriod**

Relationships:
- EmissionsRecord --attributedTo--> Plant | Vendor | Lane | Customer

### WaterRecord
- **withdrawalCubicMeters**
- **dischargeCubicMeters**
- **stressedBasinFlag**

### WasteRecord
- **type** — process, packaging, food (in food categories)
- **disposition** — recycled, recovered, incinerated, landfilled
- **quantityKg**

### PackagingRecord
- **packagingId** — reference to Material entity
- **recycledContent%**
- **recyclabilityRating** — per scheme (e.g. Recyclable per APR / Ceflex)
- **weightGrams**

### SupplierESGScorecard
- **vendorId**
- **scope3Tonnes**
- **disclosureCompleteness**
- **sbtiAlignment** — yes/no/in-progress

## HR area

### Employee
- **employeeId**
- **role**
- **plant / dc / territory** (where applicable)
- **shift**
- **skillsTags**

### TrainingRecord
- **employeeId**
- **course**
- **completionDate**
- **competencyLevel**

### SafetyIncident
- **incidentId**
- **type** — recordable, lost-time, near-miss, fatality
- **plant**
- **rootCause**

## IT area

### Application
- **appId**
- **type** — ERP, MES, WMS, TMS, BI, CRM, TPM, PLM, HRIS, etc.
- **vendor**
- **owner**
- **dataDomains** — entities the app is the system of record for
- **slaTier**

### Incident
- **incidentNumber**
- **severity**
- **affectedApps**
- **mttd / mttr**

### AIAgent
- **agentId** — reference to a connector profile in PulsePlay's proxy
- **shape** — chat-completion | conversation | agent | mcp
- **dataAccessScope** — entities and rows the agent is permitted to read
- **auditLogRetentionDays**

## Cross-area relationships (selected)

- Plant (Manufacturing) --producesEmissions--> EmissionsRecord (Sustainability)
- Vendor (Supply) --producesEmissions--> EmissionsRecord (Sustainability, Scope 3 cat. 1)
- Lane / Carrier (Supply) --producesEmissions--> EmissionsRecord (Sustainability, Scope 3 cat. 4 + 9)
- Customer (Customer) --raisesDeduction--> Deduction (Finance)
- Promotion (Commercial) --consumes--> Accrual (Finance) and --settledAs--> Deduction (Finance)
- Batch (Product) --traceableTo--> Material --sourcedFrom--> Vendor (full traceability path)
- Employee (HR) --operatesOn--> Line (Manufacturing) and --reportsIncident--> SafetyIncident

## How agents use this ontology

When a question lands in the AI sidebar (e.g. "Why did our service level drop in the East last week?"):

1. The agent identifies entities mentioned: ServiceLevel (KPI), Region=East (Outlet rollup), TimeWindow=last week.
2. The agent traces relationships to candidate root-cause entities: Order -> Lane / DC / Plant / Customer / Product, plus Promotion (because trade-promo-driven volume spikes routinely trigger fill misses).
3. The agent decides which BI surface holds the certified version of each KPI and routes its question accordingly.
4. The agent's tool calls are bound to the entities defined here so that downstream auditing has a stable vocabulary.
