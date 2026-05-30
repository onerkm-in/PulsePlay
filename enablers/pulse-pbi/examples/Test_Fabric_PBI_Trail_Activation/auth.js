// auth.js
// Microsoft Authentication Library (MSAL) setup
// ---------------------------------------------------
// 👉 UPDATE THESE VALUES with your Azure AD app registration
const msalConfig = {
  auth: {
    clientId: "YOUR_CLIENT_ID", // <-- replace with Application (client) ID
    authority: "https://login.microsoftonline.com/YOUR_TENANT_ID", // <-- replace with Directory (tenant) ID
    redirectUri: "https://onedata.co.in/auth/callback", // must match Azure AD app
  },
  cache: {
    cacheLocation: "sessionStorage", // or "localStorage"
    storeAuthStateInCookie: false,
  },
};

// Scopes required for Power BI & Fabric
const loginRequest = {
  scopes: [
    "openid",
    "profile",
    "email",
    "https://analysis.windows.net/powerbi/api/.default", // Power BI
    // "https://fabric.microsoft.com/.default", // uncomment if Fabric scope needed
  ],
};

let msalInstance = new msal.PublicClientApplication(msalConfig);
const loginBtn = document.getElementById("loginBtn");
const output = document.getElementById("output");

function prettyPrint(obj) {
  return JSON.stringify(obj, null, 2);
}

loginBtn.addEventListener("click", async () => {
  try {
    const loginResponse = await msalInstance.loginPopup(loginRequest);
    output.textContent = "✅ Logged in!\n\n" + prettyPrint(loginResponse);
    const tokenResponse = await msalInstance.acquireTokenSilent(loginRequest);
    output.textContent += "\n\n🔑 Access token:\n" + tokenResponse.accessToken;
  } catch (err) {
    console.error(err);
    output.textContent = "❌ Error: " + (err.errorMessage || err.message);
  }
});
