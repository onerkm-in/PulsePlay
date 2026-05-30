---
description: Guided workflow to set up Microsoft login (MSAL) on onedata.co.in hosted on GoDaddy
---

# Guided Workflow: Microsoft Login for Power BI & Fabric Playground

## Prerequisites
1. A **personal Microsoft account** (e.g., `myname@outlook.com`).
2. Access to the **Azure portal** with a **Global Administrator** or **Privileged Role Administrator** role.
3. Your domain `onedata.co.in` is already hosted on **GoDaddy** with **HTTPS** enabled.

---

## Step‑by‑Step Instructions

### 1️⃣ Create (or reuse) a free Azure AD tenant (optional but recommended)
```text
// turbo
1. Sign in to https://portal.azure.com.
2. Search for "Azure Active Directory" → "Create a tenant" → "Azure Active Directory".
3. Give it a name like "OnedataLearningTenant" and complete the wizard.
```
> *If you already have a personal tenant, skip this step.*

### 2️⃣ Register an Azure AD application for authentication
```text
// turbo
1. In the Azure portal, go to **Azure Active Directory → App registrations → New registration**.
2. Name: "OnedataLoginDemo".
3. Supported account types: "Accounts in any organizational directory and personal Microsoft accounts".
4. Redirect URI (Web): https://onedata.co.in/auth/callback
5. Click **Register**.
```
#### Capture the IDs
```text
- Application (client) ID → **CLIENT_ID**
- Directory (tenant) ID → **TENANT_ID**
```

### 3️⃣ Add API permissions
```text
1. In the app registration, select **API permissions → Add a permission**.
2. Choose **Microsoft APIs → Power BI Service** → Delegated permissions → `PowerBIService.ReadWrite.All`.
3. (Optional) Add **Fabric** permission – use the scope `https://fabric.microsoft.com/.default` if available.
4. Add **OpenID**, **profile**, **email** under Microsoft Graph.
5. Click **Grant admin consent for <your tenant>**.
```

### 4️⃣ (Optional) Create a client secret (only needed for server‑side flows)
```text
1. In the app registration, go to **Certificates & secrets**.
2. Click **New client secret**, give it a description, set expiration, and **Add**.
3. Copy the secret value – store it securely.
```
> *For a pure SPA using MSAL‑popup you can skip the secret.*

### 5️⃣ Prepare the front‑end files (already created for you)
- `index.html` – the landing page with a glass‑morphism login button.
- `auth.js` – MSAL configuration and login logic.
- `styles.css` – premium dark‑mode styling.

#### **Action:** Edit `auth.js`
```javascript
const msalConfig = {
  auth: {
    clientId: "YOUR_CLIENT_ID",          // <-- replace
    authority: "https://login.microsoftonline.com/YOUR_TENANT_ID", // <-- replace
    redirectUri: "https://onedata.co.in/auth/callback",
  },
};
```
Replace `YOUR_CLIENT_ID` and `YOUR_TENANT_ID` with the values you captured in step 2.

### 6️⃣ Upload files to GoDaddy
```text
1. Open the GoDaddy File Manager or connect via FTP.
2. Navigate to the root of your site (or a sub‑folder like /lab).
3. Upload **index.html**, **auth.js**, and **styles.css**.
4. Ensure the site is served over **HTTPS** (enable SSL in GoDaddy if not already).
```

### 7️⃣ Test the login flow
```text
1. Open https://onedata.co.in (or the sub‑folder URL) in a browser.
2. Click **Sign in with Microsoft**.
3. A popup should appear – log in with your personal Microsoft account (`myname@outlook.com`).
4. After successful login, the page will display the token in the output box.
```
If you see an error, note the exact message and proceed to the relevant troubleshooting step below.

---

## Troubleshooting Quick‑Reference
| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| **Redirect URI mismatch** | The URI in Azure AD does not exactly match the one in the browser. | Verify the URI in the app registration (including trailing slash) and update `redirectUri` in `auth.js`. |
| **AADSTS50020 – user not found** | The account belongs to a different tenant not allowed by the app. | In the app registration, set **Supported account types** to include "Personal Microsoft accounts". |
| **Popup blocked** | Browser blocked the login popup. | Allow popups for your domain or use `loginRedirect` instead of `loginPopup`. |
| **Access token is empty** | Missing permission consent. | Re‑grant admin consent for the API permissions (Power BI, Fabric). |

---

## 🎉 What’s Next?
- Use the **access token** to call Power BI REST APIs (e.g., embed a report). 
- Explore **Fabric** APIs once the trial is active. 
- Build small projects (see the reference guide) and share them with others.

---

*Feel free to ask for deeper details on any step, or let me know where you get stuck, and I’ll walk you through it.*
