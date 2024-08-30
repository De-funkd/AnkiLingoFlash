// Use 'browser' instead of 'chrome' for Firefox extensions
const chrome = browser;

// Function to get the clientId from the manifest file
async function getClientIdFromManifest() {
    const manifest = await browser.runtime.getManifest();
    return manifest.oauth2.client_id;
}

const REDIRECT_URL = "https://0cc5b1fe9913cb36d997b9fb5398cf41467f4991.extensions.allizom.org/";

async function authenticateFirefox() {
    console.log("authenticateFirefox function called");
    return new Promise(async (resolve, reject) => {
        const clientId = await getClientIdFromManifest();
        const scopes = ["openid", "email", "profile"];

        const authUrl = new URL("https://accounts.google.com/o/oauth2/auth");
        authUrl.searchParams.set("client_id", clientId);
        authUrl.searchParams.set("response_type", "token");
        authUrl.searchParams.set("redirect_uri", REDIRECT_URL);
        authUrl.searchParams.set("scope", scopes.join(" "));

        browser.identity.launchWebAuthFlow({
            url: authUrl.toString(),
            interactive: true
        }).then(responseUrl => {
            const url = new URL(responseUrl);
            const params = new URLSearchParams(url.hash.slice(1));
            const accessToken = params.get("access_token");
            if (!accessToken) {
                reject(new Error("No access token found"));
            }
            resolve(accessToken);
        }).catch(reject);
    });
}

// Listen for messages from the extension's popup or content scripts
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "login") {
        console.log("Login action received");
        authenticateFirefox().then(token => {
            console.log("Authentication successful, token received");
            fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
                headers: { Authorization: `Bearer ${token}` }
            })
                .then(response => response.json())
                .then(async data => {
                    const userData = await fetchOrInitializeUserData(data.id, data.name, data.email);
                    sendResponse({
                        user: {
                            id: data.id,
                            name: data.name,
                            email: data.email
                        },
                        flashcardCount: userData.flashcardCount,
                        freeGenerationLimit: userData.freeGenerationLimit
                    });
                })
                .catch(error => sendResponse({ error: error.message }));
        }).catch(error => sendResponse({ error: error.message }));
        return true; // Indicates that the response is asynchronous
    } else if (request.action === "logout") {
        browser.storage.sync.get(['userId', 'flashcardCount', 'freeGenerationLimit', 'regenerationLimit']).then(result => {
            const updatedData = {
                userId: result.userId,
                user: null,
                flashcardCount: result.flashcardCount,
                freeGenerationLimit: result.freeGenerationLimit,
                regenerationLimit: result.regenerationLimit
            };
            browser.storage.sync.set(updatedData).then(() => {
                sendResponse({ success: true });
            });
        });
        return true; // Indicates that the response is asynchronous
    }
});