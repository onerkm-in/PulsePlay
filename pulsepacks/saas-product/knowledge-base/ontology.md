# SaaS & Digital Product Ontology

This document captures the domain entity models and their relationships within the SaaS and Digital Products space.

```
+---------------+        1 : N        +------------------+
|   Customer    | ------------------- |   Subscription   |
+---------------+                     +------------------+
        |                                       |
        | 1 : N                                 | 1 : N
        v                                       v
+---------------+                     +------------------+
| CustomerEvent |                     |   BillingEvent   |
+---------------+                     +------------------+

+---------------+        1 : N        +------------------+
|  CloudRegion  | ------------------- |   ComputeNode    |
+---------------+                     +------------------+
```

## Domain Entities

### Customer
- **Description:** Represents a registered customer organization or individual user.
- **Key Attributes:** `customerId` (UUID), `displayName` (string), `segment` (Enterprise | Mid-Market | SMB), `status` (Active | Churned).
- **Relationships:** Has one or many Subscriptions. Has one or many CustomerEvents.

### Subscription
- **Description:** Represents an active recurring agreement for software access.
- **Key Attributes:** `subscriptionId` (UUID), `customerId` (UUID), `tier` (Pro | Enterprise | Free), `arrValue` (decimal), `startDate` (ISO Date), `nextRenewalDate` (ISO Date).
- **Relationships:** Belongs to a Customer. Generates multiple BillingEvents.

### BillingEvent
- **Description:** Represents a financial invoice or payment transaction event.
- **Key Attributes:** `billingEventId` (UUID), `subscriptionId` (UUID), `amount` (decimal), `eventType` (New | Expansion | Contraction | Churn), `timestamp` (ISO Timestamp).
- **Relationships:** Linked to a Subscription.

### CustomerEvent
- **Description:** Captures application usage, feature clicks, or API triggers for retention analysis.
- **Key Attributes:** `eventId` (UUID), `customerId` (UUID), `eventContext` (string), `timestamp` (ISO Timestamp).
- **Relationships:** Linked to a Customer.

### CloudRegion
- **Description:** The geographical and physical hosting zone where cloud servers reside.
- **Key Attributes:** `regionId` (string), `provider` (AWS | GCP | Azure), `gridCarbonIntensity` (gCO2/kWh), `facilityPue` (decimal).
- **Relationships:** Hosts one or many ComputeNodes.

### ComputeNode
- **Description:** An active virtual server or computing resource running application workloads.
- **Key Attributes:** `nodeId` (string), `regionId` (string), `cpuCoreCount` (integer), `averagePowerWatts` (decimal), `runningHours` (decimal).
- **Relationships:** Belongs to a CloudRegion.
